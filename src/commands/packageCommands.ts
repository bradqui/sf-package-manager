import * as vscode from 'vscode';
import { CliExecutor } from '../services/cliExecutor';
import { CommandBuilder } from '../services/commandBuilder';
import { ConfigService } from '../services/configService';
import { ProjectService } from '../services/projectService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';
import { Package, PackageCreateRequest, PackageUpdateRequest } from '../models/package';

export class PackageCommands {
  constructor(
    private cliExecutor: CliExecutor,
    private commandBuilder: CommandBuilder,
    private configService: ConfigService,
    private projectService: ProjectService
  ) {}

  async listPackages(): Promise<Package[] | null> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return null;
      }

      const args = this.commandBuilder.buildPackageList(devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Listing packages: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Loading packages...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to list packages');
        return null;
      }

      const packages = result.data?.result || [];
      Logger.info(`Found ${packages.length} package(s)`);

      return packages;
    } catch (error) {
      ErrorHandler.handle(error, 'Error listing packages');
      return null;
    }
  }

  async createPackage(): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      // Get package name
      const name = await vscode.window.showInputBox({
        prompt: 'Enter package name',
        placeHolder: 'MyPackage',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Package name is required';
          }
          return null;
        }
      });

      if (!name) {
        return;
      }

      // Get package type
      const packageType = await vscode.window.showQuickPick(
        ['Managed', 'Unlocked'],
        {
          placeHolder: 'Select package type',
          canPickMany: false
        }
      );

      if (!packageType) {
        return;
      }

      // Get path
      const defaultDir = await this.projectService.getDefaultPackageDirectory();
      const defaultPath = defaultDir?.path || 'force-app';

      const path = await vscode.window.showInputBox({
        prompt: 'Enter package path',
        placeHolder: defaultPath,
        value: defaultPath
      });

      if (!path) {
        return;
      }

      // Get description (optional)
      const description = await vscode.window.showInputBox({
        prompt: 'Enter package description (optional)',
        placeHolder: 'Package description'
      });

      // Build request
      const request: PackageCreateRequest = {
        name,
        packageType: packageType as 'Managed' | 'Unlocked',
        path,
        description: description || undefined
      };

      const args = this.commandBuilder.buildPackageCreate(request, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);

      // Show preview if enabled
      if (this.configService.getShowCommandPreview()) {
        const proceed = await vscode.window.showInformationMessage(
          `Execute command: ${preview}`,
          'Execute',
          'Cancel'
        );

        if (proceed !== 'Execute') {
          return;
        }
      }

      Logger.info(`Creating package: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        `Creating package ${name}...`
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to create package');
        return;
      }

      const packageId = result.data?.result?.Id;
      vscode.window.showInformationMessage(
        `Package "${name}" created successfully! ID: ${packageId}`
      );

      Logger.info(`Package created: ${packageId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error creating package');
    }
  }

  async updatePackage(pkg?: Package): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      let packageId: string | undefined;

      if (pkg) {
        packageId = pkg.Id;
      } else {
        // Prompt for package ID
        packageId = await vscode.window.showInputBox({
          prompt: 'Enter package ID or alias',
          placeHolder: '0Ho...'
        });
      }

      if (!packageId) {
        return;
      }

      // Get new name (optional)
      const name = await vscode.window.showInputBox({
        prompt: 'Enter new package name (leave empty to keep current)',
        placeHolder: pkg?.Name || 'Package name'
      });

      // Get new description (optional)
      const description = await vscode.window.showInputBox({
        prompt: 'Enter new description (leave empty to keep current)',
        placeHolder: pkg?.Description || 'Description'
      });

      if (!name && !description) {
        vscode.window.showWarningMessage('No changes specified');
        return;
      }

      const request: PackageUpdateRequest = {
        package: packageId,
        name: name || undefined,
        description: description || undefined
      };

      const args = this.commandBuilder.buildPackageUpdate(request, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);

      Logger.info(`Updating package: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Updating package...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to update package');
        return;
      }

      vscode.window.showInformationMessage('Package updated successfully!');
      Logger.info(`Package updated: ${packageId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error updating package');
    }
  }

  async deletePackage(pkg?: Package): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      let packageId: string | undefined;
      let packageName: string | undefined;

      if (pkg) {
        packageId = pkg.Id;
        packageName = pkg.Name;
      } else {
        // Prompt for package ID
        packageId = await vscode.window.showInputBox({
          prompt: 'Enter package ID or alias',
          placeHolder: '0Ho...'
        });
      }

      if (!packageId) {
        return;
      }

      // Confirm deletion
      const confirmMessage = packageName
        ? `Are you sure you want to delete package "${packageName}" (${packageId})?`
        : `Are you sure you want to delete package ${packageId}?`;

      const confirmation = await vscode.window.showWarningMessage(
        confirmMessage,
        { modal: true },
        'Delete',
        'Cancel'
      );

      if (confirmation !== 'Delete') {
        return;
      }

      const args = this.commandBuilder.buildPackageDelete(packageId, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);

      Logger.info(`Deleting package: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Deleting package...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to delete package');
        return;
      }

      vscode.window.showInformationMessage(
        `Package ${packageName || packageId} deleted successfully!`
      );

      Logger.info(`Package deleted: ${packageId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error deleting package');
    }
  }
}
