import * as vscode from 'vscode';
import { CommandBuilder } from '../../services/commandBuilder';
import { CliExecutor } from '../../services/cliExecutor';
import { ConfigService } from '../../services/configService';
import { PackageInstallRequest } from '../../models/packageVersion';
import { Logger } from '../../utils/logger';

export class InstallPackageWebview {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private commandBuilder: CommandBuilder,
    private cliExecutor: CliExecutor,
    private configService: ConfigService
  ) {}

  async show(versionId?: string): Promise<void> {
    // Create or show panel
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'packageInstallForm',
      'Install Package',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Load data
    const orgs = await this.loadOrgs();
    const defaultOrg = this.configService.getDefaultTargetOrg();

    // Set HTML
    this.panel.webview.html = this.getHtmlContent(orgs, defaultOrg, versionId);

    // Handle messages
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'preview':
            this.handlePreview(message.data);
            break;
          case 'install':
            await this.handleInstall(message.data);
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

  private async loadOrgs(): Promise<any[]> {
    try {
      const result = await this.cliExecutor.execute('sf', ['org', 'list', '--json']);
      if (result.success && result.data?.result) {
        const scratchOrgs = result.data.result.scratchOrgs || [];
        const nonScratchOrgs = result.data.result.nonScratchOrgs || [];
        return [...scratchOrgs, ...nonScratchOrgs];
      }
      return [];
    } catch (error) {
      Logger.error(`Failed to load orgs: ${error}`);
      return [];
    }
  }

  private handlePreview(data: any): void {
    const request: PackageInstallRequest = this.buildRequest(data);
    const args = this.commandBuilder.buildPackageInstall(request);
    const preview = this.commandBuilder.previewCommand('sf', args);

    this.panel?.webview.postMessage({
      command: 'previewResult',
      preview: preview
    });
  }

  private async handleInstall(data: any): Promise<void> {
    const request: PackageInstallRequest = this.buildRequest(data);
    const args = this.commandBuilder.buildPackageInstall(request);

    try {
      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        `Installing package in ${request.targetOrg}...`
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Package installed successfully in ${request.targetOrg}`
        );
        this.panel?.dispose();
        vscode.commands.executeCommand('sfPackageManager.refresh');
      } else {
        vscode.window.showErrorMessage(`Failed to install package: ${result.error}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error installing package: ${error}`);
    }
  }

  private buildRequest(data: any): PackageInstallRequest {
    const request: PackageInstallRequest = {
      package: data.package,
      targetOrg: data.targetOrg
    };

    if (data.installationKey) request.installationKey = data.installationKey;
    if (data.wait) request.wait = parseInt(data.wait);
    if (data.publishWait) request.publishWait = parseInt(data.publishWait);
    if (data.apexCompile) request.apexCompile = data.apexCompile;
    if (data.securityType) request.securityType = data.securityType;
    if (data.upgradeType) request.upgradeType = data.upgradeType;

    return request;
  }

  private getHtmlContent(orgs: any[], defaultOrg?: string, defaultPackage?: string): string {
    const orgOptions = orgs.map(org => {
      const alias = org.alias || org.username;
      const selected = alias === defaultOrg || org.username === defaultOrg;
      return `<option value="${alias}" ${selected ? 'selected' : ''}>${alias} (${org.username})</option>`;
    }).join('');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            max-width: 800px;
            margin: 0 auto;
          }
          h1 {
            color: var(--vscode-textLink-foreground);
            margin-bottom: 30px;
          }
          .section {
            margin-bottom: 25px;
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
          select {
            width: 100%;
            padding: 8px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
          }
          input:focus, select:focus {
            outline: 1px solid var(--vscode-focusBorder);
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
            margin-top: 25px;
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
          .warning {
            padding: 12px;
            background: var(--vscode-inputValidation-warningBackground);
            border: 1px solid var(--vscode-inputValidation-warningBorder);
            border-radius: 4px;
            margin-bottom: 15px;
          }
          .warning-icon {
            color: var(--vscode-inputValidation-warningForeground);
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <h1>📥 Install Package</h1>

        <form id="installForm">
          <!-- Package & Org -->
          <div class="section">
            <div class="section-title">
              📦 Package & Target Org
            </div>
            <div class="form-group">
              <label for="package">Package Version ID *</label>
              <input type="text" id="package" value="${defaultPackage || ''}" placeholder="04t..." required>
              <div class="help-text">The 04t subscriber package version ID to install</div>
            </div>
            <div class="form-group">
              <label for="targetOrg">Target Org *</label>
              <select id="targetOrg" required>
                <option value="">Select an org...</option>
                ${orgOptions}
              </select>
              <div class="help-text">The org where the package will be installed</div>
            </div>
          </div>

          <!-- Installation Options -->
          <div class="section">
            <div class="section-title">
              🔒 Installation Options
            </div>
            <div class="form-group">
              <label for="installationKey">Installation Key</label>
              <input type="text" id="installationKey" placeholder="Leave empty if not required">
              <div class="help-text">Installation key if the package is protected</div>
            </div>
            <div class="form-group">
              <label for="securityType">Security Type</label>
              <select id="securityType">
                <option value="">Default</option>
                <option value="AllUsers">All Users</option>
                <option value="AdminsOnly" selected>Admins Only</option>
              </select>
              <div class="help-text">Who can access the package components after installation</div>
            </div>
            <div class="form-group">
              <label for="upgradeType">Upgrade Type</label>
              <select id="upgradeType">
                <option value="">Default</option>
                <option value="DeprecateOnly">Deprecate Only</option>
                <option value="Mixed">Mixed</option>
                <option value="Delete">Delete</option>
              </select>
              <div class="help-text">How to handle components being removed</div>
            </div>
          </div>

          <!-- Apex Compilation -->
          <div class="section">
            <div class="section-title">
              ⚡ Apex Compilation
            </div>
            <div class="warning">
              <span class="warning-icon">⚠️</span>
              Compiling all Apex may take longer but ensures no runtime errors
            </div>
            <div class="form-group">
              <label for="apexCompile">Apex Compile Scope</label>
              <select id="apexCompile">
                <option value="all" selected>All Apex (Recommended)</option>
                <option value="package">Package Only (Faster)</option>
              </select>
              <div class="help-text">Which Apex classes to compile during installation</div>
            </div>
          </div>

          <!-- Wait Times -->
          <div class="section">
            <div class="section-title">
              ⏱️ Wait Times
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label for="wait">Installation Wait (minutes)</label>
                <input type="number" id="wait" value="10" min="1" max="60">
                <div class="help-text">How long to wait for installation</div>
              </div>
              <div class="form-group">
                <label for="publishWait">Publish Wait (minutes)</label>
                <input type="number" id="publishWait" value="5" min="1" max="30">
                <div class="help-text">How long to wait for subscriber publish</div>
              </div>
            </div>
          </div>

          <!-- Command Preview -->
          <div class="preview-section" id="previewSection">
            <div class="preview-title">Command Preview:</div>
            <div class="preview-command" id="previewCommand"></div>
          </div>

          <!-- Actions -->
          <div class="button-group">
            <button type="button" class="btn-primary" onclick="installPackage()">
              Install Package
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

          function getFormData() {
            return {
              package: document.getElementById('package').value.trim(),
              targetOrg: document.getElementById('targetOrg').value,
              installationKey: document.getElementById('installationKey').value.trim(),
              securityType: document.getElementById('securityType').value,
              upgradeType: document.getElementById('upgradeType').value,
              apexCompile: document.getElementById('apexCompile').value,
              wait: document.getElementById('wait').value,
              publishWait: document.getElementById('publishWait').value
            };
          }

          function validate(data) {
            if (!data.package) {
              alert('Please enter a package version ID');
              return false;
            }
            if (!data.package.startsWith('04t')) {
              alert('Package version ID must start with 04t');
              return false;
            }
            if (!data.targetOrg) {
              alert('Please select a target org');
              return false;
            }
            return true;
          }

          function previewCommand() {
            const data = getFormData();
            if (!validate(data)) return;
            vscode.postMessage({ command: 'preview', data: data });
          }

          function installPackage() {
            const data = getFormData();
            if (!validate(data)) return;

            const confirmMsg = \`Install package in \${data.targetOrg}?\\n\\nThis will:\\n- Install package \${data.package}\\n- Compile \${data.apexCompile === 'all' ? 'all Apex' : 'package Apex only'}\\n- Set security to \${data.securityType || 'default'}\\n\\nThis may take several minutes.\`;

            if (!confirm(confirmMsg)) return;

            vscode.postMessage({ command: 'install', data: data });
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
