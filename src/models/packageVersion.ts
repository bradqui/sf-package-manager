/**
 * A package version as returned by `sf package version list --json` (and,
 * with a subset of fields, `package version report`).
 */
export interface PackageVersion {
  Id: string;
  Package2Id: string;
  SubscriberPackageVersionId: string;
  Name: string;
  Description?: string;
  Tag?: string;
  Branch?: string;
  MajorVersion: number;
  MinorVersion: number;
  PatchVersion: number;
  BuildNumber: number;
  IsReleased: boolean;
  IsDeprecated?: boolean;
  /** Package name and namespace (version list only) */
  Package2Name?: string;
  NamespacePrefix?: string;
  /** "major.minor.patch.build" (version list only) */
  Version?: string;
  IsPasswordProtected?: boolean;
  ReleaseVersion?: number | string;
  BuildDurationInSeconds?: number | string;
  /** true/false, or 'N/A' for org-dependent or validation-skipped versions */
  HasPassedCodeCoverageCheck?: boolean | string;
  /** A number (report), '75%' (list --verbose) or a hint string (list without --verbose) */
  CodeCoverage?: number | string | { apexCodeCoveragePercentage?: number };
  ValidationSkipped?: boolean;
  ValidatedAsync?: boolean;
  /** 04t ID of the ancestor, or 'N/A' for unlocked packages */
  AncestorId?: string;
  AncestorVersion?: string;
  Alias?: string;
  InstallUrl?: string;
  /** Version list returns 'YYYY-MM-DD HH:mm' in UTC */
  CreatedDate: string;
  LastModifiedDate: string;
}

export interface PackageVersionCreateRequest {
  // Required
  package: string;

  // Version info
  versionName?: string;
  versionNumber?: string;
  versionDescription?: string;

  // Installation & Security
  installationKey?: string;
  installationKeyBypass?: boolean;

  // Testing & Validation
  codeCoverage?: boolean;
  skipValidation?: boolean;
  asyncValidation?: boolean;
  skipAncestorCheck?: boolean;

  // Source Control
  branch?: string;
  tag?: string;

  // Configuration
  path?: string;
  definitionFile?: string;
  language?: string;

  // Managed Package Specific
  postInstallScript?: string;
  postInstallUrl?: string;
  releaseNotesUrl?: string;
  uninstallScript?: string;

  // Execution
  wait?: number;
  verbose?: boolean;
  buildInstance?: string;
}

export interface PackageVersionPromoteRequest {
  package: string;
  skipValidation?: boolean;
}

export interface PackageVersionCreateRequestStatus {
  Id: string;
  Status: 'Queued' | 'InProgress' | 'Success' | 'Error';
  Package2Id: string;
  Package2VersionId?: string;
  SubscriberPackageVersionId?: string;
  Tag?: string;
  Branch?: string;
  Error?: string[];
  CreatedDate: string;
  EndTime?: string;
}

export interface PackageInstallRequest {
  package: string;
  targetOrg: string;
  installationKey?: string;
  wait?: number;
  publishWait?: number;
  apexCompile?: 'all' | 'package';
  upgradeType?: 'Delete' | 'DeprecateOnly' | 'Mixed';
  securityType?: 'AllUsers' | 'AdminsOnly';
}

export interface ScratchOrgCreateRequest {
  // Required
  definitionFile: string;
  devHub: string;

  // Org Configuration
  alias?: string;
  durationDays?: number;
  noAncestors?: boolean;
  noNamespace?: boolean;

  // Options
  setDefault?: boolean;
  adminEmail?: string;
  description?: string;

  // Advanced
  clientId?: string;
  wait?: number;
}

export interface ScratchOrgInfo {
  orgId: string;
  username: string;
  alias?: string;
  instanceUrl: string;
  expirationDate: string;
  createdDate: string;
  status: string;
  devHubUsername?: string;
}
