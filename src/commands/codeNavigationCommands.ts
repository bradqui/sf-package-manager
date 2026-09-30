import * as vscode from 'vscode';
import { CodeNavigationService, CodeFile } from '../services/codeNavigationService';
import { ProjectService } from '../services/projectService';
import { Logger } from '../utils/logger';

export class CodeNavigationCommands {
  constructor(
    private codeNavigationService: CodeNavigationService,
    private projectService: ProjectService
  ) {}

  /**
   * Show quick pick to navigate to LWC components
   */
  async navigateToLWC(): Promise<void> {
    try {
      const components = await this.codeNavigationService.findLWCComponents();

      if (components.length === 0) {
        vscode.window.showInformationMessage('No LWC components found in this project');
        return;
      }

      const items = components.map(comp => ({
        label: `⚡ ${comp.name}`,
        description: comp.relativePath,
        detail: `${this.codeNavigationService.formatFileSize(comp.size)} - Modified: ${comp.modified.toLocaleDateString()}`,
        component: comp
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an LWC component to open',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (selected) {
        await this.codeNavigationService.openFile(selected.component.path);
        Logger.info(`Opened LWC component: ${selected.component.name}`);
      }
    } catch (error) {
      Logger.error(`Failed to navigate to LWC: ${error}`);
      vscode.window.showErrorMessage(`Failed to navigate to LWC: ${error}`);
    }
  }

  /**
   * Show quick pick to navigate to Apex classes
   */
  async navigateToApex(): Promise<void> {
    try {
      const classes = await this.codeNavigationService.findApexClasses();

      if (classes.length === 0) {
        vscode.window.showInformationMessage('No Apex classes found in this project');
        return;
      }

      const items = classes.map(cls => ({
        label: `☁️ ${cls.name}`,
        description: cls.relativePath,
        detail: `${this.codeNavigationService.formatFileSize(cls.size)} - Modified: ${cls.modified.toLocaleDateString()}`,
        apexClass: cls
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select an Apex class to open',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (selected) {
        await this.codeNavigationService.openFile(selected.apexClass.path);
        Logger.info(`Opened Apex class: ${selected.apexClass.name}`);
      }
    } catch (error) {
      Logger.error(`Failed to navigate to Apex: ${error}`);
      vscode.window.showErrorMessage(`Failed to navigate to Apex: ${error}`);
    }
  }

  /**
   * Show quick pick to navigate to any code file
   */
  async navigateToCode(): Promise<void> {
    try {
      const allFiles = await this.codeNavigationService.getAllCodeFiles();

      if (allFiles.length === 0) {
        vscode.window.showInformationMessage('No code files found in this project');
        return;
      }

      const items = allFiles.map(file => ({
        label: `${this.codeNavigationService.getFileTypeIcon(file.type)} ${file.name}`,
        description: file.relativePath,
        detail: `${file.type.toUpperCase()} - ${this.codeNavigationService.formatFileSize(file.size)} - Modified: ${file.modified.toLocaleDateString()}`,
        file: file
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a code file to open',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (selected) {
        await this.codeNavigationService.openFile(selected.file.path);
        Logger.info(`Opened ${selected.file.type}: ${selected.file.name}`);
      }
    } catch (error) {
      Logger.error(`Failed to navigate to code: ${error}`);
      vscode.window.showErrorMessage(`Failed to navigate to code: ${error}`);
    }
  }

  /**
   * Show code browser webview
   */
  async showCodeBrowser(): Promise<void> {
    try {
      const allFiles = await this.codeNavigationService.getAllCodeFiles();

      const panel = vscode.window.createWebviewPanel(
        'codeBrowser',
        'Code Browser',
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );

      // Group files by type
      const filesByType: { [key: string]: CodeFile[] } = {
        lwc: [],
        apex: [],
        trigger: [],
        vf: [],
        aura: []
      };

      allFiles.forEach(file => {
        if (filesByType[file.type]) {
          filesByType[file.type].push(file);
        }
      });

      panel.webview.html = this.createCodeBrowserHtml(filesByType);

      // Handle messages from webview
      panel.webview.onDidReceiveMessage(
        async message => {
          switch (message.command) {
            case 'openFile':
              await this.codeNavigationService.openFile(message.filePath);
              break;
          }
        }
      );

      Logger.info('Opened code browser');
    } catch (error) {
      Logger.error(`Failed to show code browser: ${error}`);
      vscode.window.showErrorMessage(`Failed to show code browser: ${error}`);
    }
  }

  /**
   * Show code files in current package directory
   */
  async showPackageCode(packagePath?: string): Promise<void> {
    try {
      let path = packagePath;

      if (!path) {
        const defaultDir = await this.projectService.getDefaultPackageDirectory();
        path = defaultDir?.path || 'force-app';
      }

      const files = await this.codeNavigationService.getFilesInPackageDirectory(path);

      if (files.length === 0) {
        vscode.window.showInformationMessage(`No code files found in package directory: ${path}`);
        return;
      }

      const items = files.map(file => ({
        label: `${this.codeNavigationService.getFileTypeIcon(file.type)} ${file.name}`,
        description: file.relativePath,
        detail: `${file.type.toUpperCase()} - ${this.codeNavigationService.formatFileSize(file.size)}`,
        file: file
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `Select a code file from ${path}`,
        matchOnDescription: true
      });

      if (selected) {
        await this.codeNavigationService.openFile(selected.file.path);
        Logger.info(`Opened ${selected.file.type}: ${selected.file.name}`);
      }
    } catch (error) {
      Logger.error(`Failed to show package code: ${error}`);
      vscode.window.showErrorMessage(`Failed to show package code: ${error}`);
    }
  }

  private createCodeBrowserHtml(filesByType: { [key: string]: CodeFile[] }): string {
    const createFileList = (files: CodeFile[], icon: string) => {
      if (files.length === 0) {
        return '<p class="no-files">No files found</p>';
      }

      return `
        <div class="file-list">
          ${files.map(file => `
            <div class="file-item" onclick="openFile('${file.path.replace(/\\/g, '\\\\')}')">
              <div class="file-info">
                <span class="file-icon">${icon}</span>
                <span class="file-name">${file.name}</span>
              </div>
              <div class="file-meta">
                <span class="file-size">${this.codeNavigationService.formatFileSize(file.size)}</span>
                <span class="file-date">${file.modified.toLocaleDateString()}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    };

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
          h1 {
            color: var(--vscode-textLink-foreground);
            margin-bottom: 30px;
          }
          .section {
            margin-bottom: 30px;
          }
          .section-header {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .section-title {
            font-size: 1.2em;
            font-weight: 500;
          }
          .section-count {
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 0.85em;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
          }
          .file-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .file-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;
          }
          .file-item:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
          }
          .file-info {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .file-icon {
            font-size: 1.3em;
          }
          .file-name {
            font-weight: 500;
          }
          .file-meta {
            display: flex;
            gap: 15px;
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
          }
          .no-files {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
          }
        </style>
      </head>
      <body>
        <h1>📁 Code Browser</h1>

        <div class="section">
          <div class="section-header">
            <span class="section-title">⚡ LWC Components</span>
            <span class="section-count">${filesByType.lwc.length}</span>
          </div>
          ${createFileList(filesByType.lwc, '⚡')}
        </div>

        <div class="section">
          <div class="section-header">
            <span class="section-title">☁️ Apex Classes</span>
            <span class="section-count">${filesByType.apex.length}</span>
          </div>
          ${createFileList(filesByType.apex, '☁️')}
        </div>

        <div class="section">
          <div class="section-header">
            <span class="section-title">🔔 Apex Triggers</span>
            <span class="section-count">${filesByType.trigger.length}</span>
          </div>
          ${createFileList(filesByType.trigger, '🔔')}
        </div>

        <div class="section">
          <div class="section-header">
            <span class="section-title">🔷 Aura Components</span>
            <span class="section-count">${filesByType.aura.length}</span>
          </div>
          ${createFileList(filesByType.aura, '🔷')}
        </div>

        <div class="section">
          <div class="section-header">
            <span class="section-title">📄 Visualforce Pages</span>
            <span class="section-count">${filesByType.vf.length}</span>
          </div>
          ${createFileList(filesByType.vf, '📄')}
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function openFile(filePath) {
            vscode.postMessage({
              command: 'openFile',
              filePath: filePath
            });
          }
        </script>
      </body>
      </html>
    `;
  }
}
