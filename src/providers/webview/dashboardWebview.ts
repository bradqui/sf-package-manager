import * as vscode from 'vscode';
import { CliExecutor } from '../../services/cliExecutor';
import { CommandBuilder } from '../../services/commandBuilder';
import { ConfigService } from '../../services/configService';
import { ProjectService } from '../../services/projectService';
import { ScratchOrgCommands, ScratchDefConfig } from '../../commands/scratchOrgCommands';
import { ScratchOrgCreateRequest, PackageVersion, PackageInstallRequest, PackageVersionCreateRequest } from '../../models/packageVersion';
import { Package, PackageCreateRequest } from '../../models/package';
import { Logger } from '../../utils/logger';
import { ErrorHandler } from '../../utils/errors';

interface UpgradeInfo {
  currentVersionId: string;
  latestVersionId: string;
  latestVersionNumber: string;
  hasUpgrade: boolean;
  targetIsBeta?: boolean;
  currentIsBeta?: boolean;
}

interface DashboardData {
  activeTab: string;
  scratchOrgs: any[];
  packages: Package[];
  versions: PackageVersion[];
  installedPackages: any[];
  upgradeInfo: Map<string, UpgradeInfo>;
  devHub: string;
  targetOrg: string;
  definitionFiles: string[];
  packageDirectories: string[];
}

export class DashboardWebview {
  private panel: vscode.WebviewPanel | undefined;
  private scratchOrgCommands: ScratchOrgCommands;
  private projectService: ProjectService | undefined;

  constructor(
    private cliExecutor: CliExecutor,
    private commandBuilder: CommandBuilder,
    private configService: ConfigService,
    projectService?: ProjectService
  ) {
    this.scratchOrgCommands = new ScratchOrgCommands(
      cliExecutor,
      commandBuilder,
      configService
    );
    this.projectService = projectService;
  }

  async show(initialTab: string = 'scratch-orgs'): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      await this.refreshData(initialTab);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'sfPackageManagerDashboard',
      'SF Package Manager Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    await this.refreshData(initialTab);

    this.panel.webview.onDidReceiveMessage(
      async message => {
        try {
          await this.handleMessage(message);
        } catch (error) {
          ErrorHandler.handle(error, 'Dashboard error');
        }
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private async handleMessage(message: any): Promise<void> {
    switch (message.command) {
      case 'switchTab':
        await this.refreshData(message.tab);
        break;

      case 'refresh':
        await this.refreshData(message.tab || 'scratch-orgs');
        break;

      // Scratch Org commands
      case 'createScratchOrg':
        await this.handleCreateScratchOrg(message.data);
        break;

      case 'deleteScratchOrg':
        await this.handleDeleteScratchOrg(message.username);
        break;

      case 'openScratchOrg':
        await this.scratchOrgCommands.openScratchOrg(message.username);
        await this.refreshData('scratch-orgs');
        break;

      case 'setDefaultOrg':
        await this.scratchOrgCommands.setDefaultOrg(message.username);
        await this.refreshData('scratch-orgs');
        break;

      case 'generateScratchDef':
        await this.handleGenerateScratchDef(message.data);
        break;

      case 'browseDefinitionFile':
        await this.handleBrowseDefinitionFile();
        break;

      case 'previewCommand':
        this.handlePreviewCommand(message.data);
        break;

      // Package commands
      case 'createPackage':
        await this.handleCreatePackage(message.data);
        break;

      case 'deletePackage':
        await this.handleDeletePackage(message.packageId, message.packageName);
        break;

      case 'installLatestVersion':
        await this.handleInstallLatestVersion(message.packageId, message.packageName);
        break;

      // Version commands
      case 'createVersion':
        await this.handleCreateVersion(message.data);
        break;

      case 'promoteVersion':
        await this.handlePromoteVersion(message.versionId);
        break;

      case 'deleteVersion':
        await this.handleDeleteVersion(message.versionId);
        break;

      // Installation commands
      case 'installPackage':
        await this.handleInstallPackage(message.data);
        break;

      case 'uninstallPackage':
        await this.handleUninstallPackage(message.packageId);
        break;

      case 'upgradePackage':
        await this.handleUpgradePackage(message.packageId, message.targetVersionId, message.installationKey);
        break;

      // Settings commands
      case 'switchDevHub':
        await vscode.commands.executeCommand('sfPackageManager.switchDevHub');
        await this.refreshData('settings');
        break;

      case 'switchTargetOrg':
        await vscode.commands.executeCommand('sfPackageManager.switchTargetOrg');
        await this.refreshData('settings');
        break;

      case 'updateSetting':
        await this.handleUpdateSetting(message.setting, message.value);
        break;
    }
  }

  // Scratch Org Handlers
  private async handleCreateScratchOrg(data: any): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      vscode.window.showErrorMessage('No Dev Hub configured. Please set a default Dev Hub first.');
      return;
    }

    const request: ScratchOrgCreateRequest = {
      definitionFile: data.definitionFile,
      devHub: devHub,
      alias: data.alias,
      durationDays: parseInt(data.durationDays) || 7,
      setDefault: data.setDefault === true,
      noAncestors: data.noAncestors === true,
      noNamespace: data.noNamespace === true,
      adminEmail: data.adminEmail || undefined,
      description: data.description || undefined,
      wait: parseInt(data.wait) || 10
    };

    const args = this.commandBuilder.buildScratchOrgCreate(request);
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      `Creating scratch org "${data.alias}"...`
    );

    if (result.success) {
      vscode.window.showInformationMessage(`Scratch org "${data.alias}" created successfully!`);
      await this.refreshData('scratch-orgs');
    } else {
      vscode.window.showErrorMessage(`Failed to create scratch org: ${result.error}`);
    }
  }

  private async handleDeleteScratchOrg(username: string): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Delete scratch org "${username}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return;
    }

    const args = this.commandBuilder.buildOrgDelete(username);
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      `Deleting scratch org "${username}"...`
    );

    if (result.success) {
      vscode.window.showInformationMessage(`Scratch org "${username}" deleted successfully`);
      await this.refreshData('scratch-orgs');
    } else {
      vscode.window.showErrorMessage(`Failed to delete scratch org: ${result.error}`);
    }
  }

  private async handleGenerateScratchDef(data: ScratchDefConfig): Promise<void> {
    const filePath = await this.scratchOrgCommands.generateScratchDef(data);
    if (filePath) {
      await this.refreshData('scratch-orgs');
    }
  }

  private async handleBrowseDefinitionFile(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'JSON': ['json'] },
      defaultUri: workspaceFolders[0].uri
    });

    if (selected && selected.length > 0) {
      const relativePath = vscode.workspace.asRelativePath(selected[0]);
      this.panel?.webview.postMessage({
        command: 'definitionFileSelected',
        path: relativePath
      });
    }
  }

  private handlePreviewCommand(data: any): void {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return;
    }

    const request: ScratchOrgCreateRequest = {
      definitionFile: data.definitionFile || 'config/project-scratch-def.json',
      devHub: devHub,
      alias: data.alias || 'my-scratch-org',
      durationDays: parseInt(data.durationDays) || 7,
      setDefault: data.setDefault === true,
      noAncestors: data.noAncestors === true,
      noNamespace: data.noNamespace === true,
      adminEmail: data.adminEmail || undefined,
      description: data.description || undefined,
      wait: parseInt(data.wait) || 10
    };

    const args = this.commandBuilder.buildScratchOrgCreate(request);
    const preview = this.commandBuilder.previewCommand('sf', args);

    this.panel?.webview.postMessage({
      command: 'commandPreview',
      preview: preview
    });
  }

  // Package Handlers
  private async handleCreatePackage(data: any): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      vscode.window.showErrorMessage('No Dev Hub configured.');
      return;
    }

    const request: PackageCreateRequest = {
      name: data.name,
      packageType: data.packageType,
      path: data.path,
      description: data.description || undefined,
      noNamespace: data.noNamespace === true,
      orgDependent: data.orgDependent === true
    };

    const args = this.commandBuilder.buildPackageCreate(request, devHub);
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      `Creating package "${data.name}"...`
    );

    if (result.success) {
      const packageId = result.data?.result?.Id;
      vscode.window.showInformationMessage(`Package "${data.name}" created! ID: ${packageId}`);
      await this.refreshData('packages');
    } else {
      vscode.window.showErrorMessage(`Failed to create package: ${result.error}`);
    }
  }

  private async handleDeletePackage(packageId: string, packageName: string): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete package "${packageName}" (${packageId})? This cannot be undone.`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return;
    }

    const args = this.commandBuilder.buildPackageDelete(packageId, devHub);
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      `Deleting package "${packageName}"...`
    );

    if (result.success) {
      vscode.window.showInformationMessage(`Package "${packageName}" deleted successfully`);
      await this.refreshData('packages');
    } else {
      vscode.window.showErrorMessage(`Failed to delete package: ${result.error}`);
    }
  }

  private async handleInstallLatestVersion(packageId: string, packageName: string): Promise<void> {
    const targetOrg = this.configService.getDefaultTargetOrg();
    if (!targetOrg) {
      vscode.window.showErrorMessage('No target org configured. Please set a default target org first.');
      return;
    }

    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      vscode.window.showErrorMessage('No Dev Hub configured.');
      return;
    }

    // Get all versions for this package
    const args = this.commandBuilder.buildPackageVersionList(devHub);
    const versionsResult = await this.cliExecutor.execute('sf', args);

    if (!versionsResult.success) {
      vscode.window.showErrorMessage(`Failed to fetch package versions: ${versionsResult.error}`);
      return;
    }

    const allVersions: PackageVersion[] = versionsResult.data?.result || [];

    // Filter versions for this package
    const packageVersions = allVersions
      .filter(v => v.Package2Id === packageId)
      .sort((a, b) => {
        // Sort by version number (major, minor, patch, build) - newest first
        if (a.MajorVersion !== b.MajorVersion) return b.MajorVersion - a.MajorVersion;
        if (a.MinorVersion !== b.MinorVersion) return b.MinorVersion - a.MinorVersion;
        if (a.PatchVersion !== b.PatchVersion) return b.PatchVersion - a.PatchVersion;
        return b.BuildNumber - a.BuildNumber;
      });

    if (packageVersions.length === 0) {
      vscode.window.showWarningMessage(`No versions found for package "${packageName}". Create a version first.`);
      return;
    }

    // Find latest released and latest beta versions
    const latestReleased = packageVersions.find(v => v.IsReleased);
    const latestBeta = packageVersions.find(v => !v.IsReleased);

    // Build version selection options
    const versionOptions: vscode.QuickPickItem[] = [];

    if (latestBeta) {
      const betaVersionStr = `${latestBeta.MajorVersion}.${latestBeta.MinorVersion}.${latestBeta.PatchVersion}.${latestBeta.BuildNumber}`;
      versionOptions.push({
        label: `$(beaker) Latest Beta: ${betaVersionStr}`,
        description: 'For sandbox/scratch orgs only',
        detail: latestBeta.SubscriberPackageVersionId
      });
    }

    if (latestReleased) {
      const releasedVersionStr = `${latestReleased.MajorVersion}.${latestReleased.MinorVersion}.${latestReleased.PatchVersion}.${latestReleased.BuildNumber}`;
      versionOptions.push({
        label: `$(check) Latest Released: ${releasedVersionStr}`,
        description: 'For production and sandbox orgs',
        detail: latestReleased.SubscriberPackageVersionId
      });
    }

    // Add option to see all versions
    versionOptions.push({
      label: '$(list-unordered) Select from all versions...',
      description: `${packageVersions.length} version(s) available`,
      detail: 'all'
    });

    if (versionOptions.length === 1 && versionOptions[0].detail === 'all') {
      // Only "all versions" option available means no versions exist
      vscode.window.showWarningMessage(`No versions found for package "${packageName}".`);
      return;
    }

    // Show quick pick for version selection
    const selectedOption = await vscode.window.showQuickPick(versionOptions, {
      placeHolder: `Select version to install for "${packageName}"`,
      title: 'Install Package Version'
    });

    if (!selectedOption) {
      return;
    }

    let selectedVersion: PackageVersion | undefined;

    if (selectedOption.detail === 'all') {
      // Show all versions
      const allVersionOptions: vscode.QuickPickItem[] = packageVersions.map(v => {
        const versionStr = `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}.${v.BuildNumber}`;
        const status = v.IsReleased ? '$(check) Released' : '$(beaker) Beta';
        return {
          label: `${status} ${versionStr}`,
          description: v.Name || '',
          detail: v.SubscriberPackageVersionId
        };
      });

      const allVersionSelection = await vscode.window.showQuickPick(allVersionOptions, {
        placeHolder: 'Select a version to install',
        title: `All versions of "${packageName}"`
      });

      if (!allVersionSelection) {
        return;
      }

      selectedVersion = packageVersions.find(v => v.SubscriberPackageVersionId === allVersionSelection.detail);
    } else {
      selectedVersion = packageVersions.find(v => v.SubscriberPackageVersionId === selectedOption.detail);
    }

    if (!selectedVersion) {
      vscode.window.showErrorMessage('Could not find selected version.');
      return;
    }

    const versionString = `${selectedVersion.MajorVersion}.${selectedVersion.MinorVersion}.${selectedVersion.PatchVersion}.${selectedVersion.BuildNumber}`;
    const versionType = selectedVersion.IsReleased ? 'Released' : 'Beta';

    // Show warning for beta versions
    if (!selectedVersion.IsReleased) {
      const confirmBeta = await vscode.window.showWarningMessage(
        `You are installing a Beta version (${versionString}) to ${targetOrg}. Beta versions can only be installed to sandbox and scratch orgs, not production. Continue?`,
        'Install Beta',
        'Cancel'
      );
      if (confirmBeta !== 'Install Beta') {
        return;
      }
    } else {
      // Confirm released version installation
      const confirm = await vscode.window.showInformationMessage(
        `Install "${packageName}" ${versionType} version ${versionString} to ${targetOrg}?`,
        'Install',
        'Cancel'
      );
      if (confirm !== 'Install') {
        return;
      }
    }

    const waitMinutes = 10;
    const installRequest: PackageInstallRequest = {
      package: selectedVersion.SubscriberPackageVersionId,
      targetOrg: targetOrg,
      wait: waitMinutes
    };

    const installArgs = this.commandBuilder.buildPackageInstall(installRequest);
    // Timeout should be wait time + 1 minute buffer (in milliseconds)
    const timeoutMs = (waitMinutes + 1) * 60 * 1000;
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      installArgs,
      `Installing "${packageName}" v${versionString} (${versionType}) to ${targetOrg}...`,
      { timeout: timeoutMs }
    );

    if (result.success) {
      vscode.window.showInformationMessage(`Package "${packageName}" v${versionString} installed successfully!`);
    } else {
      vscode.window.showErrorMessage(`Failed to install package: ${result.error}`);
    }
  }

  // Version Handlers
  private async handleCreateVersion(data: any): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      vscode.window.showErrorMessage('No Dev Hub configured.');
      return;
    }

    const waitMinutes = parseInt(data.wait) || 10;
    const request: PackageVersionCreateRequest = {
      package: data.packageId,
      versionName: data.versionName || undefined,
      versionNumber: data.versionNumber || undefined,
      versionDescription: data.versionDescription || undefined,
      installationKeyBypass: data.installationKeyBypass === true,
      installationKey: data.installationKey || undefined,
      codeCoverage: data.codeCoverage === true,
      skipValidation: data.skipValidation === true,
      skipAncestorCheck: data.skipAncestorCheck === true,
      wait: waitMinutes
    };

    const args = this.commandBuilder.buildPackageVersionCreate(request, devHub);
    // Timeout should be wait time + 1 minute buffer (in milliseconds)
    const timeoutMs = (waitMinutes + 1) * 60 * 1000;
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      `Creating package version (waiting up to ${waitMinutes} minutes)...`,
      { timeout: timeoutMs }
    );

    if (result.success) {
      const versionId = result.data?.result?.SubscriberPackageVersionId || result.data?.result?.Id;
      vscode.window.showInformationMessage(`Package version created! ID: ${versionId}`);
      await this.refreshData('versions');
    } else {
      vscode.window.showErrorMessage(`Failed to create version: ${result.error}`);
    }
  }

  private async handlePromoteVersion(versionId: string): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Promote version ${versionId} to Released? This cannot be undone.`,
      { modal: true },
      'Promote'
    );

    if (confirm !== 'Promote') {
      return;
    }

    const args = this.commandBuilder.buildPackageVersionPromote(versionId, devHub);
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      'Promoting package version...'
    );

    if (result.success) {
      vscode.window.showInformationMessage('Package version promoted to Released!');
      await this.refreshData('versions');
    } else {
      vscode.window.showErrorMessage(`Failed to promote version: ${result.error}`);
    }
  }

  private async handleDeleteVersion(versionId: string): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete version ${versionId}?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return;
    }

    const args = this.commandBuilder.buildPackageVersionDelete(versionId, devHub);
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      'Deleting package version...'
    );

    if (result.success) {
      vscode.window.showInformationMessage('Package version deleted successfully');
      await this.refreshData('versions');
    } else {
      vscode.window.showErrorMessage(`Failed to delete version: ${result.error}`);
    }
  }

  // Installation Handlers
  private async handleInstallPackage(data: any): Promise<void> {
    const targetOrg = this.configService.getDefaultTargetOrg();
    if (!targetOrg) {
      vscode.window.showErrorMessage('No target org configured.');
      return;
    }

    const waitMinutes = parseInt(data.wait) || 10;
    const request: PackageInstallRequest = {
      package: data.packageVersionId,
      targetOrg: targetOrg,
      installationKey: data.installationKey || undefined,
      wait: waitMinutes,
      securityType: data.securityType || undefined
    };

    const args = this.commandBuilder.buildPackageInstall(request);
    // Timeout should be wait time + 1 minute buffer (in milliseconds)
    const timeoutMs = (waitMinutes + 1) * 60 * 1000;
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      `Installing package (waiting up to ${waitMinutes} minutes)...`,
      { timeout: timeoutMs }
    );

    if (result.success) {
      vscode.window.showInformationMessage('Package installed successfully!');
      await this.refreshData('installations');
    } else {
      vscode.window.showErrorMessage(`Failed to install package: ${result.error}`);
    }
  }

  private async handleUninstallPackage(packageId: string): Promise<void> {
    const targetOrg = this.configService.getDefaultTargetOrg();
    if (!targetOrg) {
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Uninstall package ${packageId}?`,
      { modal: true },
      'Uninstall'
    );

    if (confirm !== 'Uninstall') {
      return;
    }

    const args = this.commandBuilder.buildPackageUninstall(packageId, targetOrg, 10);
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      'Uninstalling package...'
    );

    if (result.success) {
      vscode.window.showInformationMessage('Package uninstalled successfully');
      await this.refreshData('installations');
    } else {
      vscode.window.showErrorMessage(`Failed to uninstall package: ${result.error}`);
    }
  }

  private async handleUpgradePackage(currentVersionId: string, targetVersionId: string, installationKey?: string): Promise<void> {
    const targetOrg = this.configService.getDefaultTargetOrg();
    if (!targetOrg) {
      vscode.window.showErrorMessage('No target org configured.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Upgrade package to version ${targetVersionId}?`,
      { modal: true },
      'Upgrade'
    );

    if (confirm !== 'Upgrade') {
      return;
    }

    const waitMinutes = 10;
    const request: PackageInstallRequest = {
      package: targetVersionId,
      targetOrg: targetOrg,
      installationKey: installationKey || undefined,
      wait: waitMinutes,
      apexCompile: 'all',
      upgradeType: 'Mixed',
      securityType: 'AdminsOnly'
    };

    const args = this.commandBuilder.buildPackageInstall(request);
    const timeoutMs = (waitMinutes + 1) * 60 * 1000;
    const result = await this.cliExecutor.executeWithProgress(
      'sf',
      args,
      `Upgrading package (waiting up to ${waitMinutes} minutes)...`,
      { timeout: timeoutMs }
    );

    if (result.success) {
      vscode.window.showInformationMessage('Package upgraded successfully!');
      await this.refreshData('installations');
    } else {
      vscode.window.showErrorMessage(`Failed to upgrade package: ${result.error}`);
    }
  }

  // Settings Handler
  private async handleUpdateSetting(setting: string, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('sfPackageManager');
    await config.update(setting, value, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(`Setting "${setting}" updated`);
    await this.refreshData('settings');
  }

  // Data fetching
  private async getPackages(): Promise<Package[]> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) return [];

    try {
      const args = this.commandBuilder.buildPackageList(devHub);
      const result = await this.cliExecutor.execute('sf', args);
      return result.success ? (result.data?.result || []) : [];
    } catch {
      return [];
    }
  }

  private async getVersions(): Promise<PackageVersion[]> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) return [];

    try {
      const args = this.commandBuilder.buildPackageVersionList(devHub);
      const result = await this.cliExecutor.execute('sf', args);
      return result.success ? (result.data?.result || []) : [];
    } catch {
      return [];
    }
  }

  private async getInstalledPackages(): Promise<any[]> {
    const targetOrg = this.configService.getDefaultTargetOrg();
    if (!targetOrg) return [];

    try {
      const args = this.commandBuilder.buildPackageInstalledList(targetOrg);
      const result = await this.cliExecutor.execute('sf', args);
      return result.success ? (result.data?.result || []) : [];
    } catch {
      return [];
    }
  }

  private async getPackageDirectories(): Promise<string[]> {
    try {
      const files = await vscode.workspace.findFiles('**/sfdx-project.json', '**/node_modules/**', 1);
      if (files.length === 0) return ['force-app'];

      const content = await vscode.workspace.fs.readFile(files[0]);
      const project = JSON.parse(content.toString());
      return project.packageDirectories?.map((d: any) => d.path) || ['force-app'];
    } catch {
      return ['force-app'];
    }
  }

  private computeUpgradeInfo(installedPackages: any[], versions: PackageVersion[], packages: Package[]): Map<string, UpgradeInfo> {
    const upgradeInfo = new Map<string, UpgradeInfo>();

    Logger.info(`computeUpgradeInfo: ${installedPackages.length} installed, ${versions.length} versions, ${packages.length} packages`);

    for (const installed of installedPackages) {
      const currentVersionId = installed.SubscriberPackageVersionId;
      const installedPackageName = installed.SubscriberPackageName;

      Logger.info(`Checking installed package: "${installedPackageName}" (${currentVersionId})`);

      // Find the Package2Id from our packages list by matching the package name
      // This is needed because SubscriberPackageId (033...) differs from Package2Id (0Ho...)
      const matchingPackage = packages.find(p => p.Name === installedPackageName);

      if (!matchingPackage) {
        // Package not found in our Dev Hub - might be from another source
        Logger.info(`  No matching package found in Dev Hub for "${installedPackageName}". Available packages: ${packages.map(p => p.Name).join(', ')}`);
        continue;
      }

      const package2Id = matchingPackage.Id;
      Logger.info(`  Found matching package: ${matchingPackage.Name} (${package2Id})`);

      // Find all versions for this package
      const packageVersions = versions
        .filter(v => v.Package2Id === package2Id)
        .sort((a, b) => {
          // Sort by version number (major, minor, patch, build) - newest first
          if (a.MajorVersion !== b.MajorVersion) return b.MajorVersion - a.MajorVersion;
          if (a.MinorVersion !== b.MinorVersion) return b.MinorVersion - a.MinorVersion;
          if (a.PatchVersion !== b.PatchVersion) return b.PatchVersion - a.PatchVersion;
          return b.BuildNumber - a.BuildNumber;
        });

      Logger.info(`  Found ${packageVersions.length} versions for this package`);

      // Find the currently installed version to check if it's a beta
      const currentVersion = packageVersions.find(v => v.SubscriberPackageVersionId === currentVersionId);
      const currentIsBeta = currentVersion ? !currentVersion.IsReleased : false;

      Logger.info(`  Current version is ${currentIsBeta ? 'Beta' : 'Released'}`);

      // Beta packages cannot be upgraded - they must be uninstalled and reinstalled
      // Only allow upgrades from released versions
      if (currentIsBeta) {
        Logger.info(`  Skipping upgrade check - beta packages cannot be upgraded`);
        upgradeInfo.set(currentVersionId, {
          currentVersionId,
          latestVersionId: currentVersionId,
          latestVersionNumber: '',
          hasUpgrade: false,
          targetIsBeta: false,
          currentIsBeta: true
        });
        continue;
      }

      if (packageVersions.length > 0) {
        const latestVersion = packageVersions[0];
        const hasUpgrade = latestVersion.SubscriberPackageVersionId !== currentVersionId;

        Logger.info(`  Latest version: ${latestVersion.SubscriberPackageVersionId} (${latestVersion.IsReleased ? 'Released' : 'Beta'}), current: ${currentVersionId}, hasUpgrade: ${hasUpgrade}`);

        upgradeInfo.set(currentVersionId, {
          currentVersionId,
          latestVersionId: latestVersion.SubscriberPackageVersionId,
          latestVersionNumber: `${latestVersion.MajorVersion}.${latestVersion.MinorVersion}.${latestVersion.PatchVersion}.${latestVersion.BuildNumber}`,
          hasUpgrade,
          targetIsBeta: !latestVersion.IsReleased,
          currentIsBeta: false
        });
      }
    }

    Logger.info(`computeUpgradeInfo result: ${upgradeInfo.size} entries`);
    return upgradeInfo;
  }

  private async refreshData(activeTab: string): Promise<void> {
    if (!this.panel) return;

    // Show loading state
    this.panel.webview.postMessage({ command: 'loading', tab: activeTab });

    const data: DashboardData = {
      activeTab,
      scratchOrgs: [],
      packages: [],
      versions: [],
      installedPackages: [],
      upgradeInfo: new Map<string, UpgradeInfo>(),
      devHub: this.configService.getDefaultDevHub(),
      targetOrg: this.configService.getDefaultTargetOrg(),
      definitionFiles: [],
      packageDirectories: []
    };

    // Load data based on active tab to avoid unnecessary API calls
    switch (activeTab) {
      case 'scratch-orgs':
        data.scratchOrgs = await this.scratchOrgCommands.getScratchOrgs();
        data.definitionFiles = await this.scratchOrgCommands.getDefinitionFiles();
        break;
      case 'packages':
        data.packages = await this.getPackages();
        data.packageDirectories = await this.getPackageDirectories();
        break;
      case 'versions':
        data.packages = await this.getPackages();
        data.versions = await this.getVersions();
        break;
      case 'installations':
        data.installedPackages = await this.getInstalledPackages();
        data.versions = await this.getVersions();
        data.packages = await this.getPackages();
        // Compute upgrade info for each installed package
        // Need packages to map SubscriberPackageId (033...) to Package2Id (0Ho...)
        data.upgradeInfo = this.computeUpgradeInfo(data.installedPackages, data.versions, data.packages);
        break;
      case 'settings':
        // No additional data needed
        break;
    }

    this.panel.webview.html = this.getHtmlContent(data);
  }

  private getHtmlContent(data: DashboardData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF Package Manager Dashboard</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  <div class="dashboard">
    <div class="header">
      <h1>SF Package Manager Dashboard</h1>
      <div class="header-info">
        <span><strong>Dev Hub:</strong> ${data.devHub || 'Not configured'}</span>
        <span><strong>Target Org:</strong> ${data.targetOrg || 'Not set'}</span>
      </div>
    </div>

    <nav class="tab-bar">
      <button class="tab ${data.activeTab === 'scratch-orgs' ? 'active' : ''}" data-tab="scratch-orgs">Scratch Orgs</button>
      <button class="tab ${data.activeTab === 'packages' ? 'active' : ''}" data-tab="packages">Packages</button>
      <button class="tab ${data.activeTab === 'versions' ? 'active' : ''}" data-tab="versions">Versions</button>
      <button class="tab ${data.activeTab === 'installations' ? 'active' : ''}" data-tab="installations">Installations</button>
      <button class="tab ${data.activeTab === 'settings' ? 'active' : ''}" data-tab="settings">Settings</button>
    </nav>

    <div class="tab-content">
      <div id="scratch-orgs" class="tab-pane ${data.activeTab === 'scratch-orgs' ? 'active' : ''}">
        ${this.getScratchOrgsTabHtml(data)}
      </div>

      <div id="packages" class="tab-pane ${data.activeTab === 'packages' ? 'active' : ''}">
        ${this.getPackagesTabHtml(data)}
      </div>

      <div id="versions" class="tab-pane ${data.activeTab === 'versions' ? 'active' : ''}">
        ${this.getVersionsTabHtml(data)}
      </div>

      <div id="installations" class="tab-pane ${data.activeTab === 'installations' ? 'active' : ''}">
        ${this.getInstallationsTabHtml(data)}
      </div>

      <div id="settings" class="tab-pane ${data.activeTab === 'settings' ? 'active' : ''}">
        ${this.getSettingsTabHtml(data)}
      </div>
    </div>
  </div>

  <script>${this.getScripts()}</script>
</body>
</html>`;
  }

  private getStyles(): string {
    return `
    :root {
      --vscode-font-family: var(--vscode-editor-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }
    * { box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      padding: 0; margin: 0;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    .dashboard { display: flex; flex-direction: column; height: 100vh; }
    .header {
      padding: 16px 20px;
      border-bottom: 1px solid var(--vscode-panel-border);
      background: var(--vscode-sideBar-background);
    }
    .header h1 { margin: 0 0 8px 0; font-size: 18px; font-weight: 600; }
    .header-info { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .header-info span { margin-right: 20px; }
    .tab-bar {
      display: flex;
      background: var(--vscode-tab-inactiveBackground);
      border-bottom: 1px solid var(--vscode-panel-border);
      padding: 0 10px;
    }
    .tab {
      padding: 10px 20px; background: transparent; border: none;
      color: var(--vscode-tab-inactiveForeground); cursor: pointer;
      font-size: 13px; border-bottom: 2px solid transparent; transition: all 0.2s;
    }
    .tab:hover {
      color: var(--vscode-tab-activeForeground);
      background: var(--vscode-tab-hoverBackground);
    }
    .tab.active {
      color: var(--vscode-tab-activeForeground);
      background: var(--vscode-tab-activeBackground);
      border-bottom-color: var(--vscode-focusBorder);
    }
    .tab-content { flex: 1; overflow-y: auto; padding: 20px; }
    .tab-pane { display: none; }
    .tab-pane.active { display: block; }
    .section {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 6px; margin-bottom: 20px; overflow: hidden;
    }
    .section-header {
      padding: 12px 16px;
      background: var(--vscode-sideBarSectionHeader-background);
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex; justify-content: space-between; align-items: center;
    }
    .section-header h2 { margin: 0; font-size: 14px; font-weight: 600; }
    .section-content { padding: 16px; }
    .table { width: 100%; border-collapse: collapse; }
    .table th, .table td {
      padding: 10px 12px; text-align: left;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .table th {
      font-weight: 600; font-size: 12px; text-transform: uppercase;
      color: var(--vscode-descriptionForeground);
    }
    .table tr:hover { background: var(--vscode-list-hoverBackground); }
    .table tr:last-child td { border-bottom: none; }
    .status-badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 500;
    }
    .status-active, .status-released { background: var(--vscode-testing-iconPassed); color: white; }
    .status-expired, .status-beta { background: var(--vscode-testing-iconQueued); color: white; }
    .status-default { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
    .status-managed { background: #0176d3; color: white; }
    .status-unlocked { background: #706e6b; color: white; }
    .btn {
      padding: 6px 12px; border: none; border-radius: 4px;
      cursor: pointer; font-size: 12px; transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
    .btn-danger { background: var(--vscode-inputValidation-errorBackground); color: var(--vscode-inputValidation-errorForeground); }
    .btn-success { background: var(--vscode-testing-iconPassed); color: white; }
    .btn-sm { padding: 4px 8px; font-size: 11px; }
    .btn-group { display: flex; gap: 6px; }
    .form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .form-group { display: flex; flex-direction: column; gap: 6px; }
    .form-group.full-width { grid-column: 1 / -1; }
    .form-group label { font-size: 12px; font-weight: 500; color: var(--vscode-foreground); }
    .form-group input, .form-group select, .form-group textarea {
      padding: 8px 10px;
      border: 1px solid var(--vscode-input-border);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border-radius: 4px; font-size: 13px;
    }
    .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
      outline: none; border-color: var(--vscode-focusBorder);
    }
    .form-group .hint { font-size: 11px; color: var(--vscode-descriptionForeground); }
    .checkbox-group { display: flex; flex-wrap: wrap; gap: 12px; }
    .checkbox-item { display: flex; align-items: center; gap: 6px; }
    .checkbox-item input { width: 16px; height: 16px; }
    .form-actions {
      display: flex; gap: 10px; margin-top: 16px; padding-top: 16px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    .command-preview {
      background: var(--vscode-textCodeBlock-background);
      padding: 12px; border-radius: 4px;
      font-family: var(--vscode-editor-font-family);
      font-size: 12px; overflow-x: auto; white-space: pre-wrap;
      word-break: break-all; margin-top: 12px;
    }
    .empty-state {
      text-align: center; padding: 40px 20px;
      color: var(--vscode-descriptionForeground);
    }
    .empty-state p { margin: 8px 0; }
    .features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .setting-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 12px 0; border-bottom: 1px solid var(--vscode-panel-border);
    }
    .setting-row:last-child { border-bottom: none; }
    .setting-info h3 { margin: 0 0 4px 0; font-size: 13px; }
    .setting-info p { margin: 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
    .setting-value { font-size: 13px; color: var(--vscode-foreground); }
    @media (max-width: 800px) {
      .form-grid { grid-template-columns: 1fr; }
      .features-grid { grid-template-columns: repeat(2, 1fr); }
    }`;
  }

  private getScripts(): string {
    return `
    const vscode = acquireVsCodeApi();

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.disabled) return;
        vscode.postMessage({ command: 'switchTab', tab: tab.dataset.tab });
      });
    });

    // Refresh buttons
    document.querySelectorAll('[data-refresh]').forEach(btn => {
      btn.addEventListener('click', () => {
        vscode.postMessage({ command: 'refresh', tab: btn.dataset.refresh });
      });
    });

    // Scratch Org actions
    document.querySelectorAll('.open-org').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ command: 'openScratchOrg', username: btn.dataset.username }));
    });
    document.querySelectorAll('.set-default').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ command: 'setDefaultOrg', username: btn.dataset.username }));
    });
    document.querySelectorAll('.delete-org').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ command: 'deleteScratchOrg', username: btn.dataset.username }));
    });

    // Package actions
    document.querySelectorAll('.install-package').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({
        command: 'installLatestVersion',
        packageId: btn.dataset.packageid,
        packageName: btn.dataset.packagename
      }));
    });
    document.querySelectorAll('.delete-package').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({
        command: 'deletePackage',
        packageId: btn.dataset.packageid,
        packageName: btn.dataset.packagename
      }));
    });

    // Version actions
    document.querySelectorAll('.promote-version').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ command: 'promoteVersion', versionId: btn.dataset.versionid }));
    });
    document.querySelectorAll('.delete-version').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ command: 'deleteVersion', versionId: btn.dataset.versionid }));
    });

    // Installation actions
    document.querySelectorAll('.uninstall-package').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({ command: 'uninstallPackage', packageId: btn.dataset.packageid }));
    });
    document.querySelectorAll('.upgrade-package').forEach(btn => {
      btn.addEventListener('click', () => vscode.postMessage({
        command: 'upgradePackage',
        packageId: btn.dataset.packageid,
        targetVersionId: btn.dataset.targetversionid
      }));
    });

    // Settings actions
    document.getElementById('switchDevHub')?.addEventListener('click', () => vscode.postMessage({ command: 'switchDevHub' }));
    document.getElementById('switchTargetOrg')?.addEventListener('click', () => vscode.postMessage({ command: 'switchTargetOrg' }));

    // Browse definition file
    document.getElementById('browseDefFile')?.addEventListener('click', () => vscode.postMessage({ command: 'browseDefinitionFile' }));

    // Preview command
    document.getElementById('previewCmd')?.addEventListener('click', () => {
      vscode.postMessage({ command: 'previewCommand', data: getCreateOrgFormData() });
    });

    // Form submissions
    document.getElementById('createOrgForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      vscode.postMessage({ command: 'createScratchOrg', data: getCreateOrgFormData() });
    });

    document.getElementById('generateDefForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const features = [];
      document.querySelectorAll('input[name="features"]:checked').forEach(cb => features.push(cb.value));
      vscode.postMessage({
        command: 'generateScratchDef',
        data: {
          orgName: document.getElementById('defOrgName')?.value,
          edition: document.getElementById('defEdition')?.value,
          features: features,
          enableLightningExperience: document.getElementById('defLightning')?.checked
        }
      });
    });

    document.getElementById('createPackageForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      vscode.postMessage({
        command: 'createPackage',
        data: {
          name: document.getElementById('pkgName')?.value,
          packageType: document.getElementById('pkgType')?.value,
          path: document.getElementById('pkgPath')?.value,
          description: document.getElementById('pkgDescription')?.value,
          noNamespace: document.getElementById('pkgNoNamespace')?.checked,
          orgDependent: document.getElementById('pkgOrgDependent')?.checked
        }
      });
    });

    document.getElementById('createVersionForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      vscode.postMessage({
        command: 'createVersion',
        data: {
          packageId: document.getElementById('verPackageId')?.value,
          versionName: document.getElementById('verName')?.value,
          versionNumber: document.getElementById('verNumber')?.value,
          versionDescription: document.getElementById('verDescription')?.value,
          installationKeyBypass: document.getElementById('verKeyBypass')?.checked,
          installationKey: document.getElementById('verKey')?.value,
          codeCoverage: document.getElementById('verCodeCoverage')?.checked,
          skipValidation: document.getElementById('verSkipValidation')?.checked,
          skipAncestorCheck: document.getElementById('verSkipAncestorCheck')?.checked,
          wait: document.getElementById('verWait')?.value
        }
      });
    });

    document.getElementById('installPackageForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      vscode.postMessage({
        command: 'installPackage',
        data: {
          packageVersionId: document.getElementById('instVersionId')?.value,
          installationKey: document.getElementById('instKey')?.value,
          wait: document.getElementById('instWait')?.value,
          securityType: document.getElementById('instSecurityType')?.value
        }
      });
    });

    function getCreateOrgFormData() {
      return {
        definitionFile: document.getElementById('definitionFile')?.value,
        alias: document.getElementById('alias')?.value,
        durationDays: document.getElementById('durationDays')?.value,
        wait: document.getElementById('wait')?.value,
        setDefault: document.getElementById('setDefault')?.checked,
        noAncestors: document.getElementById('noAncestors')?.checked,
        noNamespace: document.getElementById('noNamespace')?.checked,
        adminEmail: document.getElementById('adminEmail')?.value,
        description: document.getElementById('description')?.value
      };
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'definitionFileSelected':
          const defFileInput = document.getElementById('definitionFile');
          if (defFileInput) defFileInput.value = message.path;
          break;
        case 'commandPreview':
          const previewEl = document.getElementById('commandPreview');
          if (previewEl) {
            previewEl.textContent = message.preview;
            previewEl.style.display = 'block';
          }
          break;
      }
    });`;
  }

  private getScratchOrgsTabHtml(data: DashboardData): string {
    const orgsTableRows = data.scratchOrgs.length > 0
      ? data.scratchOrgs.map(org => {
          const isDefault = org.username === data.targetOrg || org.alias === data.targetOrg;
          const expirationDate = org.expirationDate ? new Date(org.expirationDate).toLocaleDateString() : 'N/A';
          const isExpired = org.expirationDate && new Date(org.expirationDate) < new Date();
          return `<tr>
            <td>${org.alias || '-'} ${isDefault ? '<span class="status-badge status-default">Default</span>' : ''}</td>
            <td>${org.username}</td>
            <td><span class="status-badge ${isExpired ? 'status-expired' : 'status-active'}">${isExpired ? 'Expired' : 'Active'}</span></td>
            <td>${expirationDate}</td>
            <td><div class="btn-group">
              <button class="btn btn-primary btn-sm open-org" data-username="${org.username}">Open</button>
              ${!isDefault ? `<button class="btn btn-secondary btn-sm set-default" data-username="${org.username}">Set Default</button>` : ''}
              <button class="btn btn-danger btn-sm delete-org" data-username="${org.username}">Delete</button>
            </div></td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="5" class="empty-state">No scratch orgs found</td></tr>';

    const defOptions = data.definitionFiles.length > 0
      ? data.definitionFiles.map(f => `<option value="${f}">${f}</option>`).join('')
      : '<option value="">No definition files found</option>';

    return `
      <div class="section">
        <div class="section-header"><h2>Scratch Orgs</h2><button class="btn btn-secondary btn-sm" data-refresh="scratch-orgs">Refresh</button></div>
        <div class="section-content" style="padding:0">
          <table class="table"><thead><tr><th>Alias</th><th>Username</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>${orgsTableRows}</tbody></table>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>Create Scratch Org</h2></div>
        <div class="section-content">
          <form id="createOrgForm">
            <div class="form-grid">
              <div class="form-group"><label>Definition File</label><div style="display:flex;gap:8px"><select id="definitionFile" style="flex:1" required>${defOptions}</select><button type="button" id="browseDefFile" class="btn btn-secondary">Browse</button></div></div>
              <div class="form-group"><label>Alias</label><input type="text" id="alias" placeholder="my-scratch-org" pattern="[a-zA-Z0-9_-]+" required><span class="hint">Letters, numbers, hyphens, underscores only</span></div>
              <div class="form-group"><label>Duration</label><select id="durationDays"><option value="1">1 day</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></div>
              <div class="form-group"><label>Wait Time (minutes)</label><input type="number" id="wait" value="10" min="1" max="120"></div>
              <div class="form-group full-width"><label>Options</label><div class="checkbox-group"><label class="checkbox-item"><input type="checkbox" id="setDefault" checked>Set as default</label><label class="checkbox-item"><input type="checkbox" id="noAncestors">No ancestors</label><label class="checkbox-item"><input type="checkbox" id="noNamespace">No namespace</label></div></div>
              <div class="form-group"><label>Admin Email (optional)</label><input type="email" id="adminEmail" placeholder="admin@example.com"></div>
              <div class="form-group"><label>Description (optional)</label><input type="text" id="description" placeholder="Development scratch org"></div>
            </div>
            <div id="commandPreview" class="command-preview" style="display:none"></div>
            <div class="form-actions"><button type="button" id="previewCmd" class="btn btn-secondary">Preview Command</button><button type="submit" class="btn btn-primary">Create Scratch Org</button></div>
          </form>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>Generate Definition File</h2></div>
        <div class="section-content">
          <form id="generateDefForm">
            <div class="form-grid">
              <div class="form-group"><label>Org Name (optional)</label><input type="text" id="defOrgName" placeholder="My Scratch Org"></div>
              <div class="form-group"><label>Edition</label><select id="defEdition" required><option value="Developer" selected>Developer</option><option value="Enterprise">Enterprise</option><option value="Group">Group</option><option value="Professional">Professional</option></select></div>
              <div class="form-group full-width"><label>Features</label><div class="features-grid">
                <label class="checkbox-item"><input type="checkbox" name="features" value="API" checked>API</label>
                <label class="checkbox-item"><input type="checkbox" name="features" value="AuthorApex" checked>AuthorApex</label>
                <label class="checkbox-item"><input type="checkbox" name="features" value="DebugApex" checked>DebugApex</label>
                <label class="checkbox-item"><input type="checkbox" name="features" value="Communities">Communities</label>
                <label class="checkbox-item"><input type="checkbox" name="features" value="MultiCurrency">MultiCurrency</label>
                <label class="checkbox-item"><input type="checkbox" name="features" value="PersonAccounts">PersonAccounts</label>
              </div></div>
              <div class="form-group full-width"><label class="checkbox-item"><input type="checkbox" id="defLightning" checked>Enable Lightning Experience</label></div>
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Generate Definition File</button></div>
          </form>
        </div>
      </div>`;
  }

  private getPackagesTabHtml(data: DashboardData): string {
    const targetOrg = data.targetOrg;
    const packagesRows = data.packages.length > 0
      ? data.packages.map(pkg => `<tr>
          <td>${pkg.Name}</td>
          <td><span class="status-badge ${pkg.ContainerOptions === 'Managed' ? 'status-managed' : 'status-unlocked'}">${pkg.ContainerOptions}</span></td>
          <td>${pkg.Id}</td>
          <td>${pkg.NamespacePrefix || '-'}</td>
          <td><div class="btn-group">
            <button class="btn btn-primary btn-sm install-package" data-packageid="${pkg.Id}" data-packagename="${pkg.Name}" ${!targetOrg ? 'disabled title="No target org configured"' : ''}>Install</button>
            <button class="btn btn-danger btn-sm delete-package" data-packageid="${pkg.Id}" data-packagename="${pkg.Name}">Delete</button>
          </div></td>
        </tr>`).join('')
      : '<tr><td colspan="5" class="empty-state">No packages found. Create one below.</td></tr>';

    const pathOptions = data.packageDirectories.map(p => `<option value="${p}">${p}</option>`).join('');

    return `
      <div class="section">
        <div class="section-header"><h2>Packages</h2><button class="btn btn-secondary btn-sm" data-refresh="packages">Refresh</button></div>
        <div class="section-content" style="padding:0">
          <table class="table"><thead><tr><th>Name</th><th>Type</th><th>ID</th><th>Namespace</th><th>Actions</th></tr></thead><tbody>${packagesRows}</tbody></table>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>Create Package</h2></div>
        <div class="section-content">
          <form id="createPackageForm">
            <div class="form-grid">
              <div class="form-group"><label>Package Name</label><input type="text" id="pkgName" placeholder="MyPackage" required></div>
              <div class="form-group"><label>Package Type</label><select id="pkgType" required><option value="Managed">Managed</option><option value="Unlocked" selected>Unlocked</option></select></div>
              <div class="form-group"><label>Path</label><select id="pkgPath" required>${pathOptions}</select></div>
              <div class="form-group"><label>Description (optional)</label><input type="text" id="pkgDescription" placeholder="Package description"></div>
              <div class="form-group full-width"><label>Options</label><div class="checkbox-group">
                <label class="checkbox-item"><input type="checkbox" id="pkgNoNamespace">No namespace</label>
                <label class="checkbox-item"><input type="checkbox" id="pkgOrgDependent">Org dependent (Unlocked only)</label>
              </div></div>
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Create Package</button></div>
          </form>
        </div>
      </div>`;
  }

  private getVersionsTabHtml(data: DashboardData): string {
    const versionsRows = data.versions.length > 0
      ? data.versions.slice(0, 50).map(ver => {
          const versionNum = `${ver.MajorVersion}.${ver.MinorVersion}.${ver.PatchVersion}.${ver.BuildNumber}`;
          return `<tr>
            <td>${ver.Name || '-'}</td>
            <td>${versionNum}</td>
            <td><span class="status-badge ${ver.IsReleased ? 'status-released' : 'status-beta'}">${ver.IsReleased ? 'Released' : 'Beta'}</span></td>
            <td>${ver.SubscriberPackageVersionId}</td>
            <td>${ver.CodeCoverage !== undefined ? ver.CodeCoverage + '%' : '-'}</td>
            <td><div class="btn-group">
              ${!ver.IsReleased ? `<button class="btn btn-success btn-sm promote-version" data-versionid="${ver.SubscriberPackageVersionId}">Promote</button>` : ''}
              <button class="btn btn-danger btn-sm delete-version" data-versionid="${ver.SubscriberPackageVersionId}">Delete</button>
            </div></td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="6" class="empty-state">No versions found. Create one below.</td></tr>';

    const pkgOptions = data.packages.map(p => `<option value="${p.Id}">${p.Name} (${p.Id})</option>`).join('');

    return `
      <div class="section">
        <div class="section-header"><h2>Package Versions</h2><button class="btn btn-secondary btn-sm" data-refresh="versions">Refresh</button></div>
        <div class="section-content" style="padding:0">
          <table class="table"><thead><tr><th>Name</th><th>Version</th><th>Status</th><th>Subscriber ID</th><th>Coverage</th><th>Actions</th></tr></thead><tbody>${versionsRows}</tbody></table>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>Create Version</h2></div>
        <div class="section-content">
          <form id="createVersionForm">
            <div class="form-grid">
              <div class="form-group"><label>Package</label><select id="verPackageId" required>${pkgOptions || '<option value="">No packages available</option>'}</select></div>
              <div class="form-group"><label>Version Name (optional)</label><input type="text" id="verName" placeholder="Summer '24"></div>
              <div class="form-group"><label>Version Number (optional)</label><input type="text" id="verNumber" placeholder="1.0.0.NEXT"><span class="hint">Format: major.minor.patch.NEXT</span></div>
              <div class="form-group"><label>Description (optional)</label><input type="text" id="verDescription" placeholder="Version description"></div>
              <div class="form-group full-width"><label>Installation Key</label><div class="checkbox-group">
                <label class="checkbox-item"><input type="checkbox" id="verKeyBypass" checked>Bypass (no key required)</label>
              </div><input type="password" id="verKey" placeholder="Installation key (if not bypassing)" style="margin-top:8px"></div>
              <div class="form-group full-width"><label>Options</label><div class="checkbox-group">
                <label class="checkbox-item"><input type="checkbox" id="verCodeCoverage">Calculate code coverage</label>
                <label class="checkbox-item"><input type="checkbox" id="verSkipValidation">Skip validation</label>
                <label class="checkbox-item"><input type="checkbox" id="verSkipAncestorCheck">Skip ancestor check</label>
              </div></div>
              <div class="form-group"><label>Wait Time (minutes)</label><input type="number" id="verWait" value="10" min="0" max="120"></div>
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Create Version</button></div>
          </form>
        </div>
      </div>`;
  }

  private getInstallationsTabHtml(data: DashboardData): string {
    const installedRows = data.installedPackages.length > 0
      ? data.installedPackages.map(pkg => {
          const upgradeInfo = data.upgradeInfo.get(pkg.SubscriberPackageVersionId);
          const hasUpgrade = upgradeInfo?.hasUpgrade || false;
          const currentIsBeta = upgradeInfo?.currentIsBeta || false;
          const targetIsBeta = upgradeInfo?.targetIsBeta || false;

          // Build upgrade button (only shown for released packages that have an upgrade available)
          let upgradeButton = '';
          if (hasUpgrade && !currentIsBeta) {
            const upgradeButtonLabel = targetIsBeta ? 'Upgrade (Beta)' : 'Upgrade';
            const upgradeButtonTitle = targetIsBeta
              ? `Upgrade to v${upgradeInfo?.latestVersionNumber} (Beta - for scratch/sandbox orgs only)`
              : `Upgrade to v${upgradeInfo?.latestVersionNumber}`;
            upgradeButton = `<button class="btn btn-success btn-sm upgrade-package"
                data-packageid="${pkg.SubscriberPackageVersionId}"
                data-targetversionid="${upgradeInfo?.latestVersionId}"
                data-targetversion="${upgradeInfo?.latestVersionNumber}"
                title="${upgradeButtonTitle}">${upgradeButtonLabel}</button>`;
          }

          // Build version display with appropriate badge
          let versionDisplay = pkg.SubscriberPackageVersionNumber || '-';
          if (currentIsBeta) {
            // Show beta badge for currently installed beta versions
            versionDisplay = `${versionDisplay} <span class="status-badge status-beta" style="margin-left:6px" title="Beta packages must be uninstalled to upgrade">Beta</span>`;
          } else if (hasUpgrade) {
            // Show update badge for released packages with available upgrade
            const badgeClass = targetIsBeta ? 'status-beta' : 'status-released';
            const badgeText = targetIsBeta ? 'Beta Available' : 'Update';
            versionDisplay = `${versionDisplay} <span class="status-badge ${badgeClass}" style="margin-left:6px" title="v${upgradeInfo?.latestVersionNumber} available">${badgeText}</span>`;
          }

          return `<tr>
          <td>${pkg.SubscriberPackageName || '-'}</td>
          <td>${versionDisplay}</td>
          <td>${pkg.SubscriberPackageVersionId || '-'}</td>
          <td><div class="btn-group">
            ${upgradeButton}
            <button class="btn btn-danger btn-sm uninstall-package" data-packageid="${pkg.SubscriberPackageVersionId}">Uninstall</button>
          </div></td>
        </tr>`;
        }).join('')
      : '<tr><td colspan="4" class="empty-state">No packages installed in target org</td></tr>';

    const versionOptions = data.versions
      .filter(v => v.IsReleased)
      .map(v => `<option value="${v.SubscriberPackageVersionId}">${v.Name || v.SubscriberPackageVersionId} (${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion})</option>`)
      .join('');

    return `
      <div class="section">
        <div class="section-header"><h2>Installed Packages</h2><button class="btn btn-secondary btn-sm" data-refresh="installations">Refresh</button></div>
        <div class="section-content" style="padding:0">
          <table class="table"><thead><tr><th>Package</th><th>Version</th><th>Version ID</th><th>Actions</th></tr></thead><tbody>${installedRows}</tbody></table>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>Install Package</h2></div>
        <div class="section-content">
          <form id="installPackageForm">
            <div class="form-grid">
              <div class="form-group"><label>Package Version ID</label>
                <input type="text" id="instVersionId" placeholder="04t..." required>
                <span class="hint">Or select from released versions:</span>
                <select id="instVersionSelect" style="margin-top:4px" onchange="document.getElementById('instVersionId').value=this.value">
                  <option value="">-- Select a version --</option>
                  ${versionOptions}
                </select>
              </div>
              <div class="form-group"><label>Installation Key (if required)</label><input type="password" id="instKey" placeholder="Leave empty if not required"></div>
              <div class="form-group"><label>Wait Time (minutes)</label><input type="number" id="instWait" value="10" min="0" max="120"></div>
              <div class="form-group"><label>Security Type</label><select id="instSecurityType"><option value="">Default</option><option value="AllUsers">All Users</option><option value="AdminsOnly">Admins Only</option></select></div>
            </div>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Install Package</button></div>
          </form>
        </div>
      </div>`;
  }

  private getSettingsTabHtml(data: DashboardData): string {
    const config = this.configService.getConfig();
    return `
      <div class="section">
        <div class="section-header"><h2>Org Configuration</h2></div>
        <div class="section-content">
          <div class="setting-row">
            <div class="setting-info"><h3>Default Dev Hub</h3><p>The Dev Hub used for package operations</p></div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="setting-value">${data.devHub || 'Not configured'}</span>
              <button id="switchDevHub" class="btn btn-secondary btn-sm">Change</button>
            </div>
          </div>
          <div class="setting-row">
            <div class="setting-info"><h3>Default Target Org</h3><p>The org used for installations and testing</p></div>
            <div style="display:flex;align-items:center;gap:10px">
              <span class="setting-value">${data.targetOrg || 'Not set'}</span>
              <button id="switchTargetOrg" class="btn btn-secondary btn-sm">Change</button>
            </div>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>Extension Settings</h2></div>
        <div class="section-content">
          <div class="setting-row">
            <div class="setting-info"><h3>Auto Refresh</h3><p>Automatically refresh tree views after command execution</p></div>
            <span class="setting-value">${config.autoRefresh ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div class="setting-row">
            <div class="setting-info"><h3>Show Command Preview</h3><p>Show CLI command preview before execution</p></div>
            <span class="setting-value">${config.showCommandPreview ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div class="setting-row">
            <div class="setting-info"><h3>Default Wait Time</h3><p>Default wait time for package version creation</p></div>
            <span class="setting-value">${config.defaultWaitTime} minutes</span>
          </div>
          <div class="setting-row">
            <div class="setting-info"><h3>Verbose Output</h3><p>Show verbose command output</p></div>
            <span class="setting-value">${config.verboseOutput ? 'Enabled' : 'Disabled'}</span>
          </div>
          <div class="setting-row">
            <div class="setting-info"><h3>Save Command History</h3><p>Save command history for later reference</p></div>
            <span class="setting-value">${config.saveCommandHistory ? 'Enabled' : 'Disabled'}</span>
          </div>
        </div>
      </div>
      <div class="section">
        <div class="section-header"><h2>About</h2></div>
        <div class="section-content">
          <p style="margin:0;color:var(--vscode-descriptionForeground)">SF Package Manager provides comprehensive management of Salesforce Second Generation Packages (2GP) with a visual UI for all package commands.</p>
        </div>
      </div>`;
  }
}
