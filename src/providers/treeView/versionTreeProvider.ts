import * as vscode from 'vscode';
import { PackageVersion } from '../../models/packageVersion';
import { ProjectService } from '../../services/projectService';
import { ConfigService } from '../../services/configService';
import { CliExecutor } from '../../services/cliExecutor';
import { CommandBuilder } from '../../services/commandBuilder';
import { PackageTreeItem, TreeItemType } from './packageTreeItems';
import { Logger } from '../../utils/logger';

export class VersionTreeProvider implements vscode.TreeDataProvider<PackageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PackageTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private cliExecutor: CliExecutor;
  private commandBuilder: CommandBuilder;
  private versions: PackageVersion[] = [];

  constructor(
    private projectService: ProjectService,
    private configService: ConfigService
  ) {
    this.cliExecutor = new CliExecutor();
    this.commandBuilder = new CommandBuilder();
  }

  refresh(): void {
    this.versions = []; // Clear cache
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
          'Package Versions',
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
      if (element.label === 'Package Versions') {
        return this.getVersionsFromProject();
      } else if (element.label === 'Actions') {
        return this.getVersionActions();
      }
    }

    if (element.type === TreeItemType.VersionList) {
      return this.getAllVersions();
    }

    return [];
  }

  private getVersionActions(): PackageTreeItem[] {
    return [
      new PackageTreeItem(
        'Create Package Version',
        TreeItemType.Action,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.createVersion',
          title: 'Create Version'
        }
      ),
      new PackageTreeItem(
        'Check Version Creation Status',
        TreeItemType.Action,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.createVersionReport',
          title: 'Check Status'
        }
      ),
      new PackageTreeItem(
        'List All Versions',
        TreeItemType.VersionList,
        vscode.TreeItemCollapsibleState.Collapsed
      )
    ];
  }

  private async getVersionsFromProject(): Promise<PackageTreeItem[]> {
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

    const items: PackageTreeItem[] = [];

    // Get package directories and their versions (loaded in parallel)
    if (project.packageDirectories && project.packageDirectories.length > 0) {
      const aliases = project.packageAliases || {};
      const versionsByDir = await vscode.window.withProgress(
        { location: { viewId: 'sfVersionExplorer' } },
        () => Promise.all(project.packageDirectories.map(dir =>
          aliases[dir.package] ? this.loadVersionsForPackage(aliases[dir.package]) : Promise.resolve([])
        ))
      );

      project.packageDirectories.forEach((dir, dirIndex) => {
        items.push(
          new PackageTreeItem(
            `${dir.package} Versions`,
            TreeItemType.Category,
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            dir.package
          )
        );

        versionsByDir[dirIndex].forEach(version => {
            items.push(
              new PackageTreeItem(
                `  ${version.Name} (${version.MajorVersion}.${version.MinorVersion}.${version.PatchVersion}.${version.BuildNumber})`,
                version.IsReleased ? TreeItemType.ReleasedVersion : TreeItemType.BetaVersion,
                vscode.TreeItemCollapsibleState.None,
                {
                  command: 'sfPackageManager.versionReport',
                  title: 'Show Details',
                  arguments: [version]
                },
                version
              )
            );
        });
      });
    }

    if (items.length === 0) {
      items.push(
        new PackageTreeItem(
          'No package versions found',
          TreeItemType.Info,
          vscode.TreeItemCollapsibleState.None
        )
      );
    }

    return items;
  }

  private async getAllVersions(): Promise<PackageTreeItem[]> {
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

      // Return cached versions if available
      if (this.versions.length > 0) {
        return this.formatVersionItems(this.versions);
      }

      const args = this.commandBuilder.buildPackageVersionList(devHub);
      const result = await vscode.window.withProgress(
        { location: { viewId: 'sfVersionExplorer' } },
        () => this.cliExecutor.execute('sf', args, { label: 'Loading package versions' })
      );

      if (!result.success || !result.data?.result) {
        Logger.error(`Failed to load versions: ${result.error}`);
        return [
          new PackageTreeItem(
            'Failed to load versions',
            TreeItemType.Error,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.refresh',
              title: 'Retry'
            }
          )
        ];
      }

      this.versions = result.data.result;

      if (this.versions.length === 0) {
        return [
          new PackageTreeItem(
            'No versions found',
            TreeItemType.Info,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.createVersion',
              title: 'Create Version'
            }
          )
        ];
      }

      return this.formatVersionItems(this.versions);
    } catch (error) {
      Logger.error(`Error loading versions: ${error}`);
      return [
        new PackageTreeItem(
          `Error: ${error}`,
          TreeItemType.Error,
          vscode.TreeItemCollapsibleState.None
        )
      ];
    }
  }

  private formatVersionItems(versions: PackageVersion[]): PackageTreeItem[] {
    return versions.map(version => {
      const versionNumber = `${version.MajorVersion}.${version.MinorVersion}.${version.PatchVersion}.${version.BuildNumber}`;
      const label = `${version.Name} (${versionNumber})`;
      const status = version.IsReleased ? ' [Released]' : ' [Beta]';

      return new PackageTreeItem(
        label + status,
        version.IsReleased ? TreeItemType.ReleasedVersion : TreeItemType.BetaVersion,
        vscode.TreeItemCollapsibleState.None,
        {
          command: 'sfPackageManager.versionReport',
          title: 'Show Details',
          arguments: [version]
        },
        version
      );
    });
  }

  private async loadVersionsForPackage(packageId: string): Promise<PackageVersion[]> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        return [];
      }

      const args = this.commandBuilder.buildPackageVersionList(devHub, packageId);
      const result = await this.cliExecutor.execute('sf', args);

      if (!result.success || !result.data?.result) {
        return [];
      }

      return result.data.result;
    } catch (error) {
      Logger.error(`Error loading versions for package ${packageId}: ${error}`);
      return [];
    }
  }
}
