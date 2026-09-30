import { SfdxProject } from '../../models/package';

export const mockSfdxProject: SfdxProject = {
  packageDirectories: [
    {
      path: 'src',
      default: true,
      package: 'QuikForms',
      versionName: 'ver 0.1',
      versionNumber: '0.1.0.NEXT',
      versionDescription: 'Public-facing web forms for Salesforce'
    }
  ],
  name: 'QuikForms',
  namespace: 'quikforms',
  sfdcLoginUrl: 'https://login.salesforce.com',
  sourceApiVersion: '65.0',
  packageAliases: {
    'QuikForms': '0Hoao0000002yhdCAA',
    'QuikForms@0.1.0-1': '04tao000002PqdNAAS',
    'QuikForms@0.2.0-1': '04tao000002PqdNAAT'
  }
};

export const mockSfdxProjectNoNamespace: SfdxProject = {
  packageDirectories: [
    {
      path: 'force-app',
      default: true,
      package: 'UnlockedPackage',
      versionNumber: '1.0.0.NEXT'
    }
  ],
  name: 'TestProject',
  sfdcLoginUrl: 'https://login.salesforce.com',
  sourceApiVersion: '65.0',
  packageAliases: {
    'UnlockedPackage': '0Hoao0000002yhdCAB'
  }
};
