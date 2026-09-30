import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CliExecutor } from '../services/cliExecutor';
import { CommandBuilder } from '../services/commandBuilder';
import { ConfigService } from '../services/configService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';
import { ScratchOrgCreateRequest, ScratchOrgInfo } from '../models/packageVersion';

export interface ScratchDefConfig {
  orgName?: string;
  edition: 'Developer' | 'Enterprise' | 'Group' | 'Professional';
  features: string[];
  enableLightningExperience: boolean;
}

export class ScratchOrgCommands {
  constructor(
    private cliExecutor: CliExecutor,
    private commandBuilder: CommandBuilder,
    private configService: ConfigService
  ) {}

  /**
   * Create scratch org with wizard
   */
  async createScratchOrg(): Promise<void> {
    try {
      Logger.info('Starting scratch org creation wizard');

      // Check for Dev Hub
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        const setDevHub = await vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set a default Dev Hub first.',
          'Set Dev Hub'
        );
        if (setDevHub) {
          await vscode.commands.executeCommand('sfPackageManager.switchDevHub');
        }
        return;
      }

      // Ask for scratch-def.json file
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const definitionFiles = await vscode.workspace.findFiles(
        '**/project-scratch-def.json',
        '**/node_modules/**',
        10
      );

      let definitionFile: string;

      if (definitionFiles.length === 0) {
        vscode.window.showErrorMessage(
          'No project-scratch-def.json files found in workspace. Please create one first.'
        );
        return;
      } else if (definitionFiles.length === 1) {
        definitionFile = vscode.workspace.asRelativePath(definitionFiles[0]);
        const confirm = await vscode.window.showInformationMessage(
          `Use definition file: ${definitionFile}?`,
          'Yes',
          'Browse'
        );
        if (confirm === 'Browse') {
          const selected = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { 'JSON': ['json'] },
            defaultUri: workspaceFolders[0].uri
          });
          if (!selected || selected.length === 0) {
            return;
          }
          definitionFile = vscode.workspace.asRelativePath(selected[0]);
        }
      } else {
        const items = definitionFiles.map(uri => ({
          label: vscode.workspace.asRelativePath(uri),
          uri: uri
        }));
        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select scratch org definition file'
        });
        if (!selected) {
          return;
        }
        definitionFile = selected.label;
      }

      // Ask for alias
      const alias = await vscode.window.showInputBox({
        prompt: 'Enter an alias for the scratch org',
        placeHolder: 'my-scratch-org',
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Alias is required';
          }
          if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
            return 'Alias can only contain letters, numbers, hyphens, and underscores';
          }
          return null;
        }
      });

      if (!alias) {
        return;
      }

      // Ask for duration
      const durationOptions = [
        { label: '1 day', value: 1 },
        { label: '7 days (1 week)', value: 7 },
        { label: '14 days (2 weeks)', value: 14 },
        { label: '30 days (1 month)', value: 30 }
      ];

      const selectedDuration = await vscode.window.showQuickPick(durationOptions, {
        placeHolder: 'Select scratch org duration'
      });

      if (!selectedDuration) {
        return;
      }

      // Ask if set as default
      const setDefault = await vscode.window.showQuickPick(
        [
          { label: 'Yes', value: true },
          { label: 'No', value: false }
        ],
        {
          placeHolder: 'Set as default org?'
        }
      );

      if (!setDefault) {
        return;
      }

      // Build request
      const request: ScratchOrgCreateRequest = {
        definitionFile,
        devHub,
        alias,
        durationDays: selectedDuration.value,
        setDefault: setDefault.value,
        wait: 10 // Wait up to 10 minutes
      };

      // Preview command
      const args = this.commandBuilder.buildScratchOrgCreate(request);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Command preview: ${preview}`);

      const confirm = await vscode.window.showInformationMessage(
        `Create scratch org "${alias}"?`,
        { detail: preview, modal: true },
        'Create'
      );

      if (confirm !== 'Create') {
        return;
      }

      // Execute command
      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        `Creating scratch org "${alias}"...`
      );

      if (result.success && result.data?.result) {
        const orgInfo = result.data.result;
        vscode.window.showInformationMessage(
          `Scratch org "${alias}" created successfully!\nUsername: ${orgInfo.username}`
        );

        // Refresh tree views
        await vscode.commands.executeCommand('sfPackageManager.refreshAll');
      } else {
        throw new Error(result.error || 'Failed to create scratch org');
      }
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to create scratch org');
    }
  }

  /**
   * List all orgs
   */
  async listOrgs(): Promise<void> {
    try {
      Logger.info('Listing all orgs');

      const args = this.commandBuilder.buildOrgList();
      const result = await this.cliExecutor.execute('sf', args);

      if (result.success && result.data?.result) {
        const orgs = [
          ...(result.data.result.scratchOrgs || []),
          ...(result.data.result.nonScratchOrgs || [])
        ];

        if (orgs.length === 0) {
          vscode.window.showInformationMessage('No orgs found');
          return;
        }

        // Display in quick pick
        const items = orgs.map((org: any) => ({
          label: org.alias || org.username,
          description: org.username,
          detail: `${org.isDefaultDevHubUsername ? '[Dev Hub] ' : ''}${org.instanceUrl || ''}${
            org.expirationDate ? ` | Expires: ${new Date(org.expirationDate).toLocaleDateString()}` : ''
          }`,
          org: org
        }));

        const selected = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select an org to view details'
        });

        if (selected) {
          await this.showOrgDetails(selected.org.username);
        }
      }
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to list orgs');
    }
  }

  /**
   * Show org details
   */
  async showOrgDetails(targetOrg: string): Promise<void> {
    try {
      const args = this.commandBuilder.buildOrgDisplay(targetOrg);
      const result = await this.cliExecutor.execute('sf', args);

      if (result.success && result.data?.result) {
        const org = result.data.result;

        const message = `
**Org Details**

Alias: ${org.alias || 'N/A'}
Username: ${org.username}
Org ID: ${org.id}
Instance URL: ${org.instanceUrl}
API Version: ${org.apiVersion || 'N/A'}
${org.expirationDate ? `Expiration: ${new Date(org.expirationDate).toLocaleDateString()}` : ''}
Status: ${org.status || 'Active'}
        `.trim();

        await vscode.window.showInformationMessage(message, { modal: true });
      }
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to show org details');
    }
  }

  /**
   * Delete scratch org
   */
  async deleteScratchOrg(): Promise<void> {
    try {
      Logger.info('Starting scratch org deletion');

      // List scratch orgs
      const args = this.commandBuilder.buildOrgList();
      const result = await this.cliExecutor.execute('sf', args);

      if (!result.success || !result.data?.result) {
        throw new Error('Failed to list orgs');
      }

      const scratchOrgs = result.data.result.scratchOrgs || [];

      if (scratchOrgs.length === 0) {
        vscode.window.showInformationMessage('No scratch orgs found');
        return;
      }

      // Select scratch org to delete
      interface ScratchOrgItem extends vscode.QuickPickItem {
        username: string;
      }

      const items: ScratchOrgItem[] = scratchOrgs.map((org: any) => ({
        label: org.alias || org.username,
        description: org.username,
        detail: `Expires: ${org.expirationDate ? new Date(org.expirationDate).toLocaleDateString() : 'N/A'}`,
        username: org.username
      }));

      const selected = await vscode.window.showQuickPick<ScratchOrgItem>(items, {
        placeHolder: 'Select scratch org to delete'
      });

      if (!selected) {
        return;
      }

      // Confirm deletion
      const confirm = await vscode.window.showWarningMessage(
        `Delete scratch org "${selected.label}"?`,
        { modal: true },
        'Delete'
      );

      if (confirm !== 'Delete') {
        return;
      }

      // Execute deletion
      const deleteArgs = this.commandBuilder.buildOrgDelete(selected.username);
      const deleteResult = await this.cliExecutor.executeWithProgress(
        'sf',
        deleteArgs,
        `Deleting scratch org "${selected.label}"...`
      );

      if (deleteResult.success) {
        vscode.window.showInformationMessage(
          `Scratch org "${selected.label}" deleted successfully`
        );

        // Refresh tree views
        await vscode.commands.executeCommand('sfPackageManager.refreshAll');
      } else {
        throw new Error(deleteResult.error || 'Failed to delete scratch org');
      }
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to delete scratch org');
    }
  }

  /**
   * Quick workflow: Create scratch org and install package
   */
  async createAndInstallPackage(versionId?: string): Promise<void> {
    try {
      Logger.info('Starting create scratch org and install package workflow');

      // Step 1: Create scratch org (simplified)
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage('No Dev Hub configured');
        return;
      }

      // Find definition file
      const definitionFiles = await vscode.workspace.findFiles(
        '**/project-scratch-def.json',
        '**/node_modules/**',
        10
      );

      if (definitionFiles.length === 0) {
        vscode.window.showErrorMessage('No project-scratch-def.json found');
        return;
      }

      const definitionFile = vscode.workspace.asRelativePath(definitionFiles[0]);

      // Ask for alias
      const alias = await vscode.window.showInputBox({
        prompt: 'Enter alias for new scratch org',
        placeHolder: 'test-install-org',
        value: `test-${Date.now()}`
      });

      if (!alias) {
        return;
      }

      // Create scratch org
      const request: ScratchOrgCreateRequest = {
        definitionFile,
        devHub,
        alias,
        durationDays: 7,
        setDefault: true,
        wait: 10
      };

      const createArgs = this.commandBuilder.buildScratchOrgCreate(request);
      const createResult = await this.cliExecutor.executeWithProgress(
        'sf',
        createArgs,
        `Creating scratch org "${alias}"...`
      );

      if (!createResult.success) {
        throw new Error('Failed to create scratch org');
      }

      vscode.window.showInformationMessage(
        `Scratch org "${alias}" created! Now installing package...`
      );

      // Step 2: Install package
      if (versionId) {
        // Use the provided version ID
        await vscode.commands.executeCommand(
          'sfPackageManager.installPackage',
          versionId,
          alias
        );
      } else {
        // Open install form
        await vscode.commands.executeCommand('sfPackageManager.installPackageForm');
      }
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to create scratch org and install package');
    }
  }

  /**
   * Open a scratch org in the browser
   */
  async openScratchOrg(targetOrg?: string): Promise<void> {
    try {
      Logger.info('Opening scratch org in browser');

      let orgToOpen = targetOrg;

      if (!orgToOpen) {
        // Check for default target org first
        const defaultTargetOrg = this.configService.getDefaultTargetOrg();

        if (defaultTargetOrg) {
          const choice = await vscode.window.showQuickPick(
            [
              { label: `Open ${defaultTargetOrg}`, value: defaultTargetOrg, description: '(Default Target Org)' },
              { label: 'Choose different org...', value: '__choose__', description: '' }
            ],
            { placeHolder: 'Select org to open' }
          );

          if (!choice) {
            return;
          }

          if (choice.value !== '__choose__') {
            orgToOpen = choice.value;
          }
        }

        // If still no org selected, show list
        if (!orgToOpen) {
          const args = this.commandBuilder.buildOrgList();
          const result = await this.cliExecutor.execute('sf', args);

          if (!result.success || !result.data?.result) {
            throw new Error('Failed to list orgs');
          }

          const scratchOrgs = result.data.result.scratchOrgs || [];

          if (scratchOrgs.length === 0) {
            vscode.window.showInformationMessage('No scratch orgs found');
            return;
          }

          interface OrgItem extends vscode.QuickPickItem {
            username: string;
          }

          const items: OrgItem[] = scratchOrgs.map((org: any) => ({
            label: org.alias || org.username,
            description: org.username,
            detail: `Expires: ${org.expirationDate ? new Date(org.expirationDate).toLocaleDateString() : 'N/A'}`,
            username: org.username
          }));

          const selected = await vscode.window.showQuickPick<OrgItem>(items, {
            placeHolder: 'Select scratch org to open'
          });

          if (!selected) {
            return;
          }

          orgToOpen = selected.username;
        }
      }

      // Open the org
      const openArgs = this.commandBuilder.buildOrgOpen(orgToOpen);
      const openResult = await this.cliExecutor.executeWithProgress(
        'sf',
        openArgs,
        `Opening ${orgToOpen} in browser...`
      );

      if (openResult.success) {
        vscode.window.showInformationMessage(`Opened ${orgToOpen} in browser`);
      } else {
        throw new Error(openResult.error || 'Failed to open org');
      }
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to open scratch org');
    }
  }

  /**
   * Generate a scratch org definition file
   */
  async generateScratchDef(config?: ScratchDefConfig): Promise<string | undefined> {
    try {
      Logger.info('Generating scratch org definition file');

      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      let scratchConfig: ScratchDefConfig;

      if (config) {
        scratchConfig = config;
      } else {
        // Interactive wizard
        // 1. Edition selection
        const editionOptions = [
          { label: 'Developer', description: 'Best for development and testing' },
          { label: 'Enterprise', description: 'Full-featured edition' },
          { label: 'Group', description: 'Collaborative edition' },
          { label: 'Professional', description: 'Standard edition' }
        ];

        const selectedEdition = await vscode.window.showQuickPick(editionOptions, {
          placeHolder: 'Select Salesforce edition'
        });

        if (!selectedEdition) {
          return;
        }

        // 2. Org name (optional)
        const orgName = await vscode.window.showInputBox({
          prompt: 'Enter org name (optional)',
          placeHolder: 'My Scratch Org'
        });

        // 3. Features (multi-select)
        const featureOptions = [
          { label: 'API', picked: true },
          { label: 'AuthorApex', picked: true },
          { label: 'Communities' },
          { label: 'ContactsToMultipleAccounts' },
          { label: 'DebugApex', picked: true },
          { label: 'EnableSetPasswordInApi' },
          { label: 'Knowledge' },
          { label: 'LiveAgent' },
          { label: 'MultiCurrency' },
          { label: 'PersonAccounts' },
          { label: 'ServiceCloud' },
          { label: 'Sites' }
        ];

        const selectedFeatures = await vscode.window.showQuickPick(featureOptions, {
          placeHolder: 'Select features to enable (optional)',
          canPickMany: true
        });

        // 4. Enable Lightning Experience
        const enableLightning = await vscode.window.showQuickPick(
          [
            { label: 'Yes', value: true },
            { label: 'No', value: false }
          ],
          { placeHolder: 'Enable Lightning Experience?' }
        );

        scratchConfig = {
          orgName: orgName || undefined,
          edition: selectedEdition.label as ScratchDefConfig['edition'],
          features: selectedFeatures?.map(f => f.label) || [],
          enableLightningExperience: enableLightning?.value ?? true
        };
      }

      // Build the scratch def JSON
      const scratchDef: any = {
        orgName: scratchConfig.orgName || 'SF Package Manager Scratch Org',
        edition: scratchConfig.edition
      };

      if (scratchConfig.features.length > 0) {
        scratchDef.features = scratchConfig.features;
      }

      scratchDef.settings = {
        lightningExperienceSettings: {
          enableS1DesktopEnabled: scratchConfig.enableLightningExperience
        },
        mobileSettings: {
          enableS1EncryptedStoragePref2: false
        }
      };

      // Determine output path
      const configDir = path.join(workspaceFolders[0].uri.fsPath, 'config');
      const filePath = path.join(configDir, 'project-scratch-def.json');

      // Create config directory if it doesn't exist
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Check if file exists
      if (fs.existsSync(filePath)) {
        const overwrite = await vscode.window.showWarningMessage(
          'project-scratch-def.json already exists. Overwrite?',
          'Overwrite',
          'Cancel'
        );
        if (overwrite !== 'Overwrite') {
          return;
        }
      }

      // Write the file
      const content = JSON.stringify(scratchDef, null, 2);
      fs.writeFileSync(filePath, content, 'utf8');

      Logger.info(`Scratch org definition file created: ${filePath}`);
      vscode.window.showInformationMessage(
        `Created scratch org definition: config/project-scratch-def.json`
      );

      // Open the file
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc);

      return filePath;
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to generate scratch org definition');
      return undefined;
    }
  }

  /**
   * Set an org as the default target org
   */
  async setDefaultOrg(username?: string): Promise<void> {
    try {
      Logger.info('Setting default target org');

      let orgToSet = username;

      if (!orgToSet) {
        // List orgs for selection
        const args = this.commandBuilder.buildOrgList();
        const result = await this.cliExecutor.execute('sf', args);

        if (!result.success || !result.data?.result) {
          throw new Error('Failed to list orgs');
        }

        const allOrgs = [
          ...(result.data.result.scratchOrgs || []),
          ...(result.data.result.nonScratchOrgs || [])
        ];

        if (allOrgs.length === 0) {
          vscode.window.showInformationMessage('No orgs found');
          return;
        }

        interface OrgItem extends vscode.QuickPickItem {
          username: string;
        }

        const items: OrgItem[] = allOrgs.map((org: any) => ({
          label: org.alias || org.username,
          description: org.username,
          detail: org.isDefaultUsername ? '(Current Default)' : '',
          username: org.username
        }));

        const selected = await vscode.window.showQuickPick<OrgItem>(items, {
          placeHolder: 'Select org to set as default'
        });

        if (!selected) {
          return;
        }

        orgToSet = selected.username;
      }

      // Update the config
      await this.configService.setDefaultTargetOrg(orgToSet);

      Logger.info(`Set default target org to: ${orgToSet}`);
      vscode.window.showInformationMessage(`Default target org set to: ${orgToSet}`);

      // Refresh tree views
      await vscode.commands.executeCommand('sfPackageManager.refreshAll');
    } catch (error) {
      ErrorHandler.handle(error, 'Failed to set default org');
    }
  }

  /**
   * Get list of scratch orgs for dashboard
   */
  async getScratchOrgs(): Promise<any[]> {
    try {
      const args = this.commandBuilder.buildOrgList();
      const result = await this.cliExecutor.execute('sf', args);

      if (result.success && result.data?.result) {
        return result.data.result.scratchOrgs || [];
      }
      return [];
    } catch (error) {
      Logger.error(`Failed to get scratch orgs: ${error}`);
      return [];
    }
  }

  /**
   * Get list of definition files in workspace
   */
  async getDefinitionFiles(): Promise<string[]> {
    const files = await vscode.workspace.findFiles(
      '**/*scratch-def*.json',
      '**/node_modules/**',
      20
    );
    return files.map(uri => vscode.workspace.asRelativePath(uri));
  }
}
