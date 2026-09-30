import * as vscode from 'vscode';
import { ConfigService } from './services/configService';
import { ProjectService } from './services/projectService';
import { CliExecutor } from './services/cliExecutor';
import { CommandBuilder } from './services/commandBuilder';
import { OrgService } from './services/orgService';
import { PackageDataStore } from './services/packageDataStore';
import { Logger } from './utils/logger';
import { registerCommands } from './commands';
import { PackageTreeProvider } from './providers/treeView/packageTreeProvider';
import { VersionTreeProvider } from './providers/treeView/versionTreeProvider';
import { InstallationTreeProvider } from './providers/treeView/installationTreeProvider';

export async function activate(context: vscode.ExtensionContext) {
  // Log channel: level is controlled by "Developer: Set Log Level..."
  const outputChannel = vscode.window.createOutputChannel('SF Package Manager', { log: true });
  context.subscriptions.push(outputChannel);
  Logger.setOutputChannel(outputChannel);
  Logger.info('SF Package Manager activating...');

  // Initialize services
  const configService = new ConfigService();
  const projectService = new ProjectService();
  const cliExecutor = new CliExecutor();
  const orgService = new OrgService(cliExecutor);
  // Shared cache of packages, versions, installs and orgs for the dashboard and sidebar
  const store = new PackageDataStore(cliExecutor, new CommandBuilder(), configService, orgService);
  context.subscriptions.push(store);

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

  // Check the Salesforce CLI in the background so activation isn't blocked
  cliExecutor.checkSfCliAvailable().then(available => {
    if (available) {
      Logger.info('Salesforce CLI (sf) detected');
      return;
    }
    Logger.error('Salesforce CLI (sf) not found in PATH');
    vscode.window.showErrorMessage(
      'SF Package Manager: Salesforce CLI (sf) is not installed or not in PATH. Please install the Salesforce CLI.',
      'Learn More'
    ).then(selection => {
      if (selection === 'Learn More') {
        vscode.env.openExternal(vscode.Uri.parse('https://developer.salesforce.com/tools/salesforcecli'));
      }
    });
  });

  // Register tree view providers
  const packageTreeProvider = new PackageTreeProvider(projectService, configService, store);
  const versionTreeProvider = new VersionTreeProvider(projectService, configService, store);
  const installationTreeProvider = new InstallationTreeProvider(configService, store);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sfPackageExplorer', packageTreeProvider),
    vscode.window.registerTreeDataProvider('sfVersionExplorer', versionTreeProvider),
    vscode.window.registerTreeDataProvider('sfInstallationExplorer', installationTreeProvider)
  );

  const refreshTrees = () => {
    packageTreeProvider.refresh();
    versionTreeProvider.refresh();
    installationTreeProvider.refresh();
  };

  // Register all commands
  registerCommands(context, { cliExecutor, configService, projectService, orgService, store });

  // Refresh: drop cached data so the sidebar and dashboard both reload from Salesforce
  context.subscriptions.push(
    vscode.commands.registerCommand('sfPackageManager.refresh', () => {
      Logger.debug('Refresh command triggered');
      store.invalidate();
    })
  );

  // Reload the sidebar when data changes. Changes made by commands follow the
  // auto refresh setting; explicit refreshes and org switches always reload.
  let refreshTimer: NodeJS.Timeout | undefined;
  context.subscriptions.push(
    store.onDidChange(change => {
      if (change.reason === 'changed' && !configService.getAutoRefresh()) {
        return;
      }
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshTrees, 400);
    }),
    { dispose: () => clearTimeout(refreshTimer) }
  );

  // Pick up edits to sfdx-project.json without a window reload
  const projectWatcher = vscode.workspace.createFileSystemWatcher('**/sfdx-project.json');
  const onProjectFileChanged = () => {
    Logger.debug('sfdx-project.json changed; reloading project');
    projectService.clearCache();
    refreshTrees();
  };
  projectWatcher.onDidChange(onProjectFileChanged);
  projectWatcher.onDidCreate(onProjectFileChanged);
  projectWatcher.onDidDelete(onProjectFileChanged);
  context.subscriptions.push(projectWatcher);

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

  context.subscriptions.push(createStatusBarItem());

  Logger.info('SF Package Manager activated');
}

/**
 * Status bar item that opens the dashboard, and shows a spinner with the
 * running operation (and elapsed time) while CLI commands are in flight.
 */
function createStatusBarItem(): vscode.Disposable {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.command = 'sfPackageManager.openDashboard';
  let ticker: NodeJS.Timeout | undefined;

  const elapsed = (startedAt: number) => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };
  const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

  const update = () => {
    const running = CliExecutor.getRunningOperations();
    if (running.length === 0) {
      clearInterval(ticker);
      ticker = undefined;
      item.text = '$(package) SF Packages';
      item.tooltip = 'Open the SF Package Manager dashboard';
      return;
    }

    const latest = running[running.length - 1];
    const others = running.length > 1 ? ` (+${running.length - 1})` : '';
    item.text = `$(sync~spin) ${truncate(latest.label, 45)} ${elapsed(latest.startedAt)}${others}`;
    item.tooltip = `Running:\n${running.map(op => `• ${op.label} (${elapsed(op.startedAt)})`).join('\n')}\n\nClick to open the dashboard`;
    if (!ticker) {
      ticker = setInterval(update, 1000);
    }
  };

  const subscription = CliExecutor.onDidChangeRunning(update);
  update();
  item.show();

  return vscode.Disposable.from(item, subscription, { dispose: () => clearInterval(ticker) });
}

export function deactivate() {
  Logger.info('SF Package Manager deactivating...');
}
