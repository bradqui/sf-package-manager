import * as vscode from 'vscode';
import { Package, PackageDirectory } from '../../models/package';
import { PackageVersion } from '../../models/packageVersion';

export enum TreeItemType {
  Category = 'category',
  Action = 'action',
  Package = 'package',
  PackageInfo = 'packageInfo',
  Version = 'version',
  BetaVersion = 'betaVersion',
  ReleasedVersion = 'releasedVersion',
  Info = 'info',
  Error = 'error',
  PackageList = 'packageList',
  VersionList = 'versionList'
}

export class PackageTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly type: TreeItemType,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly command?: vscode.Command,
    public readonly data?: any
  ) {
    super(label, collapsibleState);

    this.contextValue = type;
    this.tooltip = this.getTooltip();
    this.iconPath = this.getIcon();
  }

  private getTooltip(): string {
    switch (this.type) {
      case TreeItemType.Package:
        const pkg = this.data as Package;
        return `${pkg.Name}\nType: ${pkg.ContainerOptions}\nID: ${pkg.Id}`;
      case TreeItemType.Version:
      case TreeItemType.BetaVersion:
      case TreeItemType.ReleasedVersion:
        const version = this.data as PackageVersion;
        return `${version.Name}\nVersion: ${version.MajorVersion}.${version.MinorVersion}.${version.PatchVersion}.${version.BuildNumber}\nStatus: ${version.IsReleased ? 'Released' : 'Beta'}`;
      case TreeItemType.PackageInfo:
        const dir = this.data as PackageDirectory;
        return `Package: ${dir.package}\nPath: ${dir.path}\nVersion: ${dir.versionNumber || 'Not set'}`;
      default:
        return this.label;
    }
  }

  private getIcon(): vscode.ThemeIcon | undefined {
    switch (this.type) {
      case TreeItemType.Category:
        return new vscode.ThemeIcon('folder');
      case TreeItemType.Action:
        return new vscode.ThemeIcon('add');
      case TreeItemType.Package:
        const pkg = this.data as Package;
        return pkg.ContainerOptions === 'Managed'
          ? new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.blue'))
          : new vscode.ThemeIcon('package', new vscode.ThemeColor('charts.gray'));
      case TreeItemType.ReleasedVersion:
        return new vscode.ThemeIcon('verified', new vscode.ThemeColor('charts.green'));
      case TreeItemType.BetaVersion:
        return new vscode.ThemeIcon('beaker', new vscode.ThemeColor('charts.yellow'));
      case TreeItemType.Version:
        const version = this.data as PackageVersion;
        return version.IsReleased
          ? new vscode.ThemeIcon('verified', new vscode.ThemeColor('charts.green'))
          : new vscode.ThemeIcon('beaker', new vscode.ThemeColor('charts.yellow'));
      case TreeItemType.PackageInfo:
        return new vscode.ThemeIcon('file-code');
      case TreeItemType.Info:
        return new vscode.ThemeIcon('info');
      case TreeItemType.Error:
        return new vscode.ThemeIcon('error', new vscode.ThemeColor('errorForeground'));
      case TreeItemType.PackageList:
        return new vscode.ThemeIcon('list-unordered');
      case TreeItemType.VersionList:
        return new vscode.ThemeIcon('versions');
      default:
        return undefined;
    }
  }
}
