import * as vscode from 'vscode';
import { CommandBuilder } from '../../services/commandBuilder';
import { CliExecutor } from '../../services/cliExecutor';
import { ConfigService } from '../../services/configService';
import { Logger } from '../../utils/logger';

export class PushUpgradeWebview {
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
      'pushUpgradeSchedule',
      'Schedule Push Upgrade',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Load data
    const versions = await this.loadVersions();
    const orgs = await this.loadOrgs();

    // Set HTML
    this.panel.webview.html = this.getHtmlContent(versions, orgs, versionId);

    // Handle messages
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'preview':
            this.handlePreview(message.data);
            break;
          case 'schedule':
            await this.handleSchedule(message.data);
            break;
          case 'listUpgrades':
            await this.handleListUpgrades();
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

  private async loadVersions(): Promise<any[]> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return [];
    }

    try {
      const args = this.commandBuilder.buildPackageVersionList(devHub);
      const result = await this.cliExecutor.execute('sf', args);
      if (result.success && result.data?.result) {
        // Only return released versions
        return result.data.result.filter((v: any) => v.IsReleased);
      }
      return [];
    } catch (error) {
      Logger.error(`Failed to load versions: ${error}`);
      return [];
    }
  }

  private async loadOrgs(): Promise<any[]> {
    try {
      const result = await this.cliExecutor.execute('sf', ['org', 'list', '--json']);
      if (result.success && result.data?.result) {
        const scratchOrgs = result.data.result.scratchOrgs || [];
        const nonScratchOrgs = result.data.result.nonScratchOrgs || [];
        return [...scratchOrgs, ...nonScratchOrgs].filter(org => !org.isDevHub);
      }
      return [];
    } catch (error) {
      Logger.error(`Failed to load orgs: ${error}`);
      return [];
    }
  }

  private handlePreview(data: any): void {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      return;
    }

    const args = this.commandBuilder.buildPackagePushUpgradeSchedule(
      data.packageVersionId,
      data.orgIds,
      data.scheduledDate,
      devHub
    );
    const preview = this.commandBuilder.previewCommand('sf', args);

    this.panel?.webview.postMessage({
      command: 'previewResult',
      preview: preview
    });
  }

  private async handleSchedule(data: any): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      vscode.window.showErrorMessage('No Dev Hub configured');
      return;
    }

    const args = this.commandBuilder.buildPackagePushUpgradeSchedule(
      data.packageVersionId,
      data.orgIds,
      data.scheduledDate,
      devHub
    );

    try {
      const result = await this.cliExecutor.executeWithProgress(
        'sf',
        args,
        'Scheduling push upgrade...'
      );

      if (result.success) {
        vscode.window.showInformationMessage(
          `Push upgrade scheduled for ${data.orgIds.length} org(s)`
        );
        this.panel?.dispose();
      } else {
        vscode.window.showErrorMessage(`Failed to schedule push upgrade: ${result.error}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error scheduling push upgrade: ${error}`);
    }
  }

  private async handleListUpgrades(): Promise<void> {
    const devHub = this.configService.getDefaultDevHub();
    if (!devHub) {
      vscode.window.showErrorMessage('No Dev Hub configured');
      return;
    }

    const args = this.commandBuilder.buildPackagePushUpgradeList(devHub);

    try {
      const result = await this.cliExecutor.execute('sf', args);

      if (result.success && result.data?.result) {
        const upgrades = result.data.result;
        this.panel?.webview.postMessage({
          command: 'upgradesListResult',
          upgrades: upgrades
        });
      } else {
        vscode.window.showErrorMessage(`Failed to list push upgrades: ${result.error}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Error listing push upgrades: ${error}`);
    }
  }

  private getHtmlContent(versions: any[], orgs: any[], defaultVersion?: string): string {
    const versionOptions = versions.map(v => {
      const versionNumber = `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}.${v.BuildNumber}`;
      const selected = v.SubscriberPackageVersionId === defaultVersion;
      return `<option value="${v.SubscriberPackageVersionId}" ${selected ? 'selected' : ''}>${v.Name || versionNumber} (${versionNumber})</option>`;
    }).join('');

    const orgCheckboxes = orgs.map(org => {
      const alias = org.alias || org.username;
      return `
        <div class="org-checkbox">
          <input type="checkbox" id="org_${org.orgId}" value="${org.orgId}" class="org-selector">
          <label for="org_${org.orgId}">${alias}</label>
          <span class="org-detail">${org.username}</span>
        </div>
      `;
    }).join('');

    const minDate = new Date().toISOString().split('T')[0];
    const defaultDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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
            margin: 0 auto;
          }
          h1 {
            color: var(--vscode-textLink-foreground);
            margin-bottom: 10px;
          }
          .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 30px;
            font-size: 0.9em;
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
          input[type="date"],
          input[type="time"],
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
          .org-selector-container {
            max-height: 300px;
            overflow-y: auto;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 10px;
          }
          .org-checkbox {
            padding: 8px;
            margin-bottom: 5px;
            display: flex;
            align-items: center;
            gap: 10px;
            border-radius: 3px;
          }
          .org-checkbox:hover {
            background: var(--vscode-list-hoverBackground);
          }
          .org-checkbox input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
          }
          .org-checkbox label {
            margin: 0;
            cursor: pointer;
            font-weight: 500;
            flex: 1;
          }
          .org-detail {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
          }
          .selector-actions {
            display: flex;
            gap: 10px;
            margin-top: 10px;
          }
          .link-button {
            background: none;
            border: none;
            color: var(--vscode-textLink-foreground);
            text-decoration: underline;
            cursor: pointer;
            padding: 4px 0;
            font-size: 0.9em;
          }
          .link-button:hover {
            color: var(--vscode-textLink-activeForeground);
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
          .grid-2 {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 15px;
          }
          .selected-count {
            padding: 8px 12px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 12px;
            font-size: 0.9em;
            font-weight: 600;
          }
          .upgrades-list {
            margin-top: 20px;
            display: none;
          }
          .upgrades-list.visible {
            display: block;
          }
          .upgrade-item {
            padding: 12px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 10px;
          }
        </style>
      </head>
      <body>
        <h1>🚀 Schedule Push Upgrade</h1>
        <div class="subtitle">
          Push upgrades automatically install a new package version in subscriber orgs
        </div>

        <form id="upgradeForm">
          <!-- Package Version -->
          <div class="section">
            <div class="section-title">
              📦 Package Version
            </div>
            <div class="warning">
              <span class="warning-icon">⚠️</span>
              Only released versions can be pushed. Ensure your version is promoted before scheduling.
            </div>
            <div class="form-group">
              <label for="packageVersionId">Released Version *</label>
              <select id="packageVersionId" required>
                <option value="">Select a released version...</option>
                ${versionOptions}
              </select>
              <div class="help-text">The package version that will be installed</div>
            </div>
          </div>

          <!-- Target Orgs -->
          <div class="section">
            <div class="section-title">
              🎯 Target Orgs
              <span id="selectedCount" class="selected-count">0 selected</span>
            </div>
            <div class="warning">
              <span class="warning-icon">⚠️</span>
              Push upgrades will be installed automatically. Ensure orgs are ready for the upgrade.
            </div>
            <div class="org-selector-container">
              ${orgCheckboxes || '<p class="help-text">No orgs available</p>'}
            </div>
            <div class="selector-actions">
              <button type="button" class="link-button" onclick="selectAllOrgs()">Select All</button>
              <button type="button" class="link-button" onclick="deselectAllOrgs()">Deselect All</button>
            </div>
          </div>

          <!-- Schedule -->
          <div class="section">
            <div class="section-title">
              📅 Schedule
            </div>
            <div class="grid-2">
              <div class="form-group">
                <label for="scheduleDate">Date *</label>
                <input type="date" id="scheduleDate" value="${defaultDate}" min="${minDate}" required>
                <div class="help-text">Date for the push upgrade</div>
              </div>
              <div class="form-group">
                <label for="scheduleTime">Time (UTC) *</label>
                <input type="time" id="scheduleTime" value="12:00" required>
                <div class="help-text">Time in UTC timezone</div>
              </div>
            </div>
            <div class="help-text">
              Push upgrades are scheduled in UTC time. Convert from your local timezone as needed.
            </div>
          </div>

          <!-- Command Preview -->
          <div class="preview-section" id="previewSection">
            <div class="preview-title">Command Preview:</div>
            <div class="preview-command" id="previewCommand"></div>
          </div>

          <!-- Actions -->
          <div class="button-group">
            <button type="button" class="btn-primary" onclick="scheduleUpgrade()">
              Schedule Push Upgrade
            </button>
            <button type="button" class="btn-secondary" onclick="previewCommand()">
              Preview Command
            </button>
            <button type="button" class="btn-secondary" onclick="listUpgrades()">
              View Scheduled Upgrades
            </button>
            <button type="button" class="btn-secondary" onclick="cancel()">
              Cancel
            </button>
          </div>
        </form>

        <!-- Scheduled Upgrades List -->
        <div class="upgrades-list" id="upgradesList">
          <h2>Scheduled Push Upgrades</h2>
          <div id="upgradesContent"></div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          // Update selected count
          function updateSelectedCount() {
            const checkboxes = document.querySelectorAll('.org-selector:checked');
            document.getElementById('selectedCount').textContent = checkboxes.length + ' selected';
          }

          // Attach event listeners to all checkboxes
          document.querySelectorAll('.org-selector').forEach(cb => {
            cb.addEventListener('change', updateSelectedCount);
          });

          function selectAllOrgs() {
            document.querySelectorAll('.org-selector').forEach(cb => {
              cb.checked = true;
            });
            updateSelectedCount();
          }

          function deselectAllOrgs() {
            document.querySelectorAll('.org-selector').forEach(cb => {
              cb.checked = false;
            });
            updateSelectedCount();
          }

          function getFormData() {
            const selectedOrgs = Array.from(document.querySelectorAll('.org-selector:checked'))
              .map(cb => cb.value);

            const date = document.getElementById('scheduleDate').value;
            const time = document.getElementById('scheduleTime').value;
            const scheduledDate = date + 'T' + time + ':00Z';

            return {
              packageVersionId: document.getElementById('packageVersionId').value,
              orgIds: selectedOrgs,
              scheduledDate: scheduledDate
            };
          }

          function validate(data) {
            if (!data.packageVersionId) {
              alert('Please select a package version');
              return false;
            }
            if (data.orgIds.length === 0) {
              alert('Please select at least one target org');
              return false;
            }
            return true;
          }

          function previewCommand() {
            const data = getFormData();
            if (!validate(data)) return;
            vscode.postMessage({ command: 'preview', data: data });
          }

          function scheduleUpgrade() {
            const data = getFormData();
            if (!validate(data)) return;

            const confirmMsg = \`Schedule push upgrade?\\n\\n\` +
              \`Version: \${data.packageVersionId}\\n\` +
              \`Target Orgs: \${data.orgIds.length}\\n\` +
              \`Scheduled: \${data.scheduledDate}\\n\\n\` +
              \`This will automatically install the package in the selected orgs at the scheduled time.\`;

            if (!confirm(confirmMsg)) return;

            vscode.postMessage({ command: 'schedule', data: data });
          }

          function listUpgrades() {
            vscode.postMessage({ command: 'listUpgrades' });
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

              case 'upgradesListResult':
                const upgradesList = document.getElementById('upgradesList');
                const upgradesContent = document.getElementById('upgradesContent');
                const upgrades = message.upgrades;

                if (upgrades && upgrades.length > 0) {
                  upgradesContent.innerHTML = upgrades.map(u => \`
                    <div class="upgrade-item">
                      <strong>\${u.PackageVersionId}</strong><br>
                      Status: \${u.Status}<br>
                      Scheduled: \${u.ScheduledDate}<br>
                      Orgs: \${u.OrgCount || 0}
                    </div>
                  \`).join('');
                } else {
                  upgradesContent.innerHTML = '<p class="help-text">No scheduled push upgrades found</p>';
                }

                upgradesList.classList.add('visible');
                upgradesList.scrollIntoView({ behavior: 'smooth' });
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
