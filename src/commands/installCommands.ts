import * as vscode from 'vscode';
import { CliExecutor } from '../services/cliExecutor';
import { CommandBuilder } from '../services/commandBuilder';
import { ConfigService } from '../services/configService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';
import { PackageInstallRequest } from '../models/packageVersion';

export class InstallCommands {
  constructor(
    private cliExecutor: CliExecutor,
    private commandBuilder: CommandBuilder,
    private configService: ConfigService
  ) {}

  async installPackage(versionId?: string): Promise<void> {
    try {
      const targetOrg = this.configService.getDefaultTargetOrg();
      if (!targetOrg) {
        vscode.window.showErrorMessage(
          'No target org configured. Please set sfPackageManager.defaultTargetOrg in settings.'
        );
        return;
      }

      // Get package version ID if not provided
      if (!versionId) {
        versionId = await vscode.window.showInputBox({
          prompt: 'Enter package version ID (04t...)',
          placeHolder: '04t...',
          validateInput: (value) => {
            if (!value || !value.startsWith('04t')) {
              return 'Package version ID must start with 04t';
            }
            return null;
          }
        });
      }

      if (!versionId) {
        return;
      }

      // Ask about installation key
      const installationKeyChoice = await vscode.window.showQuickPick(
        ['No key required', 'Enter installation key'],
        {
          placeHolder: 'Does this package require an installation key?',
          canPickMany: false
        }
      );

      if (!installationKeyChoice) {
        return;
      }

      let installationKey: string | undefined;

      if (installationKeyChoice === 'Enter installation key') {
        installationKey = await vscode.window.showInputBox({
          prompt: 'Enter installation key',
          password: true
        });

        if (!installationKey) {
          return;
        }
      }

      // Get wait time
      const waitTimeInput = await vscode.window.showInputBox({
        prompt: 'Wait time in minutes (0 = no wait)',
        placeHolder: '10',
        value: '10',
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 0 || num > 120) {
            return 'Wait time must be between 0 and 120 minutes';
          }
          return null;
        }
      });

      const waitTime = waitTimeInput ? parseInt(waitTimeInput) : 10;

      // Build request
      const request: PackageInstallRequest = {
        package: versionId,
        targetOrg: targetOrg,
        installationKey: installationKey,
        wait: waitTime
      };

      const args = this.commandBuilder.buildPackageInstall(request);
      const preview = this.commandBuilder.previewCommand('sf', args);

      // Show preview if enabled
      if (this.configService.getShowCommandPreview()) {
        const proceed = await vscode.window.showInformationMessage(
          `Execute command: ${preview}`,
          'Execute',
          'Cancel'
        );

        if (proceed !== 'Execute') {
          return;
        }
      }

      Logger.info(`Installing package: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        waitTime > 0
          ? `Installing package (waiting up to ${waitTime} minutes)...`
          : 'Installing package...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to install package');
        return;
      }

      vscode.window.showInformationMessage(
        `Package ${versionId} installed successfully!`
      );

      Logger.info(`Package installed: ${versionId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error installing package');
    }
  }

  async checkInstallStatus(): Promise<void> {
    try {
      const targetOrg = this.configService.getDefaultTargetOrg();
      if (!targetOrg) {
        vscode.window.showErrorMessage(
          'No target org configured. Please set sfPackageManager.defaultTargetOrg in settings.'
        );
        return;
      }

      const requestId = await vscode.window.showInputBox({
        prompt: 'Enter installation request ID',
        placeHolder: '0Hf...'
      });

      if (!requestId) {
        return;
      }

      const args = this.commandBuilder.buildPackageInstallReport(requestId, targetOrg);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Checking install status: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Checking installation status...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to check installation status');
        return;
      }

      const status = result.data?.result?.Status;
      vscode.window.showInformationMessage(`Installation status: ${status}`);

      Logger.info(`Installation status: ${status}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error checking installation status');
    }
  }

  async uninstallPackage(packageId?: string): Promise<void> {
    try {
      const targetOrg = this.configService.getDefaultTargetOrg();
      if (!targetOrg) {
        vscode.window.showErrorMessage(
          'No target org configured. Please set sfPackageManager.defaultTargetOrg in settings.'
        );
        return;
      }

      // Get package ID if not provided
      if (!packageId) {
        packageId = await vscode.window.showInputBox({
          prompt: 'Enter package version ID to uninstall (04t...)',
          placeHolder: '04t...'
        });
      }

      if (!packageId) {
        return;
      }

      // Confirm uninstallation
      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to uninstall package ${packageId}?`,
        { modal: true },
        'Uninstall',
        'Cancel'
      );

      if (confirmation !== 'Uninstall') {
        return;
      }

      const args = this.commandBuilder.buildPackageUninstall(packageId, targetOrg, 10);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Uninstalling package: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Uninstalling package...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to uninstall package');
        return;
      }

      vscode.window.showInformationMessage(
        `Package ${packageId} uninstalled successfully!`
      );

      Logger.info(`Package uninstalled: ${packageId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error uninstalling package');
    }
  }

  async listInstalled(): Promise<void> {
    try {
      const targetOrg = this.configService.getDefaultTargetOrg();
      if (!targetOrg) {
        vscode.window.showErrorMessage(
          'No target org configured. Please set sfPackageManager.defaultTargetOrg in settings.'
        );
        return;
      }

      const args = this.commandBuilder.buildPackageInstalledList(targetOrg);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Listing installed packages: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Loading installed packages...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to list installed packages');
        return;
      }

      const packages = result.data?.result || [];
      vscode.window.showInformationMessage(`Found ${packages.length} installed package(s)`);

      Logger.info(`Found ${packages.length} installed package(s)`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error listing installed packages');
    }
  }

  /**
   * Upgrade an installed package to a newer version
   * @param installedPackageId The Package2Id (0Ho...) of the currently installed package
   */
  async upgradePackage(installedPackageId?: string): Promise<void> {
    try {
      Logger.info('Starting package upgrade wizard');

      const targetOrg = this.configService.getDefaultTargetOrg();
      if (!targetOrg) {
        vscode.window.showErrorMessage(
          'No target org configured. Please set a default target org first.'
        );
        return;
      }

      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage('No Dev Hub configured');
        return;
      }

      // Get installed packages
      const installedArgs = this.commandBuilder.buildPackageInstalledList(targetOrg);
      const installedResult = await this.cliExecutor.execute('sf', installedArgs);

      if (!installedResult.success || !installedResult.data?.result) {
        throw new Error('Failed to get installed packages');
      }

      const installedPackages = installedResult.data.result;

      if (installedPackages.length === 0) {
        vscode.window.showInformationMessage('No packages installed in target org');
        return;
      }

      // Let user select which installed package to upgrade
      let selectedInstalled: any;

      if (installedPackageId) {
        selectedInstalled = installedPackages.find(
          (pkg: any) => pkg.SubscriberPackageId === installedPackageId
        );
      } else {
        interface InstalledPackageItem extends vscode.QuickPickItem {
          packageData: any;
        }

        const installedItems: InstalledPackageItem[] = installedPackages.map((pkg: any) => ({
          label: pkg.SubscriberPackageName,
          description: `v${pkg.SubscriberPackageVersionNumber}`,
          detail: `Current: ${pkg.SubscriberPackageVersionId} | Namespace: ${pkg.SubscriberPackageNamespace || 'None'}`,
          packageData: pkg
        }));

        const selected = await vscode.window.showQuickPick<InstalledPackageItem>(installedItems, {
          placeHolder: 'Select package to upgrade'
        });

        if (!selected) {
          return;
        }

        selectedInstalled = selected.packageData;
      }

      if (!selectedInstalled) {
        vscode.window.showErrorMessage('Package not found in installed packages');
        return;
      }

      // Get available versions for this package
      const package2Id = selectedInstalled.SubscriberPackageId;
      const versionsArgs = this.commandBuilder.buildPackageVersionList(devHub, package2Id);
      const versionsResult = await this.cliExecutor.execute('sf', versionsArgs);

      if (!versionsResult.success || !versionsResult.data?.result) {
        throw new Error('Failed to get package versions');
      }

      const versions = versionsResult.data.result;
      const currentVersionId = selectedInstalled.SubscriberPackageVersionId;

      // Filter to only released versions that are newer
      const releasedVersions = versions.filter(
        (v: any) => v.IsReleased && v.SubscriberPackageVersionId !== currentVersionId
      );

      if (releasedVersions.length === 0) {
        vscode.window.showInformationMessage(
          `No newer versions available for ${selectedInstalled.SubscriberPackageName}`
        );
        return;
      }

      // Let user select version to upgrade to
      interface VersionItem extends vscode.QuickPickItem {
        versionId: string;
      }

      const versionItems: VersionItem[] = releasedVersions.map((v: any) => ({
        label: `${v.Name || 'Unnamed'} (${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}.${v.BuildNumber})`,
        description: v.IsReleased ? '✅ Released' : '🔷 Beta',
        detail: `Version ID: ${v.SubscriberPackageVersionId} | Created: ${new Date(v.CreatedDate).toLocaleDateString()}`,
        versionId: v.SubscriberPackageVersionId
      }));

      const selectedVersion = await vscode.window.showQuickPick<VersionItem>(versionItems, {
        placeHolder: `Select version to upgrade ${selectedInstalled.SubscriberPackageName} to`
      });

      if (!selectedVersion) {
        return;
      }

      // Ask about installation key
      const installationKeyChoice = await vscode.window.showQuickPick(
        ['No key required', 'Enter installation key'],
        {
          placeHolder: 'Does this upgrade require an installation key?'
        }
      );

      if (!installationKeyChoice) {
        return;
      }

      let installationKey: string | undefined;

      if (installationKeyChoice === 'Enter installation key') {
        installationKey = await vscode.window.showInputBox({
          prompt: 'Enter installation key',
          password: true
        });

        if (!installationKey) {
          return;
        }
      }

      // Build upgrade request (using install command with upgrade-type)
      const request: PackageInstallRequest = {
        package: selectedVersion.versionId,
        targetOrg: targetOrg,
        installationKey: installationKey,
        wait: 10,
        publishWait: 5,
        apexCompile: 'all',
        upgradeType: 'Mixed',
        securityType: 'AdminsOnly'
      };

      const args = this.commandBuilder.buildPackageInstall(request);
      const preview = this.commandBuilder.previewCommand('sf', args);

      // Confirm upgrade
      const confirm = await vscode.window.showInformationMessage(
        `Upgrade ${selectedInstalled.SubscriberPackageName} to version ${selectedVersion.label}?`,
        { detail: `Target Org: ${targetOrg}\n\nCommand: ${preview}`, modal: true },
        'Upgrade'
      );

      if (confirm !== 'Upgrade') {
        return;
      }

      Logger.info(`Upgrading package: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        `Upgrading ${selectedInstalled.SubscriberPackageName}...`
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Package upgrade failed');
        return;
      }

      vscode.window.showInformationMessage(
        `Package upgraded successfully to ${selectedVersion.label}!`
      );

      Logger.info(`Package upgraded: ${selectedInstalled.SubscriberPackageName}`);

      // Refresh tree views
      await vscode.commands.executeCommand('sfPackageManager.refreshAll');
    } catch (error) {
      ErrorHandler.handle(error, 'Error upgrading package');
    }
  }

  /**
   * Quick upgrade: Upgrade to latest released version
   * @param installedPackageId The Package2Id (0Ho...) of the currently installed package
   */
  async upgradeToLatest(installedPackageId: string): Promise<void> {
    try {
      Logger.info('Starting quick upgrade to latest version');

      const targetOrg = this.configService.getDefaultTargetOrg();
      if (!targetOrg) {
        vscode.window.showErrorMessage('No target org configured');
        return;
      }

      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage('No Dev Hub configured');
        return;
      }

      // Get installed package info
      const installedArgs = this.commandBuilder.buildPackageInstalledList(targetOrg);
      const installedResult = await this.cliExecutor.execute('sf', installedArgs);

      if (!installedResult.success || !installedResult.data?.result) {
        throw new Error('Failed to get installed packages');
      }

      const installedPackage = installedResult.data.result.find(
        (pkg: any) => pkg.SubscriberPackageId === installedPackageId
      );

      if (!installedPackage) {
        vscode.window.showErrorMessage('Package not found in installed packages');
        return;
      }

      // Get latest released version
      const versionsArgs = this.commandBuilder.buildPackageVersionList(devHub, installedPackageId);
      const versionsResult = await this.cliExecutor.execute('sf', versionsArgs);

      if (!versionsResult.success || !versionsResult.data?.result) {
        throw new Error('Failed to get package versions');
      }

      const versions = versionsResult.data.result;
      const releasedVersions = versions.filter((v: any) => v.IsReleased);

      if (releasedVersions.length === 0) {
        vscode.window.showInformationMessage('No released versions available');
        return;
      }

      // Sort by version number to get latest
      const latestVersion = releasedVersions.sort((a: any, b: any) => {
        if (a.MajorVersion !== b.MajorVersion) return b.MajorVersion - a.MajorVersion;
        if (a.MinorVersion !== b.MinorVersion) return b.MinorVersion - a.MinorVersion;
        if (a.PatchVersion !== b.PatchVersion) return b.PatchVersion - a.PatchVersion;
        return b.BuildNumber - a.BuildNumber;
      })[0];

      // Check if already on latest
      if (latestVersion.SubscriberPackageVersionId === installedPackage.SubscriberPackageVersionId) {
        vscode.window.showInformationMessage(
          `${installedPackage.SubscriberPackageName} is already on the latest version!`
        );
        return;
      }

      // Confirm upgrade
      const versionString = `${latestVersion.MajorVersion}.${latestVersion.MinorVersion}.${latestVersion.PatchVersion}.${latestVersion.BuildNumber}`;
      const confirm = await vscode.window.showInformationMessage(
        `Upgrade ${installedPackage.SubscriberPackageName} to latest version ${versionString}?`,
        { modal: true },
        'Upgrade'
      );

      if (confirm !== 'Upgrade') {
        return;
      }

      // Build upgrade request
      const request: PackageInstallRequest = {
        package: latestVersion.SubscriberPackageVersionId,
        targetOrg: targetOrg,
        wait: 10,
        publishWait: 5,
        apexCompile: 'all',
        upgradeType: 'Mixed',
        securityType: 'AdminsOnly'
      };

      const args = this.commandBuilder.buildPackageInstall(request);
      const preview = this.commandBuilder.previewCommand('sf', args);

      Logger.info(`Upgrading to latest: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        `Upgrading to ${versionString}...`
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Package upgrade failed');
        return;
      }

      vscode.window.showInformationMessage(
        `Successfully upgraded to version ${versionString}!`
      );

      Logger.info(`Package upgraded to latest: ${versionString}`);

      // Refresh tree views
      await vscode.commands.executeCommand('sfPackageManager.refreshAll');
    } catch (error) {
      ErrorHandler.handle(error, 'Error upgrading to latest version');
    }
  }
}
