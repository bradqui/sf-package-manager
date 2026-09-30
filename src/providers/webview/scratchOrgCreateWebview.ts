import * as vscode from 'vscode';
import { CommandBuilder } from '../../services/commandBuilder';
import { CliExecutor } from '../../services/cliExecutor';
import { ConfigService } from '../../services/configService';
import { Logger } from '../../utils/logger';
import { ScratchOrgCreateRequest } from '../../models/packageVersion';

export class ScratchOrgCreateWebview {
  private panel: vscode.WebviewPanel | undefined;

  constructor(
    private commandBuilder: CommandBuilder,
    private cliExecutor: CliExecutor,
    private configService: ConfigService
  ) {}

  async show(): Promise<void> {
    // Check Dev Hub
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

    // Find definition files
    const definitionFiles = await this.findDefinitionFiles();

    // Create or show panel
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'scratchOrgCreateForm',
      'Create Scratch Org',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Set HTML
    this.panel.webview.html = this.getHtmlContent(definitionFiles, devHub);

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
          case 'browseDefinitionFile':
            await this.handleBrowseDefinitionFile();
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

  private async findDefinitionFiles(): Promise<string[]> {
    const files = await vscode.workspace.findFiles(
      '**/*-scratch-def.json',
      '**/node_modules/**',
      20
    );

    return files.map(uri => vscode.workspace.asRelativePath(uri));
  }

  private async handleBrowseDefinitionFile(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    const selected = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: { 'JSON': ['json'] },
      defaultUri: workspaceFolders[0].uri
    });

    if (selected && selected.length > 0) {
      const relativePath = vscode.workspace.asRelativePath(selected[0]);
      this.panel?.webview.postMessage({
        command: 'definitionFileSelected',
        path: relativePath
      });
    }
  }

  private handlePreview(data: any): void {
    const request = this.buildRequest(data);
    const args = this.commandBuilder.buildScratchOrgCreate(request);
    const preview = this.commandBuilder.previewCommand('sf', args);

    this.panel?.webview.postMessage({
      command: 'previewResult',
      preview: preview
    });
  }

  private async handleCreate(data: any): Promise<void> {
    try {
      const request = this.buildRequest(data);
      const args = this.commandBuilder.buildScratchOrgCreate(request);

      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        `Creating scratch org "${request.alias || 'new org'}"...`
      );

      if (result.success && result.data?.result) {
        const orgInfo = result.data.result;
        vscode.window.showInformationMessage(
          `Scratch org created successfully!\nAlias: ${request.alias}\nUsername: ${orgInfo.username}`
        );

        // Ask if user wants to install a package
        const installPackage = await vscode.window.showInformationMessage(
          'Scratch org created! Would you like to install a package now?',
          'Install Package',
          'No'
        );

        if (installPackage === 'Install Package') {
          await vscode.commands.executeCommand('sfPackageManager.installPackageForm');
        }

        this.panel?.dispose();
        await vscode.commands.executeCommand('sfPackageManager.refreshAll');
      } else {
        throw new Error(result.error || 'Failed to create scratch org');
      }
    } catch (error: any) {
      const errorMessage = `Failed to create scratch org: ${error.message}`;
      vscode.window.showErrorMessage(errorMessage);
      Logger.error(errorMessage);
    }
  }

  private buildRequest(data: any): ScratchOrgCreateRequest {
    return {
      definitionFile: data.definitionFile,
      devHub: data.devHub,
      alias: data.alias || undefined,
      durationDays: data.durationDays ? parseInt(data.durationDays) : undefined,
      noAncestors: data.noAncestors || false,
      noNamespace: data.noNamespace || false,
      setDefault: data.setDefault || false,
      adminEmail: data.adminEmail || undefined,
      description: data.description || undefined,
      wait: data.wait ? parseInt(data.wait) : 10
    };
  }

  private getHtmlContent(definitionFiles: string[], devHub: string): string {
    const definitionOptions = definitionFiles.map(file =>
      `<option value="${file}">${file}</option>`
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
            max-width: 900px;
          }
          h1 {
            color: var(--vscode-textLink-foreground);
            margin-bottom: 10px;
          }
          .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 30px;
          }
          .section {
            margin-bottom: 30px;
            padding: 20px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
          }
          .section h2 {
            margin-top: 0;
            font-size: 1.1em;
            color: var(--vscode-textLink-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
          }
          .form-group {
            margin-bottom: 20px;
          }
          label {
            display: block;
            margin-bottom: 5px;
            font-weight: 500;
          }
          input[type="text"],
          input[type="email"],
          input[type="number"],
          select {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
            box-sizing: border-box;
          }
          input[type="checkbox"] {
            margin-right: 8px;
          }
          .checkbox-group {
            display: flex;
            align-items: center;
            margin-bottom: 10px;
          }
          .help-text {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
          }
          .preview-section {
            margin-top: 20px;
            padding: 15px;
            background: var(--vscode-textCodeBlock-background);
            border-radius: 4px;
            font-family: monospace;
            font-size: 0.9em;
            word-break: break-all;
            display: none;
          }
          .preview-section.visible {
            display: block;
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
            cursor: pointer;
            font-size: 14px;
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
          .required {
            color: var(--vscode-inputValidation-errorForeground);
          }
          .browse-button {
            margin-top: 5px;
            padding: 5px 10px;
            font-size: 12px;
          }
        </style>
      </head>
      <body>
        <h1>🔨 Create Scratch Org</h1>
        <div class="subtitle">Create a new scratch org for development and testing</div>

        <form id="scratchOrgForm">
          <!-- Section 1: Basic Configuration -->
          <div class="section">
            <h2>1. Basic Configuration</h2>

            <div class="form-group">
              <label>Definition File <span class="required">*</span></label>
              <select id="definitionFile" required>
                <option value="">Select definition file...</option>
                ${definitionOptions}
              </select>
              <button type="button" class="btn-secondary browse-button" onclick="browseDefinitionFile()">
                Browse...
              </button>
              <div class="help-text">Select the scratch org definition file (e.g., project-scratch-def.json)</div>
            </div>

            <div class="form-group">
              <label>Alias <span class="required">*</span></label>
              <input type="text" id="alias" placeholder="my-scratch-org" required>
              <div class="help-text">Friendly name for the scratch org</div>
            </div>

            <div class="form-group">
              <label>Duration (Days)</label>
              <select id="durationDays">
                <option value="1">1 day</option>
                <option value="7" selected>7 days (1 week)</option>
                <option value="14">14 days (2 weeks)</option>
                <option value="30">30 days (1 month)</option>
              </select>
              <div class="help-text">How long the scratch org should remain active</div>
            </div>
          </div>

          <!-- Section 2: Org Settings -->
          <div class="section">
            <h2>2. Org Settings</h2>

            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="setDefault">
                <label for="setDefault">Set as default org</label>
              </div>
              <div class="help-text">Make this org the default target for SF CLI commands</div>
            </div>

            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="noAncestors">
                <label for="noAncestors">Don't include ancestor packages</label>
              </div>
              <div class="help-text">Exclude packages installed in the Dev Hub from the scratch org</div>
            </div>

            <div class="form-group">
              <div class="checkbox-group">
                <input type="checkbox" id="noNamespace">
                <label for="noNamespace">Don't link namespace</label>
              </div>
              <div class="help-text">Don't associate a namespace with the scratch org (unlocked packages)</div>
            </div>
          </div>

          <!-- Section 3: Admin Settings -->
          <div class="section">
            <h2>3. Admin Settings (Optional)</h2>

            <div class="form-group">
              <label>Admin Email</label>
              <input type="email" id="adminEmail" placeholder="admin@example.com">
              <div class="help-text">Email address for the scratch org admin user</div>
            </div>

            <div class="form-group">
              <label>Description</label>
              <input type="text" id="description" placeholder="Testing new feature...">
              <div class="help-text">Description of the scratch org's purpose</div>
            </div>
          </div>

          <!-- Section 4: Execution Options -->
          <div class="section">
            <h2>4. Execution Options</h2>

            <div class="form-group">
              <label>Wait Time (Minutes)</label>
              <input type="number" id="wait" value="10" min="1" max="30">
              <div class="help-text">How long to wait for org creation (1-30 minutes)</div>
            </div>

            <input type="hidden" id="devHub" value="${devHub}">
          </div>

          <!-- Command Preview -->
          <div class="preview-section" id="previewSection">
            <strong>Command Preview:</strong><br>
            <span id="previewText"></span>
          </div>

          <!-- Buttons -->
          <div class="button-group">
            <button type="button" class="btn-secondary" onclick="previewCommand()">
              Preview Command
            </button>
            <button type="submit" class="btn-primary">
              Create Scratch Org
            </button>
            <button type="button" class="btn-secondary" onclick="cancel()">
              Cancel
            </button>
          </div>
        </form>

        <script>
          const vscode = acquireVsCodeApi();

          function browseDefinitionFile() {
            vscode.postMessage({ command: 'browseDefinitionFile' });
          }

          function previewCommand() {
            const data = collectFormData();
            vscode.postMessage({ command: 'preview', data: data });
          }

          function cancel() {
            vscode.postMessage({ command: 'cancel' });
          }

          function collectFormData() {
            return {
              definitionFile: document.getElementById('definitionFile').value,
              devHub: document.getElementById('devHub').value,
              alias: document.getElementById('alias').value,
              durationDays: document.getElementById('durationDays').value,
              noAncestors: document.getElementById('noAncestors').checked,
              noNamespace: document.getElementById('noNamespace').checked,
              setDefault: document.getElementById('setDefault').checked,
              adminEmail: document.getElementById('adminEmail').value,
              description: document.getElementById('description').value,
              wait: document.getElementById('wait').value
            };
          }

          // Form submission
          document.getElementById('scratchOrgForm').addEventListener('submit', (e) => {
            e.preventDefault();

            const data = collectFormData();

            // Validation
            if (!data.definitionFile) {
              alert('Please select a definition file');
              return;
            }
            if (!data.alias) {
              alert('Please enter an alias');
              return;
            }

            vscode.postMessage({ command: 'create', data: data });
          });

          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'previewResult':
                document.getElementById('previewText').textContent = message.preview;
                document.getElementById('previewSection').classList.add('visible');
                break;
              case 'definitionFileSelected':
                // Add to dropdown if not exists
                const select = document.getElementById('definitionFile');
                let optionExists = false;
                for (let option of select.options) {
                  if (option.value === message.path) {
                    optionExists = true;
                    select.value = message.path;
                    break;
                  }
                }
                if (!optionExists) {
                  const option = document.createElement('option');
                  option.value = message.path;
                  option.textContent = message.path;
                  option.selected = true;
                  select.appendChild(option);
                }
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
