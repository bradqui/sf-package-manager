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
import { OrgService } from '../services/orgService';
import { PackageDataStore } from '../services/packageDataStore';
import { DashboardPanel } from '../providers/webview/dashboardPanel';
import { DashboardActions } from '../providers/webview/dashboardActions';
import { ViewId } from '../shared/protocol';
import { Logger } from '../utils/logger';

export function registerCommands(
  context: vscode.ExtensionContext,
  services: {
    cliExecutor: CliExecutor;
    configService: ConfigService;
    projectService: ProjectService;
    orgService: OrgService;
    store: PackageDataStore;
  }
): void {
  const cliExecutor = services.cliExecutor;
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

  const dashboard = DashboardPanel.create(context, {
    store: services.store,
    configService: services.configService,
    projectService: services.projectService,
    actions: new DashboardActions(
      cliExecutor,
      commandBuilder,
      services.configService,
      services.orgService,
      services.store,
      scratchOrgCommands
    )
  });

  // Package commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listPackages', async () => {
      Logger.debug('List packages command triggered');
      const packages = await packageCommands.listPackages();
      if (packages) {
        vscode.window.showInformationMessage(`Found ${packages.length} package(s)`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createPackage', async () => {
      Logger.debug('Create package command triggered');
      await packageCommands.createPackage();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.updatePackage', async (pkg?) => {
      Logger.debug('Update package command triggered');
      await packageCommands.updatePackage(pkg);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.deletePackage', async (pkg?) => {
      Logger.debug('Delete package command triggered');
      await packageCommands.deletePackage(pkg);
    })
  );

  // Version commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listVersions', async (packageId?) => {
      Logger.debug('List versions command triggered');
      const versions = await versionCommands.listVersions(packageId);
      if (versions) {
        vscode.window.showInformationMessage(`Found ${versions.length} version(s)`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createVersion', async (packageId?) => {
      Logger.debug('Create version command triggered');
      await versionCommands.createVersionSimple(packageId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createVersionReport', async () => {
      Logger.debug('Check version creation status command triggered');
      await versionCommands.checkVersionCreationStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.promoteVersion', async (version?) => {
      Logger.debug('Promote version command triggered');
      await versionCommands.promoteVersion(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.deleteVersion', async (version?) => {
      Logger.debug('Delete version command triggered');
      await versionCommands.deleteVersion(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.versionReport', async (version?) => {
      Logger.debug('Show version report command triggered');
      await versionCommands.showVersionReport(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.displayAncestry', async (version?) => {
      Logger.debug('Display ancestry command triggered');
      await versionCommands.displayAncestry(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.displayDependencies', async (version?) => {
      Logger.debug('Display dependencies command triggered');
      await versionCommands.displayDependencies(version);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.compareVersions', async (version1?, version2?) => {
      Logger.debug('Compare versions command triggered');
      await versionCommands.compareVersions(version1, version2);
    })
  );

  // Installation commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.installPackage', async (versionId?: string, targetOrg?: string) => {
      Logger.debug('Install package command triggered');
      await installCommands.installPackage(typeof versionId === 'string' ? versionId : undefined, targetOrg);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.installReport', async () => {
      Logger.debug('Check installation status command triggered');
      await installCommands.checkInstallStatus();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.uninstallPackage', async (packageId?) => {
      Logger.debug('Uninstall package command triggered');
      await installCommands.uninstallPackage(packageId);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listInstalled', async () => {
      Logger.debug('List installed packages command triggered');
      await installCommands.listInstalled();
    })
  );

  // Code navigation commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.navigateToLWC', async () => {
      Logger.debug('Navigate to LWC command triggered');
      await codeNavigationCommands.navigateToLWC();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.navigateToApex', async () => {
      Logger.debug('Navigate to Apex command triggered');
      await codeNavigationCommands.navigateToApex();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.navigateToCode', async () => {
      Logger.debug('Navigate to Code command triggered');
      await codeNavigationCommands.navigateToCode();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showCodeBrowser', async () => {
      Logger.debug('Show code browser command triggered');
      await codeNavigationCommands.showCodeBrowser();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showPackageCode', async (packagePath?) => {
      Logger.debug('Show package code command triggered');
      await codeNavigationCommands.showPackageCode(packagePath);
    })
  );

  // Org commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.switchDevHub', async () => {
      Logger.debug('Switch Dev Hub command triggered');
      await orgCommands.switchDevHub();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.switchTargetOrg', async () => {
      Logger.debug('Switch Target Org command triggered');
      await orgCommands.switchTargetOrg();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showOrgInfo', async () => {
      Logger.debug('Show org info command triggered');
      await orgCommands.showOrgInfo();
    })
  );

  // Dashboard command
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.openDashboard', async (view?: ViewId, packageId?: string) => {
      Logger.debug('Open dashboard command triggered');
      await dashboard.show(
        typeof view === 'string' ? view : undefined,
        typeof packageId === 'string' ? packageId : undefined
      );
    })
  );

  // Scratch Org commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createScratchOrg', async () => {
      Logger.debug('Create scratch org command triggered');
      await scratchOrgCommands.createScratchOrg();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.deleteScratchOrg', async () => {
      Logger.debug('Delete scratch org command triggered');
      await scratchOrgCommands.deleteScratchOrg();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.listOrgs', async () => {
      Logger.debug('List orgs command triggered');
      await scratchOrgCommands.listOrgs();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.openScratchOrg', async (username?: string) => {
      Logger.debug('Open scratch org command triggered');
      await scratchOrgCommands.openScratchOrg(username);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.generateScratchDef', async () => {
      Logger.debug('Generate scratch def command triggered');
      await scratchOrgCommands.generateScratchDef();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.setDefaultOrg', async (username?: string) => {
      Logger.debug('Set default org command triggered');
      await scratchOrgCommands.setDefaultOrg(username);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.createAndInstallPackage', async (versionId?: string) => {
      Logger.debug('Create and install package command triggered');
      await scratchOrgCommands.createAndInstallPackage(versionId);
    })
  );

  Logger.debug('All commands registered successfully');
}
