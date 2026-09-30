import { Package } from '../../models/package';
import { PackageVersion, PackageVersionCreateRequestStatus } from '../../models/packageVersion';

export const mockPackageListResponse = {
  status: 0,
  result: [
    {
      Id: '0Hoao0000002yhdCAA',
      Name: 'QuikForms',
      Description: 'Public-facing web forms for Salesforce',
      NamespacePrefix: 'quikforms',
      ContainerOptions: 'Managed' as const,
      IsOrgDependent: false,
      CreatedDate: '2024-01-01T00:00:00.000Z',
      ModifiedDate: '2024-01-15T00:00:00.000Z'
    } as Package,
    {
      Id: '0Hoao0000002yhdCAB',
      Name: 'TestPackage',
      Description: 'Test package for unit tests',
      NamespacePrefix: 'testpkg',
      ContainerOptions: 'Unlocked' as const,
      IsOrgDependent: false,
      CreatedDate: '2024-01-10T00:00:00.000Z',
      ModifiedDate: '2024-01-15T00:00:00.000Z'
    } as Package
  ]
};

export const mockPackageCreateResponse = {
  status: 0,
  result: {
    Id: '0Hoao0000002yhdCAC',
    Name: 'NewPackage',
    Description: 'Newly created package',
    NamespacePrefix: 'newpkg',
    ContainerOptions: 'Managed' as const,
    CreatedDate: new Date().toISOString(),
    ModifiedDate: new Date().toISOString()
  }
};

export const mockVersionListResponse = {
  status: 0,
  result: [
    {
      Id: '05ixx000000001AAAQ',
      Package2Id: '0Hoao0000002yhdCAA',
      SubscriberPackageVersionId: '04tao000002PqdNAAS',
      Name: 'ver 0.1',
      Description: 'First version',
      Tag: 'v0.1',
      Branch: 'main',
      MajorVersion: 0,
      MinorVersion: 1,
      PatchVersion: 0,
      BuildNumber: 1,
      IsReleased: true,
      IsDeprecated: false,
      HasPassedCodeCoverageCheck: true,
      CodeCoverage: 85,
      ValidationSkipped: false,
      CreatedDate: '2024-01-05T00:00:00.000Z',
      LastModifiedDate: '2024-01-05T00:00:00.000Z'
    } as PackageVersion,
    {
      Id: '05ixx000000002AAAQ',
      Package2Id: '0Hoao0000002yhdCAA',
      SubscriberPackageVersionId: '04tao000002PqdNAAT',
      Name: 'ver 0.2',
      Description: 'Second version',
      Tag: 'v0.2',
      Branch: 'main',
      MajorVersion: 0,
      MinorVersion: 2,
      PatchVersion: 0,
      BuildNumber: 1,
      IsReleased: false,
      IsDeprecated: false,
      HasPassedCodeCoverageCheck: false,
      ValidationSkipped: false,
      CreatedDate: '2024-01-10T00:00:00.000Z',
      LastModifiedDate: '2024-01-10T00:00:00.000Z'
    } as PackageVersion
  ]
};

export const mockVersionCreateResponse = {
  status: 0,
  result: {
    Id: '08cxx000000001AAAQ',
    Status: 'Success' as const,
    Package2Id: '0Hoao0000002yhdCAA',
    Package2VersionId: '05ixx000000003AAAQ',
    SubscriberPackageVersionId: '04tao000002PqdNAAU',
    Tag: 'v0.3',
    Branch: 'main',
    CreatedDate: new Date().toISOString()
  } as PackageVersionCreateRequestStatus
};

export const mockVersionCreateInProgressResponse = {
  status: 0,
  result: {
    Id: '08cxx000000001AAAQ',
    Status: 'InProgress' as const,
    Package2Id: '0Hoao0000002yhdCAA',
    Tag: 'v0.3',
    Branch: 'main',
    CreatedDate: new Date().toISOString()
  } as PackageVersionCreateRequestStatus
};

export const mockVersionPromoteResponse = {
  status: 0,
  result: {
    Id: '05ixx000000002AAAQ',
    IsReleased: true
  }
};

export const mockVersionDeleteResponse = {
  status: 0,
  result: {
    success: true
  }
};

export const mockInstalledPackagesResponse = {
  status: 0,
  result: [
    {
      SubscriberPackageId: '033xx000000001AAA',
      SubscriberPackageName: 'QuikForms',
      SubscriberPackageNamespace: 'quikforms',
      SubscriberPackageVersionId: '04tao000002PqdNAAS',
      SubscriberPackageVersionName: 'ver 0.1',
      SubscriberPackageVersionNumber: '0.1.0.1'
    },
    {
      SubscriberPackageId: '033xx000000002AAA',
      SubscriberPackageName: 'TestPackage',
      SubscriberPackageNamespace: 'testpkg',
      SubscriberPackageVersionId: '04tao000002PqdNAAT',
      SubscriberPackageVersionName: 'ver 1.0',
      SubscriberPackageVersionNumber: '1.0.0.1'
    }
  ]
};

export const mockInstallResponse = {
  status: 0,
  result: {
    Id: '0Hfxx000000001AAA',
    Status: 'Success',
    SubscriberPackageVersionKey: '04tao000002PqdNAAS'
  }
};

export const mockUninstallResponse = {
  status: 0,
  result: {
    success: true
  }
};

export const mockAncestryResponse = {
  status: 0,
  result: [
    {
      SubscriberPackageVersionId: '04tao000002PqdNAAU',
      MajorVersion: 0,
      MinorVersion: 3,
      PatchVersion: 0,
      BuildNumber: 1,
      IsReleased: false
    },
    {
      SubscriberPackageVersionId: '04tao000002PqdNAAT',
      MajorVersion: 0,
      MinorVersion: 2,
      PatchVersion: 0,
      BuildNumber: 1,
      IsReleased: false
    },
    {
      SubscriberPackageVersionId: '04tao000002PqdNAAS',
      MajorVersion: 0,
      MinorVersion: 1,
      PatchVersion: 0,
      BuildNumber: 1,
      IsReleased: true
    }
  ]
};

export const mockDependenciesResponse = {
  status: 0,
  result: [
    {
      subscriberPackageName: 'Base Package',
      subscriberPackageNamespace: 'basepkg',
      subscriberPackageVersionId: '04txx000000001AAA',
      versionNumber: '1.0.0.1'
    },
    {
      subscriberPackageName: 'Utility Package',
      subscriberPackageNamespace: 'utilpkg',
      subscriberPackageVersionId: '04txx000000002AAA',
      versionNumber: '2.5.0.1'
    }
  ]
};

export const mockErrorResponse = {
  status: 1,
  result: null,
  error: 'Command failed: Package not found'
};
