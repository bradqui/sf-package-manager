import * as vscode from 'vscode';
import { CliExecutor } from '../services/cliExecutor';
import { ConfigService } from '../services/configService';
import { Logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';

interface OrgInfo {
  alias?: string;
  username: string;
  orgId: string;
  instanceUrl: string;
  isDevHub?: boolean;
}

export class OrgCommands {
  constructor(
    private cliExecutor: CliExecutor,
    private configService: ConfigService
  ) {}

  async listOrgs(): Promise<OrgInfo[]> {
    try {
      const result = await this.cliExecutor.execute('sf', ['org', 'list', '--json']);

      if (!result.success || !result.data?.result) {
        Logger.error('Failed to list orgs');
        return [];
      }

      const allOrgs: OrgInfo[] = [];

      // Add scratch orgs
      if (result.data.result.scratchOrgs) {
        result.data.result.scratchOrgs.forEach((org: any) => {
          allOrgs.push({
            alias: org.alias,
            username: org.username,
            orgId: org.orgId,
            instanceUrl: org.instanceUrl,
            isDevHub: false
          });
        });
      }

      // Add non-scratch orgs
      if (result.data.result.nonScratchOrgs) {
        result.data.result.nonScratchOrgs.forEach((org: any) => {
          allOrgs.push({
            alias: org.alias,
            username: org.username,
            orgId: org.orgId,
            instanceUrl: org.instanceUrl,
            isDevHub: org.isDevHub || false
          });
        });
      }

      return allOrgs;
    } catch (error) {
      Logger.error(`Error listing orgs: ${error}`);
      return [];
    }
  }

  async switchDevHub(): Promise<void> {
    try {
      const orgs = await this.listOrgs();

      if (orgs.length === 0) {
        vscode.window.showWarningMessage(
          'No orgs found. Please authenticate with Salesforce using "sf org login"'
        );
        return;
      }

      // Filter for Dev Hubs
      const devHubs = orgs.filter(org => org.isDevHub);

      if (devHubs.length === 0) {
        vscode.window.showWarningMessage(
          'No Dev Hubs found. Please authenticate with a Dev Hub org.'
        );
        return;
      }

      const items = devHubs.map(org => ({
        label: org.alias || org.username,
        description: org.username,
        detail: `${org.instanceUrl} (${org.orgId})`,
        org: org
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Dev Hub',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (!selected) {
        return;
      }

      await this.configService.setDefaultDevHub(selected.org.alias || selected.org.username);

      vscode.window.showInformationMessage(
        `Dev Hub set to: ${selected.label}`
      );

      Logger.info(`Dev Hub switched to: ${selected.org.username}`);

      // Trigger refresh
      vscode.commands.executeCommand('sfPackageManager.refresh');
    } catch (error) {
      ErrorHandler.handle(error, 'Error switching Dev Hub');
    }
  }

  async switchTargetOrg(): Promise<void> {
    try {
      const orgs = await this.listOrgs();

      if (orgs.length === 0) {
        vscode.window.showWarningMessage(
          'No orgs found. Please authenticate with Salesforce using "sf org login"'
        );
        return;
      }

      const items = orgs.map(org => ({
        label: org.alias || org.username,
        description: org.username,
        detail: `${org.instanceUrl} ${org.isDevHub ? '[Dev Hub]' : ''}`,
        org: org
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a target org',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (!selected) {
        return;
      }

      await this.configService.setDefaultTargetOrg(selected.org.alias || selected.org.username);

      vscode.window.showInformationMessage(
        `Target org set to: ${selected.label}`
      );

      Logger.info(`Target org switched to: ${selected.org.username}`);

      // Trigger refresh
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
            <span class="value">${devHubInfo.alias || 'None'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Username:</span>
            <span class="value">${devHubInfo.username}</span>
          </div>
          <div class="detail-row">
            <span class="label">Org ID:</span>
            <span class="value">${devHubInfo.orgId}</span>
          </div>
          <div class="detail-row">
            <span class="label">Instance:</span>
            <span class="value">${devHubInfo.instanceUrl}</span>
          </div>
        </div>
        <button onclick="switchDevHub()">Switch Dev Hub</button>
      </div>
    ` : `
      <div class="org-card warning">
        <h3>⚠️ Dev Hub</h3>
        <p>No Dev Hub configured or authenticated</p>
        <p class="hint">Configured value: ${devHubConfig || 'Not set'}</p>
        <button onclick="switchDevHub()">Select Dev Hub</button>
      </div>
    `;

    const targetOrgHtml = targetOrgInfo ? `
      <div class="org-card">
        <h3>🎯 Target Org</h3>
        <div class="org-details">
          <div class="detail-row">
            <span class="label">Alias:</span>
            <span class="value">${targetOrgInfo.alias || 'None'}</span>
          </div>
          <div class="detail-row">
            <span class="label">Username:</span>
            <span class="value">${targetOrgInfo.username}</span>
          </div>
          <div class="detail-row">
            <span class="label">Org ID:</span>
            <span class="value">${targetOrgInfo.orgId}</span>
          </div>
          <div class="detail-row">
            <span class="label">Instance:</span>
            <span class="value">${targetOrgInfo.instanceUrl}</span>
          </div>
        </div>
        <button onclick="switchTargetOrg()">Switch Target Org</button>
      </div>
    ` : `
      <div class="org-card warning">
        <h3>⚠️ Target Org</h3>
        <p>No target org configured or authenticated</p>
        <p class="hint">Configured value: ${targetOrgConfig || 'Not set'}</p>
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
