import * as vscode from 'vscode';
import { Package } from '../../models/package';
import { ProjectService } from '../../services/projectService';
import { ConfigService } from '../../services/configService';
import { CliExecutor } from '../../services/cliExecutor';
import { CommandBuilder } from '../../services/commandBuilder';
import { PackageTreeItem, TreeItemType } from './packageTreeItems';
import { escapeHtml, scriptJson } from '../../utils/html';
import { Logger } from '../../utils/logger';

export class PackageTreeProvider implements vscode.TreeDataProvider<PackageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PackageTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cliExecutor: CliExecutor;
  private commandBuilder: CommandBuilder;
  private packages: Package[] = [];

  constructor(
    private projectService: ProjectService,
    private configService: ConfigService
  ) {
    this.cliExecutor = new CliExecutor();
    this.commandBuilder = new CommandBuilder();
  }

  refresh(): void {
    this.packages = []; // Clear cache
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
          'Package Management',
          TreeItemType.Category,
          vscode.TreeItemCollapsibleState.Expanded
        ),
        new PackageTreeItem(
          'Current Project',
          TreeItemType.Category,
          vscode.TreeItemCollapsibleState.Expanded
        )
      ];
    }

    if (element.type === TreeItemType.Category) {
      if (element.label === 'Package Management') {
        return this.getPackageManagementActions();
      } else if (element.label === 'Current Project') {
        return this.getCurrentProjectInfo();
      }
    }

    if (element.type === TreeItemType.PackageList) {
      return this.getAllPackages();
    }

    return [];
  }

  private getPackageManagementActions(): PackageTreeItem[] {
    return [
      new PackageTreeItem(
        'Create New Package',
        TreeItemType.Action,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.createPackage',
          title: 'Create Package'
        }
      ),
      new PackageTreeItem(
        'List All Packages',
        TreeItemType.PackageList,
        vscode.TreeItemCollapsibleState.Collapsed
      )
    ];
  }

  private async getCurrentProjectInfo(): Promise<PackageTreeItem[]> {
    const project = await this.projectService.getProject();
    if (!project) {
      return [
        new PackageTreeItem(
          'No sfdx-project.json found',
          TreeItemType.Info,
          vscode.TreeItemCollapsibleState.None
        )
      ];
    }

    const items: PackageTreeItem[] = [
      new PackageTreeItem(
        `Name: ${project.name}`,
        TreeItemType.Info,
        vscode.TreeItemCollapsibleState.None
      )
    ];

    if (project.namespace) {
      items.push(
        new PackageTreeItem(
          `Namespace: ${project.namespace}`,
          TreeItemType.Info,
          vscode.TreeItemCollapsibleState.None
        )
      );
    }

    items.push(
      new PackageTreeItem(
        `API Version: ${project.sourceApiVersion}`,
        TreeItemType.Info,
        vscode.TreeItemCollapsibleState.None
      )
    );

    // Add package directories
    if (project.packageDirectories && project.packageDirectories.length > 0) {
      items.push(
        new PackageTreeItem(
          'Package Directories',
          TreeItemType.Category,
          vscode.TreeItemCollapsibleState.Expanded
        )
      );

      project.packageDirectories.forEach(dir => {
        items.push(
          new PackageTreeItem(
            `${dir.package} (${dir.versionNumber || 'No version'})`,
            TreeItemType.PackageInfo,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.createVersion',
              title: 'Create Version',
              arguments: [dir.package]
            },
            dir
          )
        );
      });
    }

    return items;
  }

  private async getAllPackages(): Promise<PackageTreeItem[]> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        return [
          new PackageTreeItem(
            'No Dev Hub configured',
            TreeItemType.Error,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.openSettings',
              title: 'Open Settings'
            }
          )
        ];
      }

      // Return cached packages if available
      if (this.packages.length > 0) {
        return this.packages.map(pkg =>
          new PackageTreeItem(
            pkg.Name,
            TreeItemType.Package,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.showPackageDetails',
              title: 'Show Details',
              arguments: [pkg]
            },
            pkg
          )
        );
      }

      const args = this.commandBuilder.buildPackageList(devHub);
      const result = await vscode.window.withProgress(
        { location: { viewId: 'sfPackageExplorer' } },
        () => this.cliExecutor.execute('sf', args, { label: 'Loading packages' })
      );

      if (!result.success || !result.data?.result) {
        Logger.error(`Failed to load packages: ${result.error}`);
        return [
          new PackageTreeItem(
            'Failed to load packages',
            TreeItemType.Error,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.refresh',
              title: 'Retry'
            }
          )
        ];
      }

      this.packages = result.data.result;

      if (this.packages.length === 0) {
        return [
          new PackageTreeItem(
            'No packages found',
            TreeItemType.Info,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.createPackage',
              title: 'Create Package'
            }
          )
        ];
      }

      return this.packages.map(pkg =>
        new PackageTreeItem(
          pkg.Name,
          TreeItemType.Package,
          vscode.TreeItemCollapsibleState.None,
          {
            command: 'sfPackageManager.showPackageDetails',
            title: 'Show Details',
            arguments: [pkg]
          },
          pkg
        )
      );
    } catch (error) {
      Logger.error(`Error loading packages: ${error}`);
      return [
        new PackageTreeItem(
          `Error: ${error}`,
          TreeItemType.Error,
          vscode.TreeItemCollapsibleState.None
        )
      ];
    }
  }

  async showPackageDetails(pkg: Package): Promise<void> {
    const panel = vscode.window.createWebviewPanel(
      'packageDetails',
      `Package: ${pkg.Name}`,
      vscode.ViewColumn.One,
      {}
    );

    const info = [
      `**Name:** ${escapeHtml(pkg.Name)}`,
      `**ID:** ${escapeHtml(pkg.Id)}`,
      `**Type:** ${escapeHtml(pkg.ContainerOptions)}`,
      pkg.NamespacePrefix ? `**Namespace:** ${escapeHtml(pkg.NamespacePrefix)}` : '',
      pkg.Description ? `**Description:** ${escapeHtml(pkg.Description)}` : '',
      pkg.IsOrgDependent ? `**Org Dependent:** Yes` : '',
      `**Created:** ${new Date(pkg.CreatedDate).toLocaleString()}`,
      `**Modified:** ${new Date(pkg.ModifiedDate).toLocaleString()}`
    ].filter(line => line).join('\n\n');

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
        </style>
      </head>
      <body>
        <h1>Package Details</h1>
        <div>${info.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '<br><br>')}</div>
        <div class="actions">
          <button onclick="createVersion()">Create Version</button>
          <button onclick="updatePackage()">Update Package</button>
          <button onclick="deletePackage()">Delete Package</button>
        </div>
        <script>
          const vscode = acquireVsCodeApi();
          function createVersion() {
            vscode.postMessage({ command: 'createVersion', packageId: ${scriptJson(pkg.Id)} });
          }
          function updatePackage() {
            vscode.postMessage({ command: 'updatePackage', package: ${scriptJson(pkg)} });
          }
          function deletePackage() {
            vscode.postMessage({ command: 'deletePackage', package: ${scriptJson(pkg)} });
          }
        </script>
      </body>
      </html>
    `;

    panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'createVersion':
            vscode.commands.executeCommand('sfPackageManager.createVersion', message.packageId);
            break;
          case 'updatePackage':
            vscode.commands.executeCommand('sfPackageManager.updatePackage', message.package);
            break;
          case 'deletePackage':
            vscode.commands.executeCommand('sfPackageManager.deletePackage', message.package);
            panel.dispose();
            break;
        }
      }
    );
  }
}
