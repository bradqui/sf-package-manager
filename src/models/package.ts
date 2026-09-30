export interface SfdxProject {
  packageDirectories: PackageDirectory[];
  name: string;
  namespace?: string;
  sfdcLoginUrl: string;
  sourceApiVersion: string;
  packageAliases: Record<string, string>;
}

export interface PackageDirectory {
  path: string;
  default: boolean;
  package: string;
  ancestorVersion?: string;
  ancestorId?: string;
  versionName?: string;
  versionNumber?: string;
  versionDescription?: string;
}

export interface Package {
  Id: string;
  /** 033 ID, matches SubscriberPackageId on installed packages */
  SubscriberPackageId?: string;
  Alias?: string;
  Name: string;
  Description?: string;
  NamespacePrefix?: string;
  ContainerOptions: 'Managed' | 'Unlocked';
  IsOrgDependent?: boolean;
  ConvertedFromPackageId?: string;
  PackageErrorUsername?: string;
  CreatedDate: string;
  ModifiedDate: string;
}

export interface PackageCreateRequest {
  name: string;
  description?: string;
  packageType: 'Managed' | 'Unlocked';
  path: string;
  noNamespace?: boolean;
  orgDependent?: boolean;
  errorNotificationUsername?: string;
}

export interface PackageUpdateRequest {
  package: string;
  name?: string;
  description?: string;
  errorNotificationUsername?: string;
}
