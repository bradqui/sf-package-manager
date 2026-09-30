import * as vscode from 'vscode';
import { CommandBuilder } from '../../services/commandBuilder';
import { CliExecutor } from '../../services/cliExecutor';
import { ProjectService } from '../../services/projectService';
import { ConfigService } from '../../services/configService';
import { PackageVersionCreateRequest } from '../../models/packageVersion';
import { Logger } from '../../utils/logger';

export class VersionCreateWebview {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private commandBuilder: CommandBuilder,
    private cliExecutor: CliExecutor,
    private projectService: ProjectService,
    private configService: ConfigService
  ) {}

  async show(packageId?: string): Promise<void> {
    // Create or show panel
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'versionCreateForm',
      'Create Package Version',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Load data
    const packages = await this.loadPackages();
    const project = await this.projectService.getProject();
    const defaultPackage = packageId || (project?.packageDirectories?.[0]?.package);

    // Set HTML
    this.panel.webview.html = this.getHtmlContent(packages, defaultPackage);

    // Handle messages
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'preview':
            this.handlePreview(message.data);
            break;
          case 'create':
            await this.handleCreate(message.data);
            break;
          case 'cancel':
            this.panel?.dispose();
            break;
        }
      }
    );

    // Cleanup
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private async loadPackages(): Promise<any[]> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return [];
    }

    try {
      const args = this.commandBuilder.buildPackageList(devHub);
      const result = await this.cliExecutor.execute('sf', args);
      return result.success ? (result.data?.result || []) : [];
    } catch (error) {
      Logger.error(`Failed to load packages: ${error}`);
      return [];
    }
  }

  private handlePreview(data: any): void {
    const request: PackageVersionCreateRequest = this.buildRequest(data);
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return;
    }

    const args = this.commandBuilder.buildPackageVersionCreate(request, devHub);
    const preview = this.commandBuilder.previewCommand('sf', args);

    this.panel?.webview.postMessage({
      command: 'previewResult',
      preview: preview
    });
  }

  private async handleCreate(data: any): Promise<void> {
    const request: PackageVersionCreateRequest = this.buildRequest(data);
    const devHub = this.configService.getDefaultDevHub();

    if (!devHub) {
      vscode.window.showErrorMessage('No Dev Hub configured');
      return;
    }

    const args = this.commandBuilder.buildPackageVersionCreate(request, devHub);

    try {
      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        `Creating package version: ${request.package}`
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Package version creation started successfully`
        );
        this.panel?.dispose();
        vscode.commands.executeCommand('sfPackageManager.refresh');
      } else {
        vscode.window.showErrorMessage(`Failed to create version: ${result.error}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error creating version: ${error}`);
    }
  }

  private buildRequest(data: any): PackageVersionCreateRequest {
    const request: PackageVersionCreateRequest = {
      package: data.package
    };

    if (data.versionName) request.versionName = data.versionName;
    if (data.versionNumber) request.versionNumber = data.versionNumber;
    if (data.versionDescription) request.versionDescription = data.versionDescription;

    if (data.installationKeyBypass) {
      request.installationKeyBypass = true;
    } else if (data.installationKey) {
      request.installationKey = data.installationKey;
    }

    if (data.codeCoverage) request.codeCoverage = true;
    if (data.skipValidation) request.skipValidation = true;
    if (data.asyncValidation) request.asyncValidation = true;
    if (data.skipAncestorCheck) request.skipAncestorCheck = true;

    if (data.branch) request.branch = data.branch;
    if (data.tag) request.tag = data.tag;
    if (data.path) request.path = data.path;
    if (data.definitionFile) request.definitionFile = data.definitionFile;
    if (data.language) request.language = data.language;

    if (data.postInstallScript) request.postInstallScript = data.postInstallScript;
    if (data.postInstallUrl) request.postInstallUrl = data.postInstallUrl;
    if (data.releaseNotesUrl) request.releaseNotesUrl = data.releaseNotesUrl;
    if (data.uninstallScript) request.uninstallScript = data.uninstallScript;

    if (data.wait) request.wait = parseInt(data.wait);
    if (data.verbose) request.verbose = true;
    if (data.buildInstance) request.buildInstance = data.buildInstance;

    return request;
  }

  private getHtmlContent(packages: any[], defaultPackage?: string): string {
    const packageOptions = packages.map(pkg =>
      `<option value="${pkg.Id}" ${pkg.Id === defaultPackage || pkg.Name === defaultPackage ? 'selected' : ''}>${pkg.Name} (${pkg.ContainerOptions})</option>`
    ).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            max-width: 1000px;
            margin: 0 auto;
          }
          h1 {
            color: var(--vscode-textLink-foreground);
            margin-bottom: 30px;
          }
          .section {
            margin-bottom: 30px;
            padding: 20px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
          }
          .section-title {
            font-size: 1.1em;
            font-weight: 600;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .form-group {
            margin-bottom: 15px;
          }
          label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
          }
          input[type="text"],
          input[type="number"],
          select,
          textarea {
            width: 100%;
            padding: 8px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
          }
          input[type="text"]:focus,
          input[type="number"]:focus,
          select:focus,
          textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
          }
          textarea {
            min-height: 60px;
            resize: vertical;
          }
          .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
          }
          input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
          }
          .help-text {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
          }
          .button-group {
            display: flex;
            gap: 10px;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--vscode-panel-border);
          }
          button {
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            font-weight: 500;
          }
          .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }
          .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
          }
          .preview-section {
            margin-top: 30px;
            padding: 15px;
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            display: none;
          }
          .preview-section.visible {
            display: block;
          }
          .preview-title {
            font-weight: 600;
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
          }
          .preview-command {
            font-family: monospace;
            font-size: 12px;
            word-break: break-all;
            padding: 10px;
            background: var(--vscode-editor-background);
            border-radius: 3px;
          }
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          @media (max-width: 768px) {
            .grid-2 {
              grid-template-columns: 1fr;
            }
          }
        </style>
      </head>
      <body>
        <h1>📦 Create Package Version</h1>

        <form id="versionForm">
          <!-- Basic Information -->
          <div class="section">
            <div class="section-title">
              📋 Basic Information
            </div>
            <div class="form-group">
              <label for="package">Package *</label>
              <select id="package" required>
                <option value="">Select a package...</option>
                ${packageOptions}
              </select>
              <div class="help-text">The package to create a version for</div>
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label for="versionName">Version Name</label>
                <input type="text" id="versionName" placeholder="e.g., Spring '24">
                <div class="help-text">Human-readable version name</div>
              </div>
              <div class="form-group">
                <label for="versionNumber">Version Number</label>
                <input type="text" id="versionNumber" placeholder="1.0.0.NEXT" value="1.0.0.NEXT">
                <div class="help-text">Format: Major.Minor.Patch.Build (use NEXT for auto-increment)</div>
              </div>
            </div>
            <div class="form-group">
              <label for="versionDescription">Description</label>
              <textarea id="versionDescription" placeholder="Describe the changes in this version..."></textarea>
            </div>
          </div>

          <!-- Installation & Security -->
          <div class="section">
            <div class="section-title">
              🔒 Installation & Security
            </div>
            <div class="checkbox-group">
              <input type="checkbox" id="installationKeyBypass">
              <label for="installationKeyBypass" style="margin-bottom: 0;">Bypass Installation Key</label>
            </div>
            <div class="help-text" style="margin-left: 24px; margin-bottom: 15px;">
              Allow installation without a key (not recommended for production)
            </div>
            <div class="form-group" id="installationKeyGroup">
              <label for="installationKey">Installation Key</label>
              <input type="text" id="installationKey" placeholder="Enter installation key...">
              <div class="help-text">Required key for package installation</div>
            </div>
          </div>

          <!-- Testing & Validation -->
          <div class="section">
            <div class="section-title">
              ✅ Testing & Validation
            </div>
            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="codeCoverage" checked>
                <label for="codeCoverage" style="margin-bottom: 0;">Calculate Code Coverage</label>
              </div>
              <div class="help-text" style="margin-left: 24px;">Run Apex tests and calculate code coverage (required for promotion)</div>
            </div>
            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="skipValidation">
                <label for="skipValidation" style="margin-bottom: 0;">Skip Validation</label>
              </div>
              <div class="help-text" style="margin-left: 24px;">Skip metadata validation (not recommended)</div>
            </div>
            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="asyncValidation">
                <label for="asyncValidation" style="margin-bottom: 0;">Asynchronous Validation</label>
              </div>
              <div class="help-text" style="margin-left: 24px;">Run validation asynchronously</div>
            </div>
            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="skipAncestorCheck">
                <label for="skipAncestorCheck" style="margin-bottom: 0;">Skip Ancestor Check</label>
              </div>
              <div class="help-text" style="margin-left: 24px;">Skip checking for ancestor versions</div>
            </div>
          </div>

          <!-- Source Control -->
          <div class="section">
            <div class="section-title">
              🔀 Source Control
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label for="branch">Branch</label>
                <input type="text" id="branch" placeholder="e.g., main">
                <div class="help-text">Git branch for this version</div>
              </div>
              <div class="form-group">
                <label for="tag">Tag</label>
                <input type="text" id="tag" placeholder="e.g., v1.0.0">
                <div class="help-text">Git tag for this version</div>
              </div>
            </div>
          </div>

          <!-- Configuration -->
          <div class="section">
            <div class="section-title">
              ⚙️ Configuration
            </div>
            <div class="form-group">
              <label for="path">Package Path</label>
              <input type="text" id="path" placeholder="force-app">
              <div class="help-text">Path to package directory (overrides sfdx-project.json)</div>
            </div>
            <div class="form-group">
              <label for="definitionFile">Definition File</label>
              <input type="text" id="definitionFile" placeholder="config/project-scratch-def.json">
              <div class="help-text">Path to scratch org definition file</div>
            </div>
            <div class="form-group">
              <label for="language">Language</label>
              <select id="language">
                <option value="">Default</option>
                <option value="en_US">English (US)</option>
                <option value="de">German</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="it">Italian</option>
                <option value="ja">Japanese</option>
                <option value="ko">Korean</option>
                <option value="pt_BR">Portuguese (Brazil)</option>
                <option value="zh_CN">Chinese (Simplified)</option>
                <option value="zh_TW">Chinese (Traditional)</option>
              </select>
              <div class="help-text">Language for translations</div>
            </div>
          </div>

          <!-- Managed Package Options -->
          <div class="section">
            <div class="section-title">
              📦 Managed Package Options
            </div>
            <div class="form-group">
              <label for="postInstallScript">Post-Install Script</label>
              <input type="text" id="postInstallScript" placeholder="e.g., PostInstallClass">
              <div class="help-text">Apex class to run after installation</div>
            </div>
            <div class="form-group">
              <label for="postInstallUrl">Post-Install URL</label>
              <input type="text" id="postInstallUrl" placeholder="https://example.com/post-install">
              <div class="help-text">URL to display after installation</div>
            </div>
            <div class="form-group">
              <label for="releaseNotesUrl">Release Notes URL</label>
              <input type="text" id="releaseNotesUrl" placeholder="https://example.com/release-notes">
              <div class="help-text">URL for release notes</div>
            </div>
            <div class="form-group">
              <label for="uninstallScript">Uninstall Script</label>
              <input type="text" id="uninstallScript" placeholder="e.g., UninstallClass">
              <div class="help-text">Apex class to run before uninstallation</div>
            </div>
          </div>

          <!-- Execution Options -->
          <div class="section">
            <div class="section-title">
              ⚡ Execution Options
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label for="wait">Wait Time (minutes)</label>
                <input type="number" id="wait" value="10" min="1" max="60">
                <div class="help-text">How long to wait for version creation</div>
              </div>
              <div class="form-group">
                <label for="buildInstance">Build Instance</label>
                <input type="text" id="buildInstance" placeholder="e.g., CS42">
                <div class="help-text">Specific Salesforce instance for build</div>
              </div>
            </div>
            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="verbose">
                <label for="verbose" style="margin-bottom: 0;">Verbose Output</label>
              </div>
              <div class="help-text" style="margin-left: 24px;">Show detailed command output</div>
            </div>
          </div>

          <!-- Command Preview -->
          <div class="preview-section" id="previewSection">
            <div class="preview-title">Command Preview:</div>
            <div class="preview-command" id="previewCommand"></div>
          </div>

          <!-- Actions -->
          <div class="button-group">
            <button type="button" class="btn-primary" onclick="createVersion()">
              Create Version
            </button>
            <button type="button" class="btn-secondary" onclick="previewCommand()">
              Preview Command
            </button>
            <button type="button" class="btn-secondary" onclick="cancel()">
              Cancel
            </button>
          </div>
        </form>

        <script>
          const vscode = acquireVsCodeApi();

          // Toggle installation key field based on bypass checkbox
          document.getElementById('installationKeyBypass').addEventListener('change', (e) => {
            const keyGroup = document.getElementById('installationKeyGroup');
            const keyInput = document.getElementById('installationKey');
            if (e.target.checked) {
              keyGroup.style.display = 'none';
              keyInput.value = '';
            } else {
              keyGroup.style.display = 'block';
            }
          });

          function getFormData() {
            return {
              package: document.getElementById('package').value,
              versionName: document.getElementById('versionName').value,
              versionNumber: document.getElementById('versionNumber').value,
              versionDescription: document.getElementById('versionDescription').value,
              installationKeyBypass: document.getElementById('installationKeyBypass').checked,
              installationKey: document.getElementById('installationKey').value,
              codeCoverage: document.getElementById('codeCoverage').checked,
              skipValidation: document.getElementById('skipValidation').checked,
              asyncValidation: document.getElementById('asyncValidation').checked,
              skipAncestorCheck: document.getElementById('skipAncestorCheck').checked,
              branch: document.getElementById('branch').value,
              tag: document.getElementById('tag').value,
              path: document.getElementById('path').value,
              definitionFile: document.getElementById('definitionFile').value,
              language: document.getElementById('language').value,
              postInstallScript: document.getElementById('postInstallScript').value,
              postInstallUrl: document.getElementById('postInstallUrl').value,
              releaseNotesUrl: document.getElementById('releaseNotesUrl').value,
              uninstallScript: document.getElementById('uninstallScript').value,
              wait: document.getElementById('wait').value,
              buildInstance: document.getElementById('buildInstance').value,
              verbose: document.getElementById('verbose').checked
            };
          }

          function previewCommand() {
            const data = getFormData();
            if (!data.package) {
              alert('Please select a package');
              return;
            }
            vscode.postMessage({ command: 'preview', data: data });
          }

          function createVersion() {
            const data = getFormData();
            if (!data.package) {
              alert('Please select a package');
              return;
            }
            if (!confirm('Create package version? This may take several minutes.')) {
              return;
            }
            vscode.postMessage({ command: 'create', data: data });
          }

          function cancel() {
            vscode.postMessage({ command: 'cancel' });
          }

          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'previewResult':
                const previewSection = document.getElementById('previewSection');
                const previewCommand = document.getElementById('previewCommand');
                previewCommand.textContent = message.preview;
                previewSection.classList.add('visible');
                previewSection.scrollIntoView({ behavior: 'smooth' });
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
