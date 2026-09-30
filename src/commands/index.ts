import * as vscode from 'vscode';
import { PackageCommands } from './packageCommands';
import { VersionCommands } from './versionCommands';
import { InstallCommands } from './installCommands';
import { CodeNavigationCommands } from './codeNavigationCommands';
import { OrgCommands } from './orgCommands';
import { ScratchOrgCommands } from './scratchOrgCommands';
import { CliExecutor } from '../services/cliExecutor';
import { CommandBuilder } from '../services/commandBuilder';
import { ConfigService } from '../services/configService';
import { ProjectService } from '../services/projectService';
import { CodeNavigationService } from '../services/codeNavigationService';
import { DashboardWebview } from '../providers/webview/dashboardWebview';
import { Logger } from '../utils/logger';

export function registerCommands(
  context: vscode.ExtensionContext,
  services: {
    configService: ConfigService;
    projectService: ProjectService;
  }
): void {
  const cliExecutor = new CliExecutor();
  const commandBuilder = new CommandBuilder();

  const packageCommands = new PackageCommands(
    cliExecutor,
    commandBuilder,
    services.configService,
    services.projectService
  );

  const versionCommands = new VersionCommands(
    cliExecutor,
    commandBuilder,
    services.configService,
    services.projectService
  );

  const installCommands = new InstallCommands(
    cliExecutor,
    commandBuilder,
    services.configService
  );

  const codeNavigationService = new CodeNavigationService(services.projectService);
  const codeNavigationCommands = new CodeNavigationCommands(
    codeNavigationService,
    services.projectService
  );

  const orgCommands = new OrgCommands(
    cliExecutor,
    services.configService
  );

  const scratchOrgCommands = new ScratchOrgCommands(
    cliExecutor,
    commandBuilder,
    services.configService
  );

  const dashboardWebview = new DashboardWebview(
    cliExecutor,
    commandBuilder,
    services.configService
  );

  // Package commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listPackages', async () => {
      Logger.info('List packages command triggered');
      const packages = await packageCommands.listPackages();
      if (packages) {
        vscode.window.showInformationMessage(`Found ${packages.length} package(s)`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createPackage', async () => {
      Logger.info('Create package command triggered');
      await packageCommands.createPackage();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.updatePackage', async (pkg?) => {
      Logger.info('Update package command triggered');
      await packageCommands.updatePackage(pkg);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.deletePackage', async (pkg?) => {
      Logger.info('Delete package command triggered');
      await packageCommands.deletePackage(pkg);
    })
  );

  // Version commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listVersions', async (packageId?) => {
      Logger.info('List versions command triggered');
      const versions = await versionCommands.listVersions(packageId);
      if (versions) {
        vscode.window.showInformationMessage(`Found ${versions.length} version(s)`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createVersion', async (packageId?) => {
      Logger.info('Create version command triggered');
      await versionCommands.createVersionSimple(packageId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createVersionReport', async () => {
      Logger.info('Check version creation status command triggered');
      await versionCommands.checkVersionCreationStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.promoteVersion', async (version?) => {
      Logger.info('Promote version command triggered');
      await versionCommands.promoteVersion(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.deleteVersion', async (version?) => {
      Logger.info('Delete version command triggered');
      await versionCommands.deleteVersion(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.versionReport', async (version?) => {
      Logger.info('Show version report command triggered');
      await versionCommands.showVersionReport(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.displayAncestry', async (version?) => {
      Logger.info('Display ancestry command triggered');
      await versionCommands.displayAncestry(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.displayDependencies', async (version?) => {
      Logger.info('Display dependencies command triggered');
      await versionCommands.displayDependencies(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.compareVersions', async (version1?, version2?) => {
      Logger.info('Compare versions command triggered');
      await versionCommands.compareVersions(version1, version2);
    })
  );

  // Installation commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.installPackage', async (versionId?) => {
      Logger.info('Install package command triggered');
      await installCommands.installPackage(versionId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.installReport', async () => {
      Logger.info('Check installation status command triggered');
      await installCommands.checkInstallStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.uninstallPackage', async (packageId?) => {
      Logger.info('Uninstall package command triggered');
      await installCommands.uninstallPackage(packageId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listInstalled', async () => {
      Logger.info('List installed packages command triggered');
      await installCommands.listInstalled();
    })
  );

  // Code navigation commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.navigateToLWC', async () => {
      Logger.info('Navigate to LWC command triggered');
      await codeNavigationCommands.navigateToLWC();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.navigateToApex', async () => {
      Logger.info('Navigate to Apex command triggered');
      await codeNavigationCommands.navigateToApex();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.navigateToCode', async () => {
      Logger.info('Navigate to Code command triggered');
      await codeNavigationCommands.navigateToCode();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showCodeBrowser', async () => {
      Logger.info('Show code browser command triggered');
      await codeNavigationCommands.showCodeBrowser();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showPackageCode', async (packagePath?) => {
      Logger.info('Show package code command triggered');
      await codeNavigationCommands.showPackageCode(packagePath);
    })
  );

  // Org commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.switchDevHub', async () => {
      Logger.info('Switch Dev Hub command triggered');
      await orgCommands.switchDevHub();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.switchTargetOrg', async () => {
      Logger.info('Switch Target Org command triggered');
      await orgCommands.switchTargetOrg();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showOrgInfo', async () => {
      Logger.info('Show org info command triggered');
      await orgCommands.showOrgInfo();
    })
  );

  // Dashboard command
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.openDashboard', async () => {
      Logger.info('Open dashboard command triggered');
      await dashboardWebview.show();
    })
  );

  // Scratch Org commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createScratchOrg', async () => {
      Logger.info('Create scratch org command triggered');
      await scratchOrgCommands.createScratchOrg();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.deleteScratchOrg', async () => {
      Logger.info('Delete scratch org command triggered');
      await scratchOrgCommands.deleteScratchOrg();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listOrgs', async () => {
      Logger.info('List orgs command triggered');
      await scratchOrgCommands.listOrgs();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.openScratchOrg', async (username?: string) => {
      Logger.info('Open scratch org command triggered');
      await scratchOrgCommands.openScratchOrg(username);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.generateScratchDef', async () => {
      Logger.info('Generate scratch def command triggered');
      await scratchOrgCommands.generateScratchDef();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.setDefaultOrg', async (username?: string) => {
      Logger.info('Set default org command triggered');
      await scratchOrgCommands.setDefaultOrg(username);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createAndInstallPackage', async (versionId?: string) => {
      Logger.info('Create and install package command triggered');
      await scratchOrgCommands.createAndInstallPackage(versionId);
    })
  );

  Logger.info('All commands registered successfully');
}
