import * as vscode from 'vscode';
import { CliExecutor } from '../services/cliExecutor';
import { ConfigService } from '../services/configService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';
import { escapeHtml } from '../utils/html';
import { OrgService, OrgSummary } from '../services/orgService';

type OrgInfo = OrgSummary;

export class OrgCommands {
  private orgService: OrgService;

  constructor(
    private cliExecutor: CliExecutor,
    private configService: ConfigService
  ) {
    this.orgService = new OrgService(cliExecutor);
  }

  async listOrgs(): Promise<OrgInfo[]> {
    try {
      return await this.orgService.listOrgs();
    } catch (error) {
      Logger.error(`Error listing orgs: ${error}`);
      return [];
    }
  }

  async switchDevHub(): Promise<void> {
    try {
      const selected = await this.orgService.pickOrg({
        title: 'Select Dev Hub',
        placeHolder: 'Dev Hub used to create and manage packages',
        emptyMessage: 'No Dev Hubs found. Authenticate one with "sf org login web --set-default-dev-hub".',
        filter: org => org.isDevHub,
        current: this.configService.getDefaultDevHub()
      });

      if (!selected) {
        return;
      }

      const value = selected.alias || selected.username;
      await this.configService.setDefaultDevHub(value);
      vscode.window.showInformationMessage(`Dev Hub set to: ${value}`);
      Logger.info(`Dev Hub switched to: ${selected.username}`);

      vscode.commands.executeCommand('sfPackageManager.refresh');
    } catch (error) {
      ErrorHandler.handle(error, 'Error switching Dev Hub');
    }
  }

  async switchTargetOrg(): Promise<void> {
    try {
      const selected = await this.orgService.pickOrg({
        title: 'Select Target Org',
        placeHolder: 'Org used for package installs and testing',
        emptyMessage: 'No orgs found. Authenticate one with "sf org login web".',
        current: this.configService.getDefaultTargetOrg()
      });

      if (!selected) {
        return;
      }

      const value = selected.alias || selected.username;
      await this.configService.setDefaultTargetOrg(value);
      vscode.window.showInformationMessage(`Target org set to: ${value}`);
      Logger.info(`Target org switched to: ${selected.username}`);

      vscode.commands.executeCommand('sfPackageManager.refresh');
    } catch (error) {
      ErrorHandler.handle(error, 'Error switching target org');
    }
  }

  async showOrgInfo(): Promise<void> {
    try {
      const devHub = this.configService.getDefaultDevHub();
      const targetOrg = this.configService.getDefaultTargetOrg();

      const orgs = await this.listOrgs();

      const devHubInfo = orgs.find(org =>
        (org.alias === devHub || org.username === devHub) && org.isDevHub
      );

      const targetOrgInfo = orgs.find(org =>
        org.alias === targetOrg || org.username === targetOrg
      );

      const panel = vscode.window.createWebviewPanel(
        'orgInfo',
        'Org Configuration',
        vscode.ViewColumn.One,
        { enableScripts: true }
      );

      panel.webview.html = this.createOrgInfoHtml(devHubInfo, targetOrgInfo, devHub, targetOrg);

      panel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'switchDevHub':
              this.switchDevHub();
              break;
            case 'switchTargetOrg':
              this.switchTargetOrg();
              break;
          }
        }
      );
    } catch (error) {
      ErrorHandler.handle(error, 'Error showing org info');
    }
  }

  private createOrgInfoHtml(
    devHubInfo: OrgInfo | undefined,
    targetOrgInfo: OrgInfo | undefined,
    devHubConfig: string,
    targetOrgConfig: string
  ): string {
    const devHubHtml = devHubInfo ? `
      <div class="org-card">
        <h3>🏢 Dev Hub</h3>
        <div class="org-details">
          <div class="detail-row">
            <span class="label">Alias:</span>
            <span class="value">${escapeHtml(devHubInfo.alias || 'None')}</span>
          </div>
          <div class="detail-row">
            <span class="label">Username:</span>
            <span class="value">${escapeHtml(devHubInfo.username)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Org ID:</span>
            <span class="value">${escapeHtml(devHubInfo.orgId)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Instance:</span>
            <span class="value">${escapeHtml(devHubInfo.instanceUrl)}</span>
          </div>
        </div>
        <button onclick="switchDevHub()">Switch Dev Hub</button>
      </div>
    ` : `
      <div class="org-card warning">
        <h3>⚠️ Dev Hub</h3>
        <p>No Dev Hub configured or authenticated</p>
        <p class="hint">Configured value: ${escapeHtml(devHubConfig || 'Not set')}</p>
        <button onclick="switchDevHub()">Select Dev Hub</button>
      </div>
    `;

    const targetOrgHtml = targetOrgInfo ? `
      <div class="org-card">
        <h3>🎯 Target Org</h3>
        <div class="org-details">
          <div class="detail-row">
            <span class="label">Alias:</span>
            <span class="value">${escapeHtml(targetOrgInfo.alias || 'None')}</span>
          </div>
          <div class="detail-row">
            <span class="label">Username:</span>
            <span class="value">${escapeHtml(targetOrgInfo.username)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Org ID:</span>
            <span class="value">${escapeHtml(targetOrgInfo.orgId)}</span>
          </div>
          <div class="detail-row">
            <span class="label">Instance:</span>
            <span class="value">${escapeHtml(targetOrgInfo.instanceUrl)}</span>
          </div>
        </div>
        <button onclick="switchTargetOrg()">Switch Target Org</button>
      </div>
    ` : `
      <div class="org-card warning">
        <h3>⚠️ Target Org</h3>
        <p>No target org configured or authenticated</p>
        <p class="hint">Configured value: ${escapeHtml(targetOrgConfig || 'Not set')}</p>
        <button onclick="switchTargetOrg()">Select Target Org</button>
      </div>
    `;

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
            margin-bottom: 20px;
          }
          .org-card {
            margin-bottom: 20px;
            padding: 20px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
          }
          .org-card.warning {
            border-color: var(--vscode-editorWarning-foreground);
            background: var(--vscode-inputValidation-warningBackground);
          }
          .org-card h3 {
            margin-top: 0;
            margin-bottom: 15px;
          }
          .org-details {
            margin-bottom: 15px;
          }
          .detail-row {
            display: flex;
            padding: 8px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .detail-row:last-child {
            border-bottom: none;
          }
          .label {
            font-weight: 500;
            min-width: 100px;
            color: var(--vscode-descriptionForeground);
          }
          .value {
            font-family: monospace;
            font-size: 0.95em;
          }
          .hint {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            font-style: italic;
          }
          button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            border-radius: 3px;
            margin-top: 10px;
          }
          button:hover {
            background: var(--vscode-button-hoverBackground);
          }
        </style>
      </head>
      <body>
        <h1>📡 Org Configuration</h1>
        ${devHubHtml}
        ${targetOrgHtml}
        <script>
          const vscode = acquireVsCodeApi();

          function switchDevHub() {
            vscode.postMessage({ command: 'switchDevHub' });
          }

          function switchTargetOrg() {
            vscode.postMessage({ command: 'switchTargetOrg' });
          }
        </script>
      </body>
      </html>
    `;
  }

  async createOrgStatusBarItem(context: vscode.ExtensionContext): Promise<vscode.StatusBarItem> {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);

    this.updateOrgStatusBar(statusBarItem);

    statusBarItem.command = 'sfPackageManager.showOrgInfo';
    statusBarItem.show();

    context.subscriptions.push(statusBarItem);

    return statusBarItem;
  }

  private updateOrgStatusBar(statusBarItem: vscode.StatusBarItem): void {
    const devHub = this.configService.getDefaultDevHub();
    const targetOrg = this.configService.getDefaultTargetOrg();

    const devHubText = devHub ? devHub : 'No Dev Hub';
    const targetOrgText = targetOrg ? targetOrg : 'No Org';

    statusBarItem.text = `$(cloud) ${devHubText} | $(target) ${targetOrgText}`;
    statusBarItem.tooltip = 'Click to view/change org configuration';
  }
}
