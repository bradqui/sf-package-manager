import { PackageVersionCreateRequest, PackageInstallRequest, ScratchOrgCreateRequest } from '../models/packageVersion';
import { PackageCreateRequest, PackageUpdateRequest } from '../models/package';
import { formatCommand } from '../utils/secrets';

export class CommandBuilder {
  buildPackageCreate(request: PackageCreateRequest, devHub: string): string[] {
    const args = ['package', 'create'];

    args.push('--name', request.name);
    args.push('--package-type', request.packageType);
    args.push('--path', request.path);
    args.push('--target-dev-hub', devHub);

    if (request.description) {
      args.push('--description', request.description);
    }

    if (request.noNamespace) {
      args.push('--no-namespace');
    }

    if (request.orgDependent) {
      args.push('--org-dependent');
    }

    if (request.errorNotificationUsername) {
      args.push('--error-notification-username', request.errorNotificationUsername);
    }

    args.push('--json');

    return args;
  }

  buildPackageUpdate(request: PackageUpdateRequest, devHub: string): string[] {
    const args = ['package', 'update'];

    args.push('--package', request.package);
    args.push('--target-dev-hub', devHub);

    if (request.name) {
      args.push('--name', request.name);
    }

    if (request.description) {
      args.push('--description', request.description);
    }

    if (request.errorNotificationUsername) {
      args.push('--error-notification-username', request.errorNotificationUsername);
    }

    args.push('--json');

    return args;
  }

  buildPackageDelete(packageId: string, devHub: string, noPrompt: boolean = true): string[] {
    const args = ['package', 'delete'];

    args.push('--package', packageId);
    args.push('--target-dev-hub', devHub);

    if (noPrompt) {
      args.push('--no-prompt');
    }

    args.push('--json');

    return args;
  }

  buildPackageList(devHub: string): string[] {
    const args = ['package', 'list'];

    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  buildPackageVersionCreate(
    request: PackageVersionCreateRequest,
    devHub: string
  ): string[] {
    const args = ['package', 'version', 'create'];

    args.push('--package', request.package);
    args.push('--target-dev-hub', devHub);

    // Version info
    if (request.versionName) {
      args.push('--version-name', request.versionName);
    }
    if (request.versionNumber) {
      args.push('--version-number', request.versionNumber);
    }
    if (request.versionDescription) {
      args.push('--version-description', request.versionDescription);
    }

    // Installation & Security
    if (request.installationKeyBypass) {
      args.push('--installation-key-bypass');
    } else if (request.installationKey) {
      args.push('--installation-key', request.installationKey);
    }

    // Testing & Validation
    if (request.codeCoverage) {
      args.push('--code-coverage');
    }
    if (request.skipValidation) {
      args.push('--skip-validation');
    }
    if (request.asyncValidation) {
      args.push('--async-validation');
    }
    if (request.skipAncestorCheck) {
      args.push('--skip-ancestor-check');
    }

    // Source Control
    if (request.branch) {
      args.push('--branch', request.branch);
    }
    if (request.tag) {
      args.push('--tag', request.tag);
    }

    // Configuration
    if (request.path) {
      args.push('--path', request.path);
    }
    if (request.definitionFile) {
      args.push('--definition-file', request.definitionFile);
    }
    if (request.language) {
      args.push('--language', request.language);
    }

    // Managed Package Specific
    if (request.postInstallScript) {
      args.push('--post-install-script', request.postInstallScript);
    }
    if (request.postInstallUrl) {
      args.push('--post-install-url', request.postInstallUrl);
    }
    if (request.releaseNotesUrl) {
      args.push('--release-notes-url', request.releaseNotesUrl);
    }
    if (request.uninstallScript) {
      args.push('--uninstall-script', request.uninstallScript);
    }

    // Execution
    if (request.wait !== undefined) {
      args.push('--wait', request.wait.toString());
    }
    if (request.verbose) {
      args.push('--verbose');
    }
    if (request.buildInstance) {
      args.push('--build-instance', request.buildInstance);
    }

    args.push('--json');

    return args;
  }

  buildPackageVersionList(devHub: string, packageId?: string): string[] {
    const args = ['package', 'version', 'list'];

    args.push('--target-dev-hub', devHub);

    if (packageId) {
      args.push('--packages', packageId);
    }

    args.push('--json');

    return args;
  }

  buildPackageVersionPromote(
    packageVersion: string,
    devHub: string,
    noPrompt: boolean = true
  ): string[] {
    const args = ['package', 'version', 'promote'];

    args.push('--package', packageVersion);
    args.push('--target-dev-hub', devHub);

    if (noPrompt) {
      args.push('--no-prompt');
    }

    args.push('--json');

    return args;
  }

  buildPackageVersionDelete(
    packageVersion: string,
    devHub: string,
    noPrompt: boolean = true
  ): string[] {
    const args = ['package', 'version', 'delete'];

    args.push('--package', packageVersion);
    args.push('--target-dev-hub', devHub);

    if (noPrompt) {
      args.push('--no-prompt');
    }

    args.push('--json');

    return args;
  }

  buildPackageVersionReport(packageVersion: string, devHub: string): string[] {
    const args = ['package', 'version', 'report'];

    args.push('--package', packageVersion);
    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  buildPackageVersionCreateReport(requestId: string, devHub: string): string[] {
    const args = ['package', 'version', 'create', 'report'];

    args.push('--package-create-request-id', requestId);
    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  buildPackageInstall(request: PackageInstallRequest, noPrompt: boolean = true): string[] {
    const args = ['package', 'install'];

    args.push('--package', request.package);
    args.push('--target-org', request.targetOrg);

    if (request.installationKey) {
      args.push('--installation-key', request.installationKey);
    }

    if (request.wait !== undefined) {
      args.push('--wait', request.wait.toString());
    }

    if (request.publishWait !== undefined) {
      args.push('--publish-wait', request.publishWait.toString());
    }

    if (request.apexCompile) {
      args.push('--apex-compile', request.apexCompile);
    }

    if (request.upgradeType) {
      args.push('--upgrade-type', request.upgradeType);
    }

    if (request.securityType) {
      args.push('--security-type', request.securityType);
    }

    // Auto-accept prompts for third-party website access, etc.
    if (noPrompt) {
      args.push('--no-prompt');
    }

    args.push('--json');

    return args;
  }

  buildPackageInstallReport(requestId: string, targetOrg: string): string[] {
    const args = ['package', 'install', 'report'];

    args.push('--request-id', requestId);
    args.push('--target-org', targetOrg);
    args.push('--json');

    return args;
  }

  buildPackageInstalledList(targetOrg: string): string[] {
    const args = ['package', 'installed', 'list'];

    args.push('--target-org', targetOrg);
    args.push('--json');

    return args;
  }

  buildPackageUninstall(
    packageId: string,
    targetOrg: string,
    wait?: number
  ): string[] {
    const args = ['package', 'uninstall'];

    args.push('--package', packageId);
    args.push('--target-org', targetOrg);

    if (wait !== undefined) {
      args.push('--wait', wait.toString());
    }

    args.push('--json');

    return args;
  }

  buildPackageVersionDisplayAncestry(packageVersion: string, devHub: string): string[] {
    const args = ['package', 'version', 'displayancestry'];

    args.push('--package', packageVersion);
    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  buildPackageVersionDisplayDependencies(packageVersion: string, devHub: string): string[] {
    const args = ['package', 'version', 'displaydependencies'];

    args.push('--package', packageVersion);
    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  // Push Upgrade Commands
  buildPackagePushUpgradeSchedule(
    packageVersionId: string,
    orgIds: string[],
    scheduledDate: string,
    devHub: string
  ): string[] {
    const args = ['package', 'push-upgrade', 'schedule'];

    args.push('--package', packageVersionId);
    args.push('--target-orgs', orgIds.join(','));
    args.push('--scheduled-date', scheduledDate);
    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  buildPackagePushUpgradeList(devHub: string): string[] {
    const args = ['package', 'push-upgrade', 'list'];

    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  buildPackagePushUpgradeReport(requestId: string, devHub: string): string[] {
    const args = ['package', 'push-upgrade', 'report'];

    args.push('--request-id', requestId);
    args.push('--target-dev-hub', devHub);
    args.push('--json');

    return args;
  }

  buildPackagePushUpgradeAbort(requestId: string, devHub: string): string[] {
    const args = ['package', 'push-upgrade', 'abort'];

    args.push('--request-id', requestId);
    args.push('--target-dev-hub', devHub);
    args.push('--no-prompt');
    args.push('--json');

    return args;
  }

  // Scratch Org Commands
  buildScratchOrgCreate(request: ScratchOrgCreateRequest): string[] {
    const args = ['org', 'create', 'scratch'];

    args.push('--definition-file', request.definitionFile);
    args.push('--target-dev-hub', request.devHub);

    if (request.alias) {
      args.push('--alias', request.alias);
    }

    if (request.durationDays !== undefined) {
      args.push('--duration-days', request.durationDays.toString());
    }

    if (request.noAncestors) {
      args.push('--no-ancestors');
    }

    if (request.noNamespace) {
      args.push('--no-namespace');
    }

    if (request.setDefault) {
      args.push('--set-default');
    }

    if (request.adminEmail) {
      args.push('--admin-email', request.adminEmail);
    }

    if (request.description) {
      args.push('--description', request.description);
    }

    if (request.clientId) {
      args.push('--client-id', request.clientId);
    }

    if (request.wait !== undefined) {
      args.push('--wait', request.wait.toString());
    }

    args.push('--json');

    return args;
  }

  buildOrgList(): string[] {
    const args = ['org', 'list'];
    args.push('--json');
    return args;
  }

  buildOrgDisplay(targetOrg: string): string[] {
    const args = ['org', 'display'];
    args.push('--target-org', targetOrg);
    args.push('--json');
    return args;
  }

  buildOrgDelete(targetOrg: string, noPrompt: boolean = true): string[] {
    const args = ['org', 'delete', 'scratch'];
    args.push('--target-org', targetOrg);

    if (noPrompt) {
      args.push('--no-prompt');
    }

    args.push('--json');
    return args;
  }

  buildOrgOpen(targetOrg: string): string[] {
    const args = ['org', 'open'];
    args.push('--target-org', targetOrg);
    // Note: No --json flag as this opens a browser
    return args;
  }

  // Preview the command as a string, with installation keys masked
  previewCommand(command: string, args: string[]): string {
    return formatCommand(command, args);
  }
}
