import * as assert from 'assert';
import { CommandBuilder } from '../../services/commandBuilder';
import { PackageVersionCreateRequest, PackageInstallRequest } from '../../models/packageVersion';
import { PackageCreateRequest } from '../../models/package';

suite('CommandBuilder Test Suite', () => {
  let builder: CommandBuilder;

  setup(() => {
    builder = new CommandBuilder();
  });

  suite('Package Commands', () => {
    test('buildPackageCreate with all options', () => {
      const request: PackageCreateRequest = {
        name: 'TestPackage',
        packageType: 'Managed',
        path: 'src',
        description: 'Test description',
        errorNotificationUsername: 'test@example.com'
      };

      const args = builder.buildPackageCreate(request, 'DevHub');

      assert.ok(args.includes('package'));
      assert.ok(args.includes('create'));
      assert.ok(args.includes('--name'));
      assert.ok(args.includes('TestPackage'));
      assert.ok(args.includes('--package-type'));
      assert.ok(args.includes('Managed'));
      assert.ok(args.includes('--path'));
      assert.ok(args.includes('src'));
      assert.ok(args.includes('--description'));
      assert.ok(args.includes('Test description'));
      assert.ok(args.includes('--error-notification-username'));
      assert.ok(args.includes('test@example.com'));
      assert.ok(args.includes('--target-dev-hub'));
      assert.ok(args.includes('DevHub'));
      assert.ok(args.includes('--json'));
    });

    test('buildPackageCreate with minimal options', () => {
      const request: PackageCreateRequest = {
        name: 'MinimalPackage',
        packageType: 'Unlocked',
        path: 'force-app'
      };

      const args = builder.buildPackageCreate(request, 'DevHub');

      assert.ok(args.includes('--name'));
      assert.ok(args.includes('MinimalPackage'));
      assert.strictEqual(args.includes('--description'), false);
    });

    test('buildPackageList', () => {
      const args = builder.buildPackageList('DevHub');

      assert.ok(args.includes('package'));
      assert.ok(args.includes('list'));
      assert.ok(args.includes('--target-dev-hub'));
      assert.ok(args.includes('DevHub'));
      assert.ok(args.includes('--json'));
    });

    test('buildPackageDelete', () => {
      const args = builder.buildPackageDelete('0Ho123456789ABC', 'DevHub');

      assert.ok(args.includes('package'));
      assert.ok(args.includes('delete'));
      assert.ok(args.includes('--package'));
      assert.ok(args.includes('0Ho123456789ABC'));
      assert.ok(args.includes('--no-prompt'));
    });
  });

  suite('Version Commands', () => {
    test('buildPackageVersionCreate with all flags', () => {
      const request: PackageVersionCreateRequest = {
        package: 'QuikForms',
        versionName: 'ver 0.1',
        versionNumber: '0.1.0.NEXT',
        versionDescription: 'Test version',
        installationKeyBypass: true,
        codeCoverage: true,
        branch: 'main',
        tag: 'v0.1',
        wait: 10,
        verbose: true
      };

      const args = builder.buildPackageVersionCreate(request, 'DevHub');

      assert.ok(args.includes('--package'));
      assert.ok(args.includes('QuikForms'));
      assert.ok(args.includes('--version-name'));
      assert.ok(args.includes('ver 0.1'));
      assert.ok(args.includes('--version-number'));
      assert.ok(args.includes('0.1.0.NEXT'));
      assert.ok(args.includes('--installation-key-bypass'));
      assert.ok(args.includes('--code-coverage'));
      assert.ok(args.includes('--branch'));
      assert.ok(args.includes('main'));
      assert.ok(args.includes('--tag'));
      assert.ok(args.includes('v0.1'));
      assert.ok(args.includes('--wait'));
      assert.ok(args.includes('10'));
      assert.ok(args.includes('--verbose'));
    });

    test('buildPackageVersionCreate with installation key', () => {
      const request: PackageVersionCreateRequest = {
        package: 'TestPkg',
        installationKey: 'secret123'
      };

      const args = builder.buildPackageVersionCreate(request, 'DevHub');

      assert.ok(args.includes('--installation-key'));
      assert.ok(args.includes('secret123'));
      assert.strictEqual(args.includes('--installation-key-bypass'), false);
    });

    test('buildPackageVersionPromote', () => {
      const args = builder.buildPackageVersionPromote('04t123456789ABC', 'DevHub');

      assert.ok(args.includes('package'));
      assert.ok(args.includes('version'));
      assert.ok(args.includes('promote'));
      assert.ok(args.includes('--package'));
      assert.ok(args.includes('04t123456789ABC'));
      assert.ok(args.includes('--no-prompt'));
    });

    test('buildPackageVersionList with package filter', () => {
      const args = builder.buildPackageVersionList('DevHub', '0Ho123456789ABC');

      assert.ok(args.includes('--packages'));
      assert.ok(args.includes('0Ho123456789ABC'));
    });

    test('buildPackageVersionDisplayAncestry', () => {
      const args = builder.buildPackageVersionDisplayAncestry('04t123456789ABC', 'DevHub');

      assert.ok(args.includes('package'));
      assert.ok(args.includes('version'));
      assert.ok(args.includes('displayancestry'));
      assert.ok(args.includes('--package'));
      assert.ok(args.includes('04t123456789ABC'));
    });

    test('buildPackageVersionDisplayDependencies', () => {
      const args = builder.buildPackageVersionDisplayDependencies('04t123456789ABC', 'DevHub');

      assert.ok(args.includes('displaydependencies'));
      assert.ok(args.includes('--package'));
      assert.ok(args.includes('04t123456789ABC'));
    });
  });

  suite('Installation Commands', () => {
    test('buildPackageInstall with all options', () => {
      const request: PackageInstallRequest = {
        package: '04t123456789ABC',
        targetOrg: 'myorg',
        installationKey: 'key123',
        wait: 10,
        publishWait: 5,
        apexCompile: 'package',
        securityType: 'AdminsOnly'
      };

      const args = builder.buildPackageInstall(request);

      assert.ok(args.includes('--package'));
      assert.ok(args.includes('04t123456789ABC'));
      assert.ok(args.includes('--target-org'));
      assert.ok(args.includes('myorg'));
      assert.ok(args.includes('--installation-key'));
      assert.ok(args.includes('key123'));
      assert.ok(args.includes('--wait'));
      assert.ok(args.includes('10'));
      assert.ok(args.includes('--apex-compile'));
      assert.ok(args.includes('package'));
      assert.ok(args.includes('--security-type'));
      assert.ok(args.includes('AdminsOnly'));
    });

    test('buildPackageInstalledList', () => {
      const args = builder.buildPackageInstalledList('myorg');

      assert.ok(args.includes('package'));
      assert.ok(args.includes('installed'));
      assert.ok(args.includes('list'));
      assert.ok(args.includes('--target-org'));
      assert.ok(args.includes('myorg'));
    });

    test('buildPackageUninstall', () => {
      const args = builder.buildPackageUninstall('04t123456789ABC', 'myorg', 10);

      assert.ok(args.includes('package'));
      assert.ok(args.includes('uninstall'));
      assert.ok(args.includes('--package'));
      assert.ok(args.includes('04t123456789ABC'));
      assert.ok(args.includes('--wait'));
      assert.ok(args.includes('10'));
    });
  });

  suite('Command Preview', () => {
    test('previewCommand masks installation key', () => {
      const args = ['package', 'install', '--installation-key', 'secret123', '--package', '04t123'];
      const preview = builder.previewCommand('sf', args);

      assert.ok(preview.includes('********'));
      assert.strictEqual(preview.includes('secret123'), false);
      assert.ok(preview.includes('04t123'));
    });

    test('previewCommand shows all other args', () => {
      const args = ['package', 'list', '--target-dev-hub', 'DevHub'];
      const preview = builder.previewCommand('sf', args);

      assert.ok(preview.includes('sf'));
      assert.ok(preview.includes('package'));
      assert.ok(preview.includes('list'));
      assert.ok(preview.includes('DevHub'));
    });
  });
});
