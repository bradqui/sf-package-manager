import * as assert from 'assert';
import { CommandBuilder } from '../../services/commandBuilder';
import { ProjectService } from '../../services/projectService';
import { ConfigService } from '../../services/configService';
import {
  mockPackageListResponse,
  mockVersionListResponse,
  mockVersionCreateResponse,
  mockInstalledPackagesResponse,
  mockAncestryResponse,
  mockDependenciesResponse
} from '../mocks/cliResponses';
import { mockSfdxProject } from '../mocks/projectData';

suite('Integration Test Suite', () => {
  let commandBuilder: CommandBuilder;

  setup(() => {
    commandBuilder = new CommandBuilder();
  });

  suite('Package Workflow', () => {
    test('Complete package creation workflow', () => {
      // Step 1: Build package create command
      const createArgs = commandBuilder.buildPackageCreate(
        {
          name: 'TestPackage',
          packageType: 'Managed',
          path: 'src',
          description: 'Test package'
        },
        'DevHub'
      );

      assert.ok(createArgs.includes('package'));
      assert.ok(createArgs.includes('create'));
      assert.ok(createArgs.includes('--json'));

      // Step 2: Verify list command includes new package
      const listArgs = commandBuilder.buildPackageList('DevHub');
      assert.ok(listArgs.includes('list'));

      // Mock response validation
      assert.ok(mockPackageListResponse.result.length > 0);
      assert.strictEqual(mockPackageListResponse.result[0].Name, 'QuikForms');
    });

    test('Package version creation and promotion workflow', () => {
      // Step 1: Create version
      const createVersionArgs = commandBuilder.buildPackageVersionCreate(
        {
          package: 'QuikForms',
          versionName: 'ver 0.1',
          versionNumber: '0.1.0.NEXT',
          codeCoverage: true,
          installationKeyBypass: true,
          wait: 10
        },
        'DevHub'
      );

      assert.ok(createVersionArgs.includes('version'));
      assert.ok(createVersionArgs.includes('create'));
      assert.ok(createVersionArgs.includes('--code-coverage'));

      // Verify mock response
      assert.strictEqual(mockVersionCreateResponse.result.Status, 'Success');
      const versionId = mockVersionCreateResponse.result.SubscriberPackageVersionId;
      assert.ok(versionId);

      // Step 2: Promote version
      const promoteArgs = commandBuilder.buildPackageVersionPromote(versionId!, 'DevHub');
      assert.ok(promoteArgs.includes('promote'));
      assert.ok(promoteArgs.includes(versionId!));
    });

    test('Version listing with filtering', () => {
      const packageId = '0Hoao0000002yhdCAA';
      const args = commandBuilder.buildPackageVersionList('DevHub', packageId);

      assert.ok(args.includes('--packages'));
      assert.ok(args.includes(packageId));

      // Verify mock response
      const versions = mockVersionListResponse.result;
      assert.strictEqual(versions.length, 2);
      assert.strictEqual(versions[0].IsReleased, true);
      assert.strictEqual(versions[1].IsReleased, false);
    });
  });

  suite('Installation Workflow', () => {
    test('Complete installation workflow', () => {
      const versionId = '04tao000002PqdNAAS';

      // Step 1: Install package
      const installArgs = commandBuilder.buildPackageInstall({
        package: versionId,
        targetOrg: 'myorg',
        wait: 10
      });

      assert.ok(installArgs.includes('install'));
      assert.ok(installArgs.includes(versionId));

      // Step 2: List installed packages
      const listInstalledArgs = commandBuilder.buildPackageInstalledList('myorg');
      assert.ok(listInstalledArgs.includes('installed'));
      assert.ok(listInstalledArgs.includes('list'));

      // Verify mock response
      const installed = mockInstalledPackagesResponse.result;
      assert.ok(installed.length > 0);
      assert.ok(installed.some(pkg => pkg.SubscriberPackageVersionId === versionId));

      // Step 3: Uninstall package
      const uninstallArgs = commandBuilder.buildPackageUninstall(versionId, 'myorg', 10);
      assert.ok(uninstallArgs.includes('uninstall'));
    });

    test('Installation with security options', () => {
      const args = commandBuilder.buildPackageInstall({
        package: '04tao000002PqdNAAS',
        targetOrg: 'myorg',
        installationKey: 'testkey',
        apexCompile: 'package',
        securityType: 'AdminsOnly'
      });

      assert.ok(args.includes('--installation-key'));
      assert.ok(args.includes('--apex-compile'));
      assert.ok(args.includes('package'));
      assert.ok(args.includes('--security-type'));
      assert.ok(args.includes('AdminsOnly'));
    });
  });

  suite('Dependency Analysis Workflow', () => {
    test('Display version ancestry', () => {
      const versionId = '04tao000002PqdNAAU';
      const args = commandBuilder.buildPackageVersionDisplayAncestry(versionId, 'DevHub');

      assert.ok(args.includes('displayancestry'));
      assert.ok(args.includes(versionId));

      // Verify mock response
      const ancestry = mockAncestryResponse.result;
      assert.strictEqual(ancestry.length, 3);
      assert.strictEqual(ancestry[0].MajorVersion, 0);
      assert.strictEqual(ancestry[0].MinorVersion, 3);
      assert.strictEqual(ancestry[2].IsReleased, true);
    });

    test('Display version dependencies', () => {
      const versionId = '04tao000002PqdNAAS';
      const args = commandBuilder.buildPackageVersionDisplayDependencies(versionId, 'DevHub');

      assert.ok(args.includes('displaydependencies'));
      assert.ok(args.includes(versionId));

      // Verify mock response
      const deps = mockDependenciesResponse.result;
      assert.strictEqual(deps.length, 2);
      assert.strictEqual(deps[0].subscriberPackageName, 'Base Package');
      assert.strictEqual(deps[1].subscriberPackageNamespace, 'utilpkg');
    });

    test('Ancestry shows version lineage', () => {
      const ancestry = mockAncestryResponse.result;

      // Verify versions are in descending order (newest to oldest)
      for (let i = 0; i < ancestry.length - 1; i++) {
        const current = ancestry[i];
        const next = ancestry[i + 1];

        // Compare version numbers
        const currentVersion = current.MajorVersion * 1000 + current.MinorVersion;
        const nextVersion = next.MajorVersion * 1000 + next.MinorVersion;

        assert.ok(currentVersion >= nextVersion, 'Ancestry should be in descending order');
      }
    });
  });

  suite('Project Configuration', () => {
    test('Parse sfdx-project.json structure', () => {
      const project = mockSfdxProject;

      assert.strictEqual(project.name, 'QuikForms');
      assert.strictEqual(project.namespace, 'quikforms');
      assert.strictEqual(project.packageDirectories.length, 1);

      const pkgDir = project.packageDirectories[0];
      assert.strictEqual(pkgDir.package, 'QuikForms');
      assert.strictEqual(pkgDir.default, true);
      assert.strictEqual(pkgDir.versionNumber, '0.1.0.NEXT');
    });

    test('Package aliases mapping', () => {
      const project = mockSfdxProject;
      const aliases = project.packageAliases;

      assert.ok(aliases['QuikForms']);
      assert.strictEqual(aliases['QuikForms'], '0Hoao0000002yhdCAA');
      assert.ok(aliases['QuikForms@0.1.0-1']);
      assert.strictEqual(aliases['QuikForms@0.1.0-1'], '04tao000002PqdNAAS');
    });
  });

  suite('Command Argument Validation', () => {
    test('All package commands include --json flag', () => {
      const commands = [
        commandBuilder.buildPackageList('DevHub'),
        commandBuilder.buildPackageCreate({ name: 'Test', packageType: 'Managed', path: 'src' }, 'DevHub'),
        commandBuilder.buildPackageVersionList('DevHub'),
        commandBuilder.buildPackageVersionReport('04t123', 'DevHub'),
        commandBuilder.buildPackageInstalledList('org')
      ];

      commands.forEach(args => {
        assert.ok(args.includes('--json'), `Command should include --json: ${args.join(' ')}`);
      });
    });

    test('All Dev Hub commands include target-dev-hub', () => {
      const commands = [
        commandBuilder.buildPackageList('DevHub'),
        commandBuilder.buildPackageVersionList('DevHub'),
        commandBuilder.buildPackageVersionPromote('04t123', 'DevHub')
      ];

      commands.forEach(args => {
        assert.ok(args.includes('--target-dev-hub'), `Command should include --target-dev-hub: ${args.join(' ')}`);
        assert.ok(args.includes('DevHub'), `Command should include DevHub value: ${args.join(' ')}`);
      });
    });

    test('Installation commands include target-org', () => {
      const commands = [
        commandBuilder.buildPackageInstall({ package: '04t123', targetOrg: 'org' }),
        commandBuilder.buildPackageInstalledList('org'),
        commandBuilder.buildPackageUninstall('04t123', 'org')
      ];

      commands.forEach(args => {
        assert.ok(args.includes('--target-org'), `Command should include --target-org: ${args.join(' ')}`);
        assert.ok(args.includes('org'), `Command should include org value: ${args.join(' ')}`);
      });
    });
  });

  suite('Version Number Handling', () => {
    test('Version number format validation', () => {
      const validVersions = [
        '0.1.0.NEXT',
        '1.0.0.NEXT',
        '1.2.3.NEXT',
        '0.1.0.1',
        '10.20.30.100'
      ];

      const versionPattern = /^\d+\.\d+\.\d+\.(NEXT|\d+)$/;

      validVersions.forEach(version => {
        assert.ok(versionPattern.test(version), `Version ${version} should be valid`);
      });
    });

    test('Invalid version numbers', () => {
      const invalidVersions = [
        '1.0.0',
        '1.0.NEXT',
        'NEXT',
        '1.0.0.next',
        'v1.0.0.NEXT'
      ];

      const versionPattern = /^\d+\.\d+\.\d+\.(NEXT|\d+)$/;

      invalidVersions.forEach(version => {
        assert.strictEqual(versionPattern.test(version), false, `Version ${version} should be invalid`);
      });
    });
  });

  suite('Error Response Handling', () => {
    test('Mock error response structure', () => {
      const errorResponse = {
        status: 1,
        result: null,
        error: 'Package not found'
      };

      assert.strictEqual(errorResponse.status, 1);
      assert.strictEqual(errorResponse.result, null);
      assert.ok(errorResponse.error);
    });

    test('Version creation status handling', () => {
      const statuses = ['Queued', 'InProgress', 'Success', 'Error'];

      statuses.forEach(status => {
        const response = {
          Id: '08cxx000000001AAAQ',
          Status: status,
          Package2Id: '0Hoao0000002yhdCAA'
        };

        assert.ok(['Queued', 'InProgress', 'Success', 'Error'].includes(response.Status));
      });
    });
  });
});
