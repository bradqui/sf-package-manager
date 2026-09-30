import * as vscode from 'vscode';
import { ConfigService } from '../../services/configService';
import { PackageDataStore } from '../../services/packageDataStore';
import { InstalledPackage } from '../../shared/protocol';
import { PackageTreeItem, TreeItemType } from './packageTreeItems';
import { escapeHtml, scriptJson } from '../../utils/html';
import { Logger } from '../../utils/logger';


export class InstallationTreeProvider implements vscode.TreeDataProvider<PackageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PackageTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private configService: ConfigService,
    private store: PackageDataStore
  ) {}

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PackageTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PackageTreeItem): Promise<PackageTreeItem[]> {
    if (!element) {
      // Root level - show categories
      return [
        new PackageTreeItem(
          'Installed Packages',
          TreeItemType.Category,
          vscode.TreeItemCollapsibleState.Expanded
        ),
        new PackageTreeItem(
          'Actions',
          TreeItemType.Category,
          vscode.TreeItemCollapsibleState.Expanded
        )
      ];
    }

    if (element.type === TreeItemType.Category) {
      if (element.label === 'Installed Packages') {
        return this.getInstalledPackages();
      } else if (element.label === 'Actions') {
        return this.getInstallationActions();
      }
    }

    return [];
  }

  private getInstallationActions(): PackageTreeItem[] {
    return [
      new PackageTreeItem(
        'Install Package',
        TreeItemType.Action,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.installPackage',
          title: 'Install Package'
        }
      ),
      new PackageTreeItem(
        'Check Installation Status',
        TreeItemType.Action,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.installReport',
          title: 'Check Status'
        }
      ),
      new PackageTreeItem(
        'Refresh Installed Packages',
        TreeItemType.Action,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.refresh',
          title: 'Refresh'
        }
      )
    ];
  }

  private async getInstalledPackages(): Promise<PackageTreeItem[]> {
    try {
      const targetOrg = this.configService.getDefaultTargetOrg();
      if (!targetOrg) {
        return [
          new PackageTreeItem(
            'No target org configured',
            TreeItemType.Error,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.openSettings',
              title: 'Open Settings'
            }
          )
        ];
      }

      let installedPackages: InstalledPackage[];
      try {
        installedPackages = await vscode.window.withProgress(
          { location: { viewId: 'sfInstallationExplorer' } },
          () => this.store.getInstalled()
        );
      } catch (error: any) {
        Logger.error(`Failed to load installed packages: ${error.message}`);
        return [
          new PackageTreeItem(
            'Failed to load installed packages (click to retry)',
            TreeItemType.Error,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.refresh',
              title: 'Retry'
            }
          )
        ];
      }

      if (installedPackages.length === 0) {
        return [
          new PackageTreeItem(
            'No packages installed',
            TreeItemType.Info,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.installPackage',
              title: 'Install Package'
            }
          )
        ];
      }

      return this.formatInstalledPackageItems(installedPackages);
    } catch (error) {
      Logger.error(`Error loading installed packages: ${error}`);
      return [
        new PackageTreeItem(
          `Error: ${error}`,
          TreeItemType.Error,
          vscode.TreeItemCollapsibleState.None
        )
      ];
    }
  }

  private formatInstalledPackageItems(packages: InstalledPackage[]): PackageTreeItem[] {
    return packages.map(pkg => {
      const label = `${pkg.SubscriberPackageName} (${pkg.SubscriberPackageVersionNumber})`;

      return new PackageTreeItem(
        label,
        TreeItemType.Package,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.showInstalledPackageDetails',
          title: 'Show Details',
          arguments: [pkg]
        },
        pkg
      );
    });
  }

  async showInstalledPackageDetails(pkg: InstalledPackage): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'installedPackageDetails',
      `Installed Package: ${pkg.SubscriberPackageName}`,
      vscode.ViewColumn.One,
      {}
    );

    const info = [
      `**Name:** ${escapeHtml(pkg.SubscriberPackageName)}`,
      `**Namespace:** ${escapeHtml(pkg.SubscriberPackageNamespace)}`,
      `**Version:** ${escapeHtml(pkg.SubscriberPackageVersionNumber)}`,
      `**Version Name:** ${escapeHtml(pkg.SubscriberPackageVersionName)}`,
      `**Package ID:** ${escapeHtml(pkg.SubscriberPackageId)}`,
      `**Version ID:** ${escapeHtml(pkg.SubscriberPackageVersionId)}`
    ].join('\n\n');

    panel.webview.html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
          }
          h1 { color: var(--vscode-textLink-foreground); }
          .actions {
            margin-top: 20px;
            display: flex;
            gap: 10px;
          }
          button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            border-radius: 2px;
          }
          button:hover {
            background: var(--vscode-button-hoverBackground);
          }
          button.danger {
            background: var(--vscode-errorForeground);
          }
        </style>
      </head>
      <body>
        <h1>Installed Package Details</h1>
        <div>${info.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '<br><br>')}</div>
        <div class="actions">
          <button class="danger" onclick="uninstall()">Uninstall Package</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          function uninstall() {
            if (confirm('Are you sure you want to uninstall this package?')) {
              vscode.postMessage({ command: 'uninstall', packageId: ${scriptJson(pkg.SubscriberPackageVersionId)} });
            }
          }
        </script>
      </body>
      </html>
    `;

    panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'uninstall':
            vscode.commands.executeCommand('sfPackageManager.uninstallPackage', message.packageId);
            panel.dispose();
            break;
        }
      }
    );
  }
}
