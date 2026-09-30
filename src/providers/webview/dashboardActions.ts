import * as vscode from 'vscode';
import * as path from 'path';
import { CliExecutor } from '../../services/cliExecutor';
import { CommandBuilder } from '../../services/commandBuilder';
import { ConfigService } from '../../services/configService';
import { OrgService } from '../../services/orgService';
import { PackageDataStore } from '../../services/packageDataStore';
import { ScratchOrgCommands } from '../../commands/scratchOrgCommands';
import { PackageVersion } from '../../models/packageVersion';
import { ErrorHandler } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import {
  CreatePackageForm,
  CreateVersionForm,
  DashboardAction,
  InstallForm,
  ScratchOrgForm
} from '../../shared/protocol';
import { compareVersions, sortVersionsDesc, versionString } from '../../shared/versions';

/** Thrown for problems the user can fix (missing org, invalid input); shown without a stack. */
class UserError extends Error {}

/**
 * Executes dashboard actions. Each handler returns `true`/a result string on
 * success and `false` when the action failed or was cancelled.
 */
export class DashboardActions {
  constructor(
    private readonly cliExecutor: CliExecutor,
    private readonly commandBuilder: CommandBuilder,
    private readonly configService: ConfigService,
    private readonly orgService: OrgService,
    private readonly store: PackageDataStore,
    private readonly scratchOrgCommands: ScratchOrgCommands
  ) {}

  async run(action: DashboardAction): Promise<{ ok: boolean; result?: string }> {
    try {
      const outcome = await this.dispatch(action);
      return typeof outcome === 'string' ? { ok: true, result: outcome } : { ok: outcome !== false };
    } catch (error) {
      if (error instanceof UserError) {
        vscode.window.showWarningMessage(error.message);
      } else {
        ErrorHandler.handle(error, 'Dashboard action failed');
      }
      return { ok: false };
    }
  }

  private async dispatch(action: DashboardAction): Promise<boolean | string | void> {
    switch (action.kind) {
      case 'setDevHub':
        await this.configService.setDefaultDevHub(action.value);
        return;
      case 'setTargetOrg':
        await this.configService.setDefaultTargetOrg(action.value);
        return;
      case 'updateSetting':
        await this.configService.updateSetting(action.key, action.value);
        return;
      case 'copy':
        await vscode.env.clipboard.writeText(action.text);
        vscode.window.setStatusBarMessage(`$(copy) Copied ${action.label}`, 2500);
        return;
      case 'showOutput':
        Logger.show();
        return;
      case 'openSettings':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'sfPackageManager');
        return;
      case 'openFile':
        return this.openWorkspaceFile(action.path);
      case 'createPackage':
        return this.createPackage(action.data);
      case 'deletePackage':
        return this.deletePackage(action.packageId, action.name);
      case 'createVersion':
        return this.createVersion(action.data);
      case 'promoteVersion':
        return this.promoteVersion(action.versionId, action.label);
      case 'deleteVersions':
        return this.deleteVersions(action.versions);
      case 'installVersion':
        return this.installVersion(action.versionId, action.label, action.pickOrg);
      case 'testInScratchOrg':
        await vscode.commands.executeCommand('sfPackageManager.createAndInstallPackage', action.versionId);
        return;
      case 'versionDetails':
        await vscode.commands.executeCommand('sfPackageManager.versionReport', await this.findVersion(action.versionId));
        return;
      case 'versionAncestry':
        await vscode.commands.executeCommand('sfPackageManager.displayAncestry', await this.findVersion(action.versionId));
        return;
      case 'versionDependencies':
        await vscode.commands.executeCommand('sfPackageManager.displayDependencies', await this.findVersion(action.versionId));
        return;
      case 'compareVersion':
        return this.compareVersion(action.versionId);
      case 'installPackage':
        return this.installFromForm(action.data);
      case 'uninstallPackage':
        return this.uninstallPackage(action.versionId, action.name);
      case 'upgradePackage':
        return this.upgradePackage(action.targetVersionId, action.name, action.targetLabel, action.isBeta);
      case 'createScratchOrg':
        return this.createScratchOrg(action.data);
      case 'previewScratchOrg':
        return this.commandBuilder.previewCommand('sf', this.commandBuilder.buildScratchOrgCreate(
          this.scratchOrgRequest(action.data, this.configService.getDefaultDevHub() || '<dev hub>')
        ));
      case 'deleteScratchOrg':
        return this.deleteScratchOrg(action.username, action.label);
      case 'openOrg':
        await this.scratchOrgCommands.openScratchOrg(action.username);
        return;
      case 'generateScratchDef':
        return !!(await this.scratchOrgCommands.generateScratchDef(action.data));
      case 'browseDefinitionFile':
        return this.browseDefinitionFile();
    }
  }

  // ---------- Packages ----------

  private async createPackage(data: CreatePackageForm): Promise<boolean> {
    const devHub = this.requireDevHub();
    if (!data.name?.trim()) {
      throw new UserError('Enter a package name.');
    }

    const args = this.commandBuilder.buildPackageCreate({
      name: data.name.trim(),
      packageType: data.packageType,
      path: data.path,
      description: data.description || undefined,
      noNamespace: data.noNamespace === true,
      orgDependent: data.packageType === 'Unlocked' && data.orgDependent === true
    }, devHub);

    const result = await this.cliExecutor.executeWithProgress('sf', args, `Creating package "${data.name}"...`);
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Failed to create package');
      return false;
    }

    const packageId = result.data?.result?.Id;
    this.notifyWithCopy(`Package "${data.name}" created. sfdx-project.json was updated with its alias.`, packageId, 'package ID');
    return true;
  }

  private async deletePackage(packageId: string, name: string): Promise<boolean> {
    const devHub = this.requireDevHub();
    const confirm = await vscode.window.showWarningMessage(
      `Delete package "${name}"?`,
      { modal: true, detail: `${packageId}\n\nThis cannot be undone. Packages with released versions can't be deleted.` },
      'Delete'
    );
    if (confirm !== 'Delete') {
      return false;
    }

    const result = await this.cliExecutor.executeWithProgress(
      'sf', this.commandBuilder.buildPackageDelete(packageId, devHub), `Deleting package "${name}"...`
    );
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Failed to delete package');
      return false;
    }
    vscode.window.showInformationMessage(`Package "${name}" deleted.`);
    return true;
  }

  // ---------- Versions ----------

  private async createVersion(data: CreateVersionForm): Promise<boolean> {
    const devHub = this.requireDevHub();
    if (!data.package) {
      throw new UserError('Choose a package.');
    }
    if (!data.installationKeyBypass && !data.installationKey) {
      throw new UserError('Enter an installation key, or choose "No installation key".');
    }
    if (data.versionNumber && !/^\d+\.\d+\.\d+\.(NEXT|\d+)$/.test(data.versionNumber)) {
      throw new UserError('Version number must look like 1.2.0.NEXT or 1.2.0.4.');
    }

    const wait = Number.isFinite(data.wait) ? Math.max(0, data.wait) : this.configService.getDefaultWaitTime();
    const args = this.commandBuilder.buildPackageVersionCreate({
      package: data.package,
      versionName: data.versionName || undefined,
      versionNumber: data.versionNumber || undefined,
      versionDescription: data.versionDescription || undefined,
      installationKeyBypass: data.installationKeyBypass,
      installationKey: data.installationKeyBypass ? undefined : data.installationKey,
      codeCoverage: data.codeCoverage === true,
      skipValidation: data.skipValidation === true,
      asyncValidation: data.asyncValidation === true,
      skipAncestorCheck: data.skipAncestorCheck === true,
      branch: data.branch || undefined,
      tag: data.tag || undefined,
      wait
    }, devHub);

    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      wait > 0
        ? `Creating a version of ${data.package} (waiting up to ${wait} min)...`
        : `Starting version creation for ${data.package}...`
    );
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Failed to create package version');
      return false;
    }

    const request = result.data?.result || {};
    if (request.Status === 'Success') {
      this.notifyWithCopy(`New version of ${data.package} created.`, request.SubscriberPackageVersionId, 'version ID');
    } else if (request.Status === 'Error') {
      ErrorHandler.handle((request.Error || []).join('\n') || 'Unknown error', 'Version creation failed');
      return false;
    } else {
      this.notifyWithCopy(
        `Version creation for ${data.package} is ${request.Status || 'in progress'}. It will appear in the list when it finishes; use "Check Version Creation Status" with the request ID to follow it.`,
        request.Id,
        'request ID'
      );
    }
    return true;
  }

  private async promoteVersion(versionId: string, label: string): Promise<boolean> {
    const devHub = this.requireDevHub();
    const confirm = await vscode.window.showWarningMessage(
      `Promote ${label} to Released?`,
      {
        modal: true,
        detail: 'Released versions can be installed in production orgs. This cannot be undone, and the version can no longer be deleted.\n\nPromotion requires the version to have been created with code coverage (75%+) and without skipping validation.'
      },
      'Promote'
    );
    if (confirm !== 'Promote') {
      return false;
    }

    const result = await this.cliExecutor.executeWithProgress(
      'sf', this.commandBuilder.buildPackageVersionPromote(versionId, devHub), `Promoting ${label}...`
    );
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Failed to promote version');
      return false;
    }
    vscode.window.showInformationMessage(`${label} is now released.`);
    return true;
  }

  private async deleteVersions(versions: { versionId: string; label: string }[]): Promise<boolean> {
    const devHub = this.requireDevHub();
    if (versions.length === 0) {
      return false;
    }

    const list = versions.slice(0, 12).map(v => `• ${v.label}`).join('\n') +
      (versions.length > 12 ? `\n…and ${versions.length - 12} more` : '');
    const confirm = await vscode.window.showWarningMessage(
      versions.length === 1 ? `Delete ${versions[0].label}?` : `Delete ${versions.length} beta versions?`,
      { modal: true, detail: `${list}\n\nThis cannot be undone.` },
      'Delete'
    );
    if (confirm !== 'Delete') {
      return false;
    }

    const failures: string[] = [];
    let deleted = 0;
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Deleting versions', cancellable: true },
      async (progress, token) => {
        const controller = new AbortController();
        const subscription = token.onCancellationRequested(() => controller.abort());
        try {
          for (const [index, version] of versions.entries()) {
            if (token.isCancellationRequested) {
              break;
            }
            progress.report({
              message: `${index + 1} of ${versions.length}: ${version.label}`,
              increment: 100 / versions.length
            });
            const result = await this.cliExecutor.execute(
              'sf',
              this.commandBuilder.buildPackageVersionDelete(version.versionId, devHub),
              { label: `Deleting ${version.label}`, signal: controller.signal }
            );
            if (result.success) {
              deleted++;
            } else if (!result.cancelled) {
              failures.push(`${version.label}: ${result.error}`);
            }
          }
        } finally {
          subscription.dispose();
        }
      }
    );

    if (failures.length > 0) {
      ErrorHandler.handle(`${failures.length} of ${versions.length} could not be deleted.\n${failures.join('\n')}`, 'Delete versions');
    } else if (deleted > 0) {
      vscode.window.showInformationMessage(deleted === 1 ? `Deleted ${versions[0].label}.` : `Deleted ${deleted} versions.`);
    }
    return failures.length === 0 && deleted === versions.length;
  }

  private async compareVersion(versionId: string): Promise<boolean> {
    const versions = await this.store.getVersions();
    const base = versions.find(v => v.SubscriberPackageVersionId === versionId);
    if (!base) {
      throw new UserError('That version is no longer in the list. Refresh and try again.');
    }

    const others = sortVersionsDesc(versions.filter(v =>
      v.Package2Id === base.Package2Id && v.SubscriberPackageVersionId !== versionId
    ));
    if (others.length === 0) {
      throw new UserError('This package has no other versions to compare with.');
    }

    const picked = await vscode.window.showQuickPick(
      others.map(v => ({
        label: `${v.IsReleased ? '$(verified)' : '$(beaker)'} ${versionString(v)}`,
        description: v.Name,
        detail: v.SubscriberPackageVersionId,
        version: v
      })),
      { title: `Compare ${versionString(base)} with…`, placeHolder: 'Select a version', matchOnDescription: true, matchOnDetail: true }
    );
    if (!picked) {
      return false;
    }

    // compareVersions expects (older, newer)
    const [older, newer] = compareVersions(base, picked.version) < 0 ? [base, picked.version] : [picked.version, base];
    await vscode.commands.executeCommand('sfPackageManager.compareVersions', older, newer);
    return true;
  }

  private async findVersion(versionId: string): Promise<PackageVersion> {
    const versions = this.store.peek('versions')?.data || [];
    return versions.find(v => v.SubscriberPackageVersionId === versionId)
      || ({ SubscriberPackageVersionId: versionId, Name: versionId } as PackageVersion);
  }

  // ---------- Installs ----------

  private async installVersion(versionId: string, label: string, pickOrg: boolean): Promise<boolean> {
    let targetOrg = this.configService.getDefaultTargetOrg();
    if (pickOrg || !targetOrg) {
      const org = await this.orgService.pickOrg({
        title: `Install ${label}`,
        placeHolder: 'Select the org to install into',
        emptyMessage: 'No orgs found. Authenticate one with "sf org login web".',
        current: targetOrg
      });
      if (!org) {
        return false;
      }
      targetOrg = org.alias || org.username;
    }

    const version = await this.findVersion(versionId);
    const isBeta = version.IsReleased === false;
    const confirm = await vscode.window.showWarningMessage(
      `Install ${label} into ${targetOrg}?`,
      {
        modal: true,
        detail: isBeta
          ? 'This is a beta version. Betas can only be installed in scratch orgs and sandboxes, and can’t be upgraded later — they must be uninstalled first.'
          : 'Released versions can be installed in any org, including production.'
      },
      'Install'
    );
    if (confirm !== 'Install') {
      return false;
    }

    const installationKey = await this.promptForKeyIfNeeded(version);
    if (installationKey === null) {
      return false;
    }

    return this.runInstall({ versionId, targetOrg, installationKey, wait: this.configService.getDefaultWaitTime() }, label);
  }

  private async installFromForm(data: InstallForm): Promise<boolean> {
    const versionId = data.versionId?.trim();
    if (!versionId || !versionId.startsWith('04t')) {
      throw new UserError('Enter a package version ID (starts with 04t).');
    }
    const targetOrg = data.targetOrg || this.configService.getDefaultTargetOrg();
    if (!targetOrg) {
      throw new UserError('Select a target org in the dashboard header first.');
    }
    return this.runInstall({ ...data, versionId, targetOrg }, versionId);
  }

  private async runInstall(data: InstallForm & { targetOrg: string }, label: string): Promise<boolean> {
    const wait = Number.isFinite(data.wait) ? Math.max(0, data.wait) : this.configService.getDefaultWaitTime();
    const args = this.commandBuilder.buildPackageInstall({
      package: data.versionId,
      targetOrg: data.targetOrg,
      installationKey: data.installationKey || undefined,
      wait,
      securityType: data.securityType
    });

    const result = await this.cliExecutor.executeWithProgress(
      'sf', args, `Installing ${label} into ${data.targetOrg}${wait > 0 ? ` (waiting up to ${wait} min)` : ''}...`
    );
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Install failed');
      return false;
    }

    const status = result.data?.result?.Status;
    if (status && status !== 'SUCCESS') {
      vscode.window.showInformationMessage(`Install of ${label} is ${status}. Use "Check Installation Status" to follow it.`);
    } else {
      vscode.window.showInformationMessage(`Installed ${label} into ${data.targetOrg}.`);
    }
    return true;
  }

  private async uninstallPackage(versionId: string, name: string): Promise<boolean> {
    const targetOrg = this.requireTargetOrg();
    const confirm = await vscode.window.showWarningMessage(
      `Uninstall ${name} from ${targetOrg}?`,
      { modal: true, detail: 'The package’s components and their data are removed from the org.' },
      'Uninstall'
    );
    if (confirm !== 'Uninstall') {
      return false;
    }

    const wait = this.configService.getDefaultWaitTime();
    const result = await this.cliExecutor.executeWithProgress(
      'sf', this.commandBuilder.buildPackageUninstall(versionId, targetOrg, wait), `Uninstalling ${name} from ${targetOrg}...`
    );
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Uninstall failed');
      return false;
    }
    vscode.window.showInformationMessage(`Uninstalled ${name} from ${targetOrg}.`);
    return true;
  }

  private async upgradePackage(targetVersionId: string, name: string, targetLabel: string, isBeta: boolean): Promise<boolean> {
    const targetOrg = this.requireTargetOrg();
    const confirm = await vscode.window.showWarningMessage(
      `Upgrade ${name} in ${targetOrg} to ${targetLabel}?`,
      {
        modal: true,
        detail: isBeta
          ? 'This is a beta version: only scratch orgs and sandboxes can install it, and it can’t be upgraded in place later.'
          : 'Components removed from the new version are deleted where possible, otherwise deprecated.'
      },
      'Upgrade'
    );
    if (confirm !== 'Upgrade') {
      return false;
    }

    const version = await this.findVersion(targetVersionId);
    const installationKey = await this.promptForKeyIfNeeded(version);
    if (installationKey === null) {
      return false;
    }

    const wait = this.configService.getDefaultWaitTime();
    const args = this.commandBuilder.buildPackageInstall({
      package: targetVersionId,
      targetOrg,
      installationKey,
      wait,
      apexCompile: 'all',
      upgradeType: 'Mixed',
      securityType: 'AdminsOnly'
    });
    const result = await this.cliExecutor.executeWithProgress(
      'sf', args, `Upgrading ${name} to ${targetLabel} (waiting up to ${wait} min)...`
    );
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Upgrade failed');
      return false;
    }
    vscode.window.showInformationMessage(`Upgraded ${name} to ${targetLabel}.`);
    return true;
  }

  /** undefined = no key needed, null = user cancelled. */
  private async promptForKeyIfNeeded(version: PackageVersion): Promise<string | undefined | null> {
    if (!version.IsPasswordProtected) {
      return undefined;
    }
    const key = await vscode.window.showInputBox({
      title: 'Installation key required',
      prompt: `${versionString(version)} is protected by an installation key`,
      password: true,
      ignoreFocusOut: true
    });
    return key ? key : null;
  }

  // ---------- Scratch orgs ----------

  private scratchOrgRequest(data: ScratchOrgForm, devHub: string) {
    return {
      definitionFile: data.definitionFile,
      devHub,
      alias: data.alias,
      durationDays: data.durationDays || 7,
      setDefault: data.setDefault === true,
      noAncestors: data.noAncestors === true,
      noNamespace: data.noNamespace === true,
      adminEmail: data.adminEmail || undefined,
      description: data.description || undefined,
      wait: data.wait || 10
    };
  }

  private async createScratchOrg(data: ScratchOrgForm): Promise<boolean> {
    const devHub = this.requireDevHub();
    if (!data.definitionFile) {
      throw new UserError('Choose a scratch org definition file.');
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(data.alias || '')) {
      throw new UserError('Alias can only contain letters, numbers, hyphens and underscores.');
    }

    const args = this.commandBuilder.buildScratchOrgCreate(this.scratchOrgRequest(data, devHub));
    const result = await this.cliExecutor.executeWithProgress('sf', args, `Creating scratch org "${data.alias}"...`);
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Failed to create scratch org');
      return false;
    }

    vscode.window.showInformationMessage(`Scratch org "${data.alias}" is ready.`, 'Open in Browser').then(choice => {
      if (choice) {
        this.scratchOrgCommands.openScratchOrg(data.alias);
      }
    });
    return true;
  }

  private async deleteScratchOrg(username: string, label: string): Promise<boolean> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete scratch org "${label}"?`,
      { modal: true, detail: 'The org and all its data are permanently deleted.' },
      'Delete'
    );
    if (confirm !== 'Delete') {
      return false;
    }

    const result = await this.cliExecutor.executeWithProgress(
      'sf', this.commandBuilder.buildOrgDelete(username), `Deleting scratch org "${label}"...`
    );
    if (!result.success) {
      ErrorHandler.handle(result.error, 'Failed to delete scratch org');
      return false;
    }
    vscode.window.showInformationMessage(`Scratch org "${label}" deleted.`);
    return true;
  }

  private async browseDefinitionFile(): Promise<string | false> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'Scratch org definition': ['json'] },
      defaultUri: workspaceFolder?.uri
    });
    return selected?.[0] ? vscode.workspace.asRelativePath(selected[0]) : false;
  }

  // ---------- Helpers ----------

  private async openWorkspaceFile(relativePath: string): Promise<void> {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const uri = path.isAbsolute(relativePath) || !folder
      ? vscode.Uri.file(relativePath)
      : vscode.Uri.joinPath(folder.uri, relativePath);
    await vscode.window.showTextDocument(uri);
  }

  private requireDevHub(): string {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      throw new UserError('Select a Dev Hub in the dashboard header first.');
    }
    return devHub;
  }

  private requireTargetOrg(): string {
    const targetOrg = this.configService.getDefaultTargetOrg();
    if (!targetOrg) {
      throw new UserError('Select a target org in the dashboard header first.');
    }
    return targetOrg;
  }

  private notifyWithCopy(message: string, id: string | undefined, label: string): void {
    if (!id) {
      vscode.window.showInformationMessage(message);
      return;
    }
    vscode.window.showInformationMessage(`${message} (${id})`, `Copy ${label}`).then(choice => {
      if (choice) {
        vscode.env.clipboard.writeText(id);
      }
    });
  }
}
