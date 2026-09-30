import * as vscode from 'vscode';
import { PackageVersion } from '../../models/packageVersion';
import { ProjectService } from '../../services/projectService';
import { ConfigService } from '../../services/configService';
import { PackageDataStore } from '../../services/packageDataStore';
import { sortVersionsDesc } from '../../shared/versions';
import { PackageTreeItem, TreeItemType } from './packageTreeItems';
import { Logger } from '../../utils/logger';

export class VersionTreeProvider implements vscode.TreeDataProvider<PackageTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PackageTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(
    private projectService: ProjectService,
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

    // Get package directories and their versions (one shared, cached version list)
    if (project.packageDirectories && project.packageDirectories.length > 0) {
      const aliases = project.packageAliases || {};
      const allVersions = await this.loadVersions();
      const versionsByDir = project.packageDirectories.map(dir =>
        sortVersionsDesc(allVersions.filter(v => aliases[dir.package] && v.Package2Id === aliases[dir.package]))
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

      let versions: PackageVersion[];
      try {
        versions = sortVersionsDesc(await vscode.window.withProgress(
          { location: { viewId: 'sfVersionExplorer' } },
          () => this.store.getVersions()
        ));
      } catch (error: any) {
        Logger.error(`Failed to load versions: ${error.message}`);
        return [
          new PackageTreeItem(
            'Failed to load versions (click to retry)',
            TreeItemType.Error,
            vscode.TreeItemCollapsibleState.None,
            {
              command: 'sfPackageManager.refresh',
              title: 'Retry'
            }
          )
        ];
      }

      if (versions.length === 0) {
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

      return this.formatVersionItems(versions);
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

  /** All versions for the Dev Hub (empty if none is selected or loading fails). */
  private async loadVersions(): Promise<PackageVersion[]> {
    if (!this.configService.getDefaultDevHub()) {
      return [];
    }
    try {
      return await vscode.window.withProgress(
        { location: { viewId: 'sfVersionExplorer' } },
        () => this.store.getVersions()
      );
    } catch (error: any) {
      Logger.error(`Error loading versions: ${error.message}`);
      return [];
    }
  }
}
