/**
 * Message protocol between the extension host and the dashboard webview.
 * Shared by both builds, so it must not import anything that needs Node or vscode.
 */
import type { Package } from '../models/package';
import type { PackageVersion } from '../models/packageVersion';

export type ViewId = 'overview' | 'packages' | 'package' | 'versions' | 'installations' | 'scratch-orgs' | 'settings';

export type ResourceKey = 'packages' | 'versions' | 'installed' | 'orgs';

export interface InstalledPackage {
  Id?: string;
  SubscriberPackageId: string;
  SubscriberPackageName: string;
  SubscriberPackageNamespace?: string;
  SubscriberPackageVersionId: string;
  SubscriberPackageVersionName?: string;
  SubscriberPackageVersionNumber: string;
}

export interface OrgInfo {
  alias?: string;
  username: string;
  orgId: string;
  instanceUrl: string;
  isDevHub: boolean;
  isScratch: boolean;
  expirationDate?: string;
}

export interface ResourceTypes {
  packages: Package[];
  versions: PackageVersion[];
  installed: InstalledPackage[];
  orgs: OrgInfo[];
}

export interface ResourceState<K extends ResourceKey = ResourceKey> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: ResourceTypes[K];
  error?: string;
  /** Epoch ms when the data was fetched from Salesforce */
  fetchedAt?: number;
  /** Data changed in Salesforce since it was loaded (auto refresh is off) */
  stale?: boolean;
}

/** Where the effective Dev Hub / target org value comes from */
export type SettingSource = 'workspace' | 'user' | 'sf-cli' | 'none';

export interface ProjectPackageDirectory {
  path: string;
  package?: string;
  versionNumber?: string;
  versionName?: string;
  default?: boolean;
  ancestorVersion?: string;
  ancestorId?: string;
  /** Package ID (0Ho) from packageAliases, when known */
  packageId?: string;
}

export interface DashboardSettings {
  autoRefresh: boolean;
  showCommandPreview: boolean;
  defaultWaitTime: number;
  verboseOutput: boolean;
}

export interface DashboardContext {
  devHub: string;
  devHubSource: SettingSource;
  targetOrg: string;
  targetOrgSource: SettingSource;
  project?: {
    name: string;
    namespace?: string;
    packageDirectories: ProjectPackageDirectory[];
  };
  settings: DashboardSettings;
  definitionFiles: string[];
  extensionVersion: string;
}

export interface RunningOperationInfo {
  id: number;
  label: string;
  startedAt: number;
}

// ---- Forms ----

export interface CreatePackageForm {
  name: string;
  packageType: 'Managed' | 'Unlocked';
  path: string;
  description?: string;
  noNamespace?: boolean;
  orgDependent?: boolean;
}

export interface CreateVersionForm {
  /** Package name/alias from sfdx-project.json, or a 0Ho ID */
  package: string;
  versionName?: string;
  versionNumber?: string;
  versionDescription?: string;
  installationKeyBypass: boolean;
  installationKey?: string;
  codeCoverage?: boolean;
  skipValidation?: boolean;
  asyncValidation?: boolean;
  skipAncestorCheck?: boolean;
  branch?: string;
  tag?: string;
  wait: number;
}

export interface InstallForm {
  versionId: string;
  /** Empty means the configured target org */
  targetOrg?: string;
  installationKey?: string;
  wait: number;
  securityType?: 'AllUsers' | 'AdminsOnly';
}

export interface ScratchOrgForm {
  definitionFile: string;
  alias: string;
  durationDays: number;
  wait: number;
  setDefault?: boolean;
  noAncestors?: boolean;
  noNamespace?: boolean;
  adminEmail?: string;
  description?: string;
}

export interface ScratchDefForm {
  orgName?: string;
  edition: 'Developer' | 'Enterprise' | 'Group' | 'Professional';
  features: string[];
  enableLightningExperience: boolean;
}

// ---- Actions (webview -> host), answered with actionComplete ----

export type SettingKey = keyof DashboardSettings;

export type DashboardAction =
  | { kind: 'setDevHub'; value: string }
  | { kind: 'setTargetOrg'; value: string }
  | { kind: 'updateSetting'; key: SettingKey; value: boolean | number }
  | { kind: 'copy'; text: string; label: string }
  | { kind: 'showOutput' }
  | { kind: 'openSettings' }
  | { kind: 'openFile'; path: string }
  | { kind: 'createPackage'; data: CreatePackageForm }
  | { kind: 'deletePackage'; packageId: string; name: string }
  | { kind: 'createVersion'; data: CreateVersionForm }
  | { kind: 'promoteVersion'; versionId: string; label: string }
  | { kind: 'deleteVersions'; versions: { versionId: string; label: string }[] }
  | { kind: 'installVersion'; versionId: string; label: string; pickOrg: boolean }
  | { kind: 'testInScratchOrg'; versionId: string }
  | { kind: 'versionDetails'; versionId: string }
  | { kind: 'versionAncestry'; versionId: string }
  | { kind: 'versionDependencies'; versionId: string }
  | { kind: 'compareVersion'; versionId: string }
  | { kind: 'installPackage'; data: InstallForm }
  | { kind: 'uninstallPackage'; versionId: string; name: string }
  | { kind: 'upgradePackage'; targetVersionId: string; name: string; targetLabel: string; isBeta: boolean }
  | { kind: 'createScratchOrg'; data: ScratchOrgForm }
  | { kind: 'previewScratchOrg'; data: ScratchOrgForm }
  | { kind: 'deleteScratchOrg'; username: string; label: string }
  | { kind: 'openOrg'; username: string }
  | { kind: 'generateScratchDef'; data: ScratchDefForm }
  | { kind: 'browseDefinitionFile' };

export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'load'; keys: ResourceKey[]; force?: boolean }
  | { type: 'action'; actionId: number; action: DashboardAction };

export type HostMessage =
  | { type: 'context'; context: DashboardContext }
  | { type: 'resource'; key: ResourceKey; state: ResourceState }
  | { type: 'operations'; operations: RunningOperationInfo[] }
  | { type: 'actionComplete'; actionId: number; ok: boolean; result?: string }
  | { type: 'navigate'; view: ViewId; packageId?: string };
