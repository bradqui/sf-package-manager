import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { ProjectService } from './services/projectService';
import { CliExecutor } from './services/cliExecutor';
import { Logger } from './utils/logger';
import { registerCommands } from './commands';
import { PackageTreeProvider } from './providers/treeView/packageTreeProvider';
import { VersionTreeProvider } from './providers/treeView/versionTreeProvider';
import { InstallationTreeProvider } from './providers/treeView/installationTreeProvider';

export async function activate(context: vscode.ExtensionContext) {
  Logger.info('SF Package Manager activating...');

  // Create output channel
  const outputChannel = vscode.window.createOutputChannel('SF Package Manager');
  context.subscriptions.push(outputChannel);
  Logger.setOutputChannel(outputChannel);

  // Initialize services
  const configService = new ConfigService();
  const projectService = new ProjectService();
  const cliExecutor = new CliExecutor();

  // Check for sfdx-project.json
  const hasSfdxProject = await projectService.hasSfdxProject();
  if (!hasSfdxProject) {
    Logger.warn('No sfdx-project.json found in workspace');
    vscode.window.showWarningMessage(
      'SF Package Manager: No sfdx-project.json found in workspace. This extension works best with Salesforce DX projects.'
    );
  } else {
    const projectName = await projectService.getProjectName();
    Logger.info(`Found Salesforce project: ${projectName}`);
  }

  // Check if SF CLI is available
  const sfCliAvailable = await cliExecutor.checkSfCliAvailable();
  if (!sfCliAvailable) {
    Logger.error('Salesforce CLI (sf) not found in PATH');
    vscode.window.showErrorMessage(
      'SF Package Manager: Salesforce CLI (sf) is not installed or not in PATH. Please install the Salesforce CLI.',
      'Learn More'
    ).then(selection => {
      if (selection === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://developer.salesforce.com/tools/salesforcecli'));
      }
    });
  } else {
    Logger.info('Salesforce CLI (sf) detected');
  }

  // Register tree view providers
  const packageTreeProvider = new PackageTreeProvider(projectService, configService);
  const versionTreeProvider = new VersionTreeProvider(projectService, configService);
  const installationTreeProvider = new InstallationTreeProvider(configService);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sfPackageExplorer', packageTreeProvider),
    vscode.window.registerTreeDataProvider('sfVersionExplorer', versionTreeProvider),
    vscode.window.registerTreeDataProvider('sfInstallationExplorer', installationTreeProvider)
  );

  Logger.info('Tree view providers registered');

  // Register all commands
  registerCommands(context, { configService, projectService });

  // Register tree view refresh commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.refresh', () => {
      Logger.info('Refresh command triggered');
      packageTreeProvider.refresh();
      versionTreeProvider.refresh();
      installationTreeProvider.refresh();
      vscode.window.showInformationMessage('SF Package Manager: Refreshed');
    })
  );

  // Register tree view detail commands
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showPackageDetails', (pkg) => {
      packageTreeProvider.showPackageDetails(pkg);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.showInstalledPackageDetails', (pkg) => {
      installationTreeProvider.showInstalledPackageDetails(pkg);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'sfPackageManager');
    })
  );

  // Show activation message
  Logger.info('SF Package Manager activated successfully');

  // Show status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = '$(package) SF Packages';
  statusBarItem.tooltip = 'SF Package Manager';
  statusBarItem.command = 'sfPackageManager.openSettings';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
}

export function deactivate() {
  Logger.info('SF Package Manager deactivating...');
}
