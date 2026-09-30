import * as vscode from 'vscode';
import { CliExecutor } from '../services/cliExecutor';
import { CommandBuilder } from '../services/commandBuilder';
import { ConfigService } from '../services/configService';
import { ProjectService } from '../services/projectService';
import { DependencyGraphService, DependencyGraph } from '../services/dependencyGraphService';
import { VersionComparisonService } from '../services/versionComparisonService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';
import {
  PackageVersion,
  PackageVersionCreateRequest,
  PackageVersionCreateRequestStatus
} from '../models/packageVersion';

export class VersionCommands {
  private dependencyGraphService: DependencyGraphService;
  private versionComparisonService: VersionComparisonService;

  constructor(
    private cliExecutor: CliExecutor,
    private commandBuilder: CommandBuilder,
    private configService: ConfigService,
    private projectService: ProjectService
  ) {
    this.dependencyGraphService = new DependencyGraphService();
    this.versionComparisonService = new VersionComparisonService(cliExecutor, commandBuilder);
  }

  async listVersions(packageId?: string): Promise<PackageVersion[] | null> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return null;
      }

      const args = this.commandBuilder.buildPackageVersionList(devHub, packageId);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Listing package versions: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Loading package versions...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to list package versions');
        return null;
      }

      const versions = result.data?.result || [];
      Logger.info(`Found ${versions.length} package version(s)`);

      return versions;
    } catch (error) {
      ErrorHandler.handle(error, 'Error listing package versions');
      return null;
    }
  }

  async createVersionSimple(packageId?: string): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      // Get package ID if not provided
      if (!packageId) {
        packageId = await vscode.window.showInputBox({
          prompt: 'Enter package ID or alias',
          placeHolder: '0Ho... or package alias'
        });
      }

      if (!packageId) {
        return;
      }

      // Get version name (optional)
      const versionName = await vscode.window.showInputBox({
        prompt: 'Enter version name (optional)',
        placeHolder: 'ver 0.1'
      });

      // Get version number (optional)
      const versionNumber = await vscode.window.showInputBox({
        prompt: 'Enter version number (optional)',
        placeHolder: '0.1.0.NEXT',
        validateInput: (value) => {
          if (value && !/^\d+\.\d+\.\d+\.(NEXT|\d+)$/.test(value)) {
            return 'Version number must be in format: major.minor.patch.NEXT or major.minor.patch.build';
          }
          return null;
        }
      });

      // Ask about code coverage
      const codeCoverage = await vscode.window.showQuickPick(
        ['Yes', 'No'],
        {
          placeHolder: 'Calculate code coverage? (Required for promotion)',
          canPickMany: false
        }
      );

      // Ask about installation key
      const installationKeyChoice = await vscode.window.showQuickPick(
        ['Bypass (no key required)', 'Set installation key'],
        {
          placeHolder: 'Installation key option',
          canPickMany: false
        }
      );

      let installationKey: string | undefined;
      let installationKeyBypass = false;

      if (installationKeyChoice === 'Bypass (no key required)') {
        installationKeyBypass = true;
      } else if (installationKeyChoice === 'Set installation key') {
        installationKey = await vscode.window.showInputBox({
          prompt: 'Enter installation key',
          password: true,
          validateInput: (value) => {
            if (!value || value.length < 12) {
              return 'Installation key must be at least 12 characters';
            }
            return null;
          }
        });

        if (!installationKey) {
          return;
        }
      }

      // Get wait time
      const defaultWaitTime = this.configService.getDefaultWaitTime();
      const waitTimeInput = await vscode.window.showInputBox({
        prompt: 'Wait time in minutes (0 = no wait)',
        placeHolder: defaultWaitTime.toString(),
        value: defaultWaitTime.toString(),
        validateInput: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 0 || num > 120) {
            return 'Wait time must be between 0 and 120 minutes';
          }
          return null;
        }
      });

      const waitTime = waitTimeInput ? parseInt(waitTimeInput) : defaultWaitTime;

      // Build request
      const request: PackageVersionCreateRequest = {
        package: packageId,
        versionName: versionName || undefined,
        versionNumber: versionNumber || undefined,
        codeCoverage: codeCoverage === 'Yes',
        installationKey: installationKey,
        installationKeyBypass: installationKeyBypass,
        wait: waitTime
      };

      const args = this.commandBuilder.buildPackageVersionCreate(request, devHub);
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

      Logger.info(`Creating package version: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        waitTime > 0
          ? `Creating package version (waiting up to ${waitTime} minutes)...`
          : 'Creating package version...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to create package version');
        return;
      }

      const versionData = result.data?.result;

      if (versionData?.Status === 'Success') {
        const subscriberVersionId = versionData.SubscriberPackageVersionId;
        vscode.window.showInformationMessage(
          `Package version created successfully! Version ID: ${subscriberVersionId}`
        );
        Logger.info(`Package version created: ${subscriberVersionId}`);
      } else if (versionData?.Status === 'InProgress' || versionData?.Status === 'Queued') {
        const requestId = versionData.Id;
        vscode.window.showInformationMessage(
          `Package version creation in progress. Request ID: ${requestId}. Use "Check Version Creation Status" to monitor.`
        );
        Logger.info(`Package version creation request: ${requestId}`);
      } else {
        vscode.window.showWarningMessage(
          `Package version creation status: ${versionData?.Status}`
        );
      }
    } catch (error) {
      ErrorHandler.handle(error, 'Error creating package version');
    }
  }

  async checkVersionCreationStatus(): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      const requestId = await vscode.window.showInputBox({
        prompt: 'Enter package version create request ID',
        placeHolder: '08c...'
      });

      if (!requestId) {
        return;
      }

      const args = this.commandBuilder.buildPackageVersionCreateReport(requestId, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Checking version creation status: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Checking version creation status...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to check version creation status');
        return;
      }

      const status: PackageVersionCreateRequestStatus = result.data?.result;

      if (status.Status === 'Success') {
        vscode.window.showInformationMessage(
          `Version creation succeeded! Version ID: ${status.SubscriberPackageVersionId}`
        );
      } else if (status.Status === 'InProgress' || status.Status === 'Queued') {
        vscode.window.showInformationMessage(`Version creation status: ${status.Status}`);
      } else if (status.Status === 'Error') {
        const errors = status.Error?.join(', ') || 'Unknown error';
        vscode.window.showErrorMessage(`Version creation failed: ${errors}`);
      }

      Logger.info(`Version creation status: ${status.Status}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error checking version creation status');
    }
  }

  async promoteVersion(version?: PackageVersion): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      let versionId: string | undefined;

      if (version) {
        versionId = version.SubscriberPackageVersionId;
      } else {
        versionId = await vscode.window.showInputBox({
          prompt: 'Enter package version ID (04t...)',
          placeHolder: '04t...'
        });
      }

      if (!versionId) {
        return;
      }

      // Confirm promotion
      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to promote version ${versionId} to Released? This cannot be undone.`,
        { modal: true },
        'Promote',
        'Cancel'
      );

      if (confirmation !== 'Promote') {
        return;
      }

      const args = this.commandBuilder.buildPackageVersionPromote(versionId, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Promoting package version: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Promoting package version...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to promote package version');
        return;
      }

      vscode.window.showInformationMessage(
        `Package version ${versionId} promoted to Released successfully!`
      );

      Logger.info(`Package version promoted: ${versionId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error promoting package version');
    }
  }

  async deleteVersion(version?: PackageVersion): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      let versionId: string | undefined;

      if (version) {
        versionId = version.SubscriberPackageVersionId;

        // Check if version is released
        if (version.IsReleased) {
          vscode.window.showErrorMessage(
            'Cannot delete a released version. Only beta versions can be deleted.'
          );
          return;
        }
      } else {
        versionId = await vscode.window.showInputBox({
          prompt: 'Enter beta package version ID (04t...)',
          placeHolder: '04t...'
        });
      }

      if (!versionId) {
        return;
      }

      // Confirm deletion
      const confirmation = await vscode.window.showWarningMessage(
        `Are you sure you want to delete version ${versionId}?`,
        { modal: true },
        'Delete',
        'Cancel'
      );

      if (confirmation !== 'Delete') {
        return;
      }

      const args = this.commandBuilder.buildPackageVersionDelete(versionId, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Deleting package version: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Deleting package version...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to delete package version');
        return;
      }

      vscode.window.showInformationMessage(
        `Package version ${versionId} deleted successfully!`
      );

      Logger.info(`Package version deleted: ${versionId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error deleting package version');
    }
  }

  async showVersionReport(version?: PackageVersion): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      let versionId: string | undefined;

      if (version) {
        versionId = version.SubscriberPackageVersionId;
      } else {
        versionId = await vscode.window.showInputBox({
          prompt: 'Enter package version ID (04t...)',
          placeHolder: '04t...'
        });
      }

      if (!versionId) {
        return;
      }

      const args = this.commandBuilder.buildPackageVersionReport(versionId, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Getting version report: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Loading version details...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to get version report');
        return;
      }

      const versionData: PackageVersion = result.data?.result;

      // Format and display the version information
      const info = [
        `**Version ID:** ${versionData.SubscriberPackageVersionId}`,
        `**Name:** ${versionData.Name}`,
        `**Version:** ${versionData.MajorVersion}.${versionData.MinorVersion}.${versionData.PatchVersion}.${versionData.BuildNumber}`,
        `**Status:** ${versionData.IsReleased ? 'Released' : 'Beta'}`,
        `**Package ID:** ${versionData.Package2Id}`,
        versionData.Description ? `**Description:** ${versionData.Description}` : '',
        versionData.Tag ? `**Tag:** ${versionData.Tag}` : '',
        versionData.Branch ? `**Branch:** ${versionData.Branch}` : '',
        versionData.HasPassedCodeCoverageCheck !== undefined
          ? `**Code Coverage:** ${versionData.HasPassedCodeCoverageCheck ? 'Passed' : 'Not Passed'} ${versionData.CodeCoverage ? `(${versionData.CodeCoverage}%)` : ''}`
          : '',
        `**Created:** ${versionData.CreatedDate}`
      ].filter(line => line).join('\n\n');

      const panel = vscode.window.createWebviewPanel(
        'versionReport',
        `Version Report: ${versionData.Name}`,
        vscode.ViewColumn.One,
        {}
      );

      panel.webview.html = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: var(--vscode-font-family);
              padding: 20px;
              color: var(--vscode-foreground);
            }
            h1 { color: var(--vscode-textLink-foreground); }
            pre {
              background: var(--vscode-textCodeBlock-background);
              padding: 10px;
              border-radius: 4px;
            }
          </style>
        </head>
        <body>
          <h1>Package Version Details</h1>
          <div>${info.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n\n/g, '<br><br>')}</div>
        </body>
        </html>
      `;

      Logger.info(`Displayed version report for ${versionId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error showing version report');
    }
  }

  async displayAncestry(version?: PackageVersion): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      let versionId: string | undefined;

      if (version) {
        versionId = version.SubscriberPackageVersionId;
      } else {
        versionId = await vscode.window.showInputBox({
          prompt: 'Enter package version ID (04t...)',
          placeHolder: '04t...'
        });
      }

      if (!versionId) {
        return;
      }

      const args = this.commandBuilder.buildPackageVersionDisplayAncestry(versionId, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Getting version ancestry: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Loading version ancestry...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to get version ancestry');
        return;
      }

      const ancestryData = result.data?.result;

      // Create visualization panel
      const panel = vscode.window.createWebviewPanel(
        'versionAncestry',
        `Version Ancestry: ${versionId}`,
        vscode.ViewColumn.One,
        {}
      );

      panel.webview.html = this.createAncestryVisualization(ancestryData);

      Logger.info(`Displayed version ancestry for ${versionId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error displaying version ancestry');
    }
  }

  async displayDependencies(version?: PackageVersion): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      let versionId: string | undefined;

      if (version) {
        versionId = version.SubscriberPackageVersionId;
      } else {
        versionId = await vscode.window.showInputBox({
          prompt: 'Enter package version ID (04t...)',
          placeHolder: '04t...'
        });
      }

      if (!versionId) {
        return;
      }

      const args = this.commandBuilder.buildPackageVersionDisplayDependencies(versionId, devHub);
      const preview = this.commandBuilder.previewCommand('sf', args);
      Logger.info(`Getting version dependencies: ${preview}`);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Loading version dependencies...'
      );

      if (!result.success) {
        ErrorHandler.handle(result.error, 'Failed to get version dependencies');
        return;
      }

      const dependenciesData = result.data?.result;

      // Create dependency graph
      const packageName = version?.Name || 'Package';
      const graph = this.dependencyGraphService.createGraph(packageName, dependenciesData || []);

      // Create visualization panel
      const panel = vscode.window.createWebviewPanel(
        'versionDependencies',
        `Version Dependencies: ${versionId}`,
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = this.createDependenciesVisualization(dependenciesData, graph);

      Logger.info(`Displayed version dependencies for ${versionId}`);
    } catch (error) {
      ErrorHandler.handle(error, 'Error displaying version dependencies');
    }
  }

  private createAncestryVisualization(ancestryData: any): string {
    // Parse ancestry data and create tree visualization
    const versions = ancestryData || [];

    let ancestryTree = '<ul class="ancestry-tree">';

    versions.forEach((item: any, index: number) => {
      const indent = index * 20;
      const status = item.IsReleased ? '✓ Released' : '🧪 Beta';
      const version = `${item.MajorVersion}.${item.MinorVersion}.${item.PatchVersion}.${item.BuildNumber}`;

      ancestryTree += `
        <li style="margin-left: ${indent}px;">
          <div class="version-node">
            <span class="version-number">${version}</span>
            <span class="version-status">${status}</span>
            <span class="version-id">${item.SubscriberPackageVersionId}</span>
          </div>
        </li>
      `;
    });

    ancestryTree += '</ul>';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
          }
          h1 { color: var(--vscode-textLink-foreground); }
          .ancestry-tree {
            list-style: none;
            padding-left: 0;
          }
          .ancestry-tree li {
            margin: 10px 0;
            position: relative;
          }
          .ancestry-tree li:before {
            content: '↓';
            position: absolute;
            left: -15px;
            color: var(--vscode-descriptionForeground);
          }
          .ancestry-tree li:first-child:before {
            content: '●';
          }
          .version-node {
            display: flex;
            gap: 15px;
            align-items: center;
            padding: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
          }
          .version-number {
            font-weight: bold;
            font-size: 1.1em;
          }
          .version-status {
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.9em;
            background: var(--vscode-textCodeBlock-background);
          }
          .version-id {
            color: var(--vscode-descriptionForeground);
            font-family: monospace;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <h1>📊 Version Ancestry Tree</h1>
        <p>Shows the lineage of package versions from newest (top) to oldest (bottom)</p>
        ${ancestryTree}
      </body>
      </html>
    `;
  }

  private createDependenciesVisualization(dependenciesData: any, graph: DependencyGraph): string {
    // Parse dependencies data
    const dependencies = dependenciesData || [];

    // Generate SVG graph
    const svgContent = this.dependencyGraphService.generateSVG(graph);

    let dependenciesHtml = '';

    if (dependencies.length === 0) {
      dependenciesHtml = '<p class="no-dependencies">This version has no dependencies</p>';
    } else {
      dependenciesHtml = '<div class="dependencies-list">';

      dependencies.forEach((dep: any) => {
        const depVersion = dep.subscriberPackageVersionId ?
          `${dep.subscriberPackageVersionId}` :
          'Not specified';

        dependenciesHtml += `
          <div class="dependency-card">
            <div class="dependency-header">
              <span class="dependency-name">${dep.subscriberPackageName || 'Unknown Package'}</span>
              <span class="dependency-namespace">${dep.subscriberPackageNamespace || 'No namespace'}</span>
            </div>
            <div class="dependency-details">
              <div class="detail-row">
                <span class="detail-label">Version ID:</span>
                <span class="detail-value">${depVersion}</span>
              </div>
              ${dep.versionNumber ? `
                <div class="detail-row">
                  <span class="detail-label">Version:</span>
                  <span class="detail-value">${dep.versionNumber}</span>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      });

      dependenciesHtml += '</div>';
    }

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
          }
          h1 { color: var(--vscode-textLink-foreground); }
          .view-toggle {
            display: flex;
            gap: 10px;
            margin: 20px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 5px;
          }
          .view-button {
            padding: 8px 16px;
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            font-size: 14px;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
          }
          .view-button:hover {
            background: var(--vscode-list-hoverBackground);
          }
          .view-button.active {
            color: var(--vscode-textLink-activeForeground);
            border-bottom-color: var(--vscode-textLink-activeForeground);
            font-weight: 500;
          }
          .view-content {
            display: none;
          }
          .view-content.active {
            display: block;
          }
          .no-dependencies {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
          }
          .dependencies-list {
            display: flex;
            flex-direction: column;
            gap: 15px;
          }
          .dependency-card {
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
          }
          .dependency-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 10px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .dependency-name {
            font-weight: bold;
            font-size: 1.1em;
          }
          .dependency-namespace {
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.85em;
            background: var(--vscode-textCodeBlock-background);
            color: var(--vscode-textLink-foreground);
          }
          .dependency-details {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .detail-row {
            display: flex;
            gap: 10px;
          }
          .detail-label {
            font-weight: 500;
            min-width: 100px;
            color: var(--vscode-descriptionForeground);
          }
          .detail-value {
            font-family: monospace;
            font-size: 0.9em;
          }
          .graph-container {
            display: flex;
            justify-content: center;
            padding: 20px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            overflow: auto;
          }
          .graph-container svg {
            max-width: 100%;
            height: auto;
          }
        </style>
      </head>
      <body>
        <h1>🔗 Package Dependencies</h1>
        <p>Shows all external packages that this version depends on</p>

        ${dependencies.length > 0 ? `
        <div class="view-toggle">
          <button class="view-button active" onclick="switchView('card')">📋 Card View</button>
          <button class="view-button" onclick="switchView('graph')">📊 Graph View</button>
        </div>

        <div id="card-view" class="view-content active">
          ${dependenciesHtml}
        </div>

        <div id="graph-view" class="view-content">
          <div class="graph-container">
            ${svgContent}
          </div>
        </div>
        ` : dependenciesHtml}

        <script>
          function switchView(view) {
            // Update button states
            const buttons = document.querySelectorAll('.view-button');
            buttons.forEach(btn => {
              if (btn.textContent.toLowerCase().includes(view)) {
                btn.classList.add('active');
              } else {
                btn.classList.remove('active');
              }
            });

            // Update view visibility
            const cardView = document.getElementById('card-view');
            const graphView = document.getElementById('graph-view');

            if (view === 'card') {
              cardView.classList.add('active');
              graphView.classList.remove('active');
            } else {
              cardView.classList.remove('active');
              graphView.classList.add('active');
            }
          }
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Compare two package versions
   */
  async compareVersions(version1?: PackageVersion, version2?: PackageVersion): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      if (!devHub) {
        vscode.window.showErrorMessage(
          'No Dev Hub configured. Please set sfPackageManager.defaultDevHub in settings.'
        );
        return;
      }

      // Get first version if not provided
      let v1 = version1;
      if (!v1) {
        const versions = await this.listVersions();
        if (!versions || versions.length === 0) {
          vscode.window.showInformationMessage('No versions found');
          return;
        }

        const items1 = versions.map(v => ({
          label: v.Name || `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}.${v.BuildNumber}`,
          description: v.SubscriberPackageVersionId,
          detail: `Released: ${v.IsReleased ? 'Yes' : 'No'} | Branch: ${v.Branch || 'N/A'}`,
          version: v
        }));

        const selected1 = await vscode.window.showQuickPick(items1, {
          placeHolder: 'Select the first version (old version)'
        });

        if (!selected1) {
          return;
        }

        v1 = selected1.version;
      }

      // Get second version if not provided
      let v2 = version2;
      if (!v2) {
        const versions = await this.listVersions();
        if (!versions || versions.length === 0) {
          vscode.window.showInformationMessage('No versions found');
          return;
        }

        // Filter out the first selected version
        const filteredVersions = versions.filter(
          v => v.SubscriberPackageVersionId !== v1!.SubscriberPackageVersionId
        );

        const items2 = filteredVersions.map(v => ({
          label: v.Name || `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}.${v.BuildNumber}`,
          description: v.SubscriberPackageVersionId,
          detail: `Released: ${v.IsReleased ? 'Yes' : 'No'} | Branch: ${v.Branch || 'N/A'}`,
          version: v
        }));

        const selected2 = await vscode.window.showQuickPick(items2, {
          placeHolder: 'Select the second version (new version)'
        });

        if (!selected2) {
          return;
        }

        v2 = selected2.version;
      }

      // Perform comparison
      Logger.info(`Comparing versions: ${v1.SubscriberPackageVersionId} vs ${v2.SubscriberPackageVersionId}`);

      const comparison = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Comparing versions...',
          cancellable: false
        },
        async () => {
          return await this.versionComparisonService.compareVersions(
            v1!.SubscriberPackageVersionId,
            v2!.SubscriberPackageVersionId,
            devHub
          );
        }
      );

      if (!comparison) {
        vscode.window.showErrorMessage('Failed to compare versions');
        return;
      }

      // Show comparison in webview
      const panel = vscode.window.createWebviewPanel(
        'versionComparison',
        `Compare: ${this.versionComparisonService.getVersionDisplayName(comparison.version1)} vs ${this.versionComparisonService.getVersionDisplayName(comparison.version2)}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      panel.webview.html = this.versionComparisonService.generateComparisonHtml(comparison);

      Logger.info('Version comparison completed successfully');
      vscode.window.showInformationMessage(
        `Found ${comparison.summary.metadataChanges} metadata changes between versions`
      );
    } catch (error) {
      Logger.error(`Failed to compare versions: ${error}`);
      ErrorHandler.handle(error, 'Failed to compare versions');
    }
  }
}
