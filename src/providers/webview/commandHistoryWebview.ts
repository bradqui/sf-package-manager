import * as vscode from 'vscode';
import { CommandHistoryService } from '../../services/commandHistoryService';
import { Logger } from '../../utils/logger';

export class CommandHistoryWebview {
  private panel: vscode.WebviewPanel | undefined;

  constructor(private historyService: CommandHistoryService) {}

  async show(): Promise<void> {
    // Create or show panel
    if (this.panel) {
      this.panel.reveal();
      this.refreshData();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'commandHistory',
      'Command History',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    // Set initial HTML
    this.refreshData();

    // Handle messages
    this.panel.webview.onDidReceiveMessage(
      async message => {
        switch (message.command) {
          case 'refresh':
            this.refreshData();
            break;
          case 'clearAll':
            await this.handleClearAll();
            break;
          case 'clearOld':
            await this.handleClearOld(message.days);
            break;
          case 'export':
            await this.handleExport();
            break;
          case 'search':
            this.handleSearch(message.query);
            break;
          case 'showDetails':
            this.handleShowDetails(message.id);
            break;
          case 'rerun':
            await this.handleRerun(message.id);
            break;
        }
      }
    );

    // Cleanup
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private refreshData(): void {
    if (!this.panel) return;

    const history = this.historyService.getHistory();
    const stats = this.historyService.getStatistics();
    this.panel.webview.html = this.getHtmlContent(history, stats);
  }

  private async handleClearAll(): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      'Clear all command history?',
      { modal: true },
      'Clear'
    );

    if (confirm === 'Clear') {
      this.historyService.clearHistory();
      this.refreshData();
      vscode.window.showInformationMessage('Command history cleared');
    }
  }

  private async handleClearOld(days: number): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `Clear commands older than ${days} days?`,
      { modal: true },
      'Clear'
    );

    if (confirm === 'Clear') {
      this.historyService.clearOldHistory(days);
      this.refreshData();
      vscode.window.showInformationMessage(`Cleared commands older than ${days} days`);
    }
  }

  private async handleExport(): Promise<void> {
    const json = this.historyService.exportHistory();

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('command-history.json'),
      filters: { 'JSON': ['json'] }
    });

    if (uri) {
      await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));
      vscode.window.showInformationMessage(`History exported to ${uri.fsPath}`);
    }
  }

  private handleSearch(query: string): void {
    if (!this.panel) return;

    const results = this.historyService.searchHistory(query);
    const stats = this.historyService.getStatistics();
    this.panel.webview.html = this.getHtmlContent(results, stats, query);
  }

  private handleShowDetails(id: string): void {
    const entry = this.historyService.getEntry(id);
    if (!entry) return;

    this.panel?.webview.postMessage({
      command: 'showDetailsResult',
      entry: entry
    });
  }

  private async handleRerun(id: string): Promise<void> {
    const entry = this.historyService.getEntry(id);
    if (!entry) return;

    const confirm = await vscode.window.showWarningMessage(
      `Rerun command?\n\n${entry.preview}`,
      { modal: true },
      'Rerun'
    );

    if (confirm === 'Rerun') {
      // Note: Actual rerun would need CLI executor instance
      // For now, just copy to clipboard
      await vscode.env.clipboard.writeText(entry.preview);
      vscode.window.showInformationMessage('Command copied to clipboard. Paste in terminal to rerun.');
    }
  }

  private getHtmlContent(history: any[], stats: any, searchQuery?: string): string {
    const historyHtml = history.length > 0 ? history.map(entry => {
      const date = new Date(entry.timestamp).toLocaleString();
      const statusIcon = entry.success ? '✅' : '❌';
      const statusClass = entry.success ? 'success' : 'failure';
      const duration = (entry.duration / 1000).toFixed(2);

      return `
        <div class="history-entry ${statusClass}">
          <div class="entry-header">
            <span class="status-icon">${statusIcon}</span>
            <span class="timestamp">${date}</span>
            <span class="duration">${duration}s</span>
          </div>
          <div class="command-preview">${this.escapeHtml(entry.preview)}</div>
          ${entry.error ? `<div class="error-message">Error: ${this.escapeHtml(entry.error)}</div>` : ''}
          <div class="entry-actions">
            <button class="link-button" onclick="showDetails('${entry.id}')">Details</button>
            <button class="link-button" onclick="rerunCommand('${entry.id}')">Rerun</button>
          </div>
        </div>
      `;
    }).join('') : '<p class="no-results">No command history found</p>';

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
            margin-bottom: 10px;
          }
          .stats-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin: 20px 0;
          }
          .stat-card {
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            text-align: center;
          }
          .stat-value {
            font-size: 2em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
          }
          .stat-label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
          }
          .controls {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            flex-wrap: wrap;
          }
          .search-box {
            flex: 1;
            min-width: 200px;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
          }
          button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
          }
          .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
          }
          .btn-primary:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .btn-danger {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-inputValidation-errorForeground);
          }
          .history-entry {
            margin-bottom: 15px;
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-left: 4px solid;
            border-radius: 4px;
          }
          .history-entry.success {
            border-left-color: var(--vscode-testing-iconPassed);
          }
          .history-entry.failure {
            border-left-color: var(--vscode-testing-iconFailed);
          }
          .entry-header {
            display: flex;
            gap: 15px;
            align-items: center;
            margin-bottom: 10px;
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
          }
          .status-icon {
            font-size: 1.2em;
          }
          .timestamp {
            flex: 1;
          }
          .duration {
            font-family: monospace;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
          }
          .command-preview {
            font-family: monospace;
            font-size: 0.9em;
            padding: 10px;
            background: var(--vscode-textCodeBlock-background);
            border-radius: 3px;
            word-break: break-all;
            margin-bottom: 10px;
          }
          .error-message {
            color: var(--vscode-errorForeground);
            padding: 8px;
            background: var(--vscode-inputValidation-errorBackground);
            border-radius: 3px;
            margin-bottom: 10px;
            font-size: 0.9em;
          }
          .entry-actions {
            display: flex;
            gap: 10px;
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
          .no-results {
            text-align: center;
            padding: 40px;
            color: var(--vscode-descriptionForeground);
          }
          .details-modal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 1000;
            align-items: center;
            justify-content: center;
          }
          .details-modal.visible {
            display: flex;
          }
          .details-content {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 20px;
            max-width: 800px;
            max-height: 80vh;
            overflow-y: auto;
          }
          .details-content h3 {
            margin-top: 0;
          }
          .close-button {
            float: right;
            font-size: 1.5em;
            cursor: pointer;
            border: none;
            background: none;
            color: var(--vscode-foreground);
          }
        </style>
      </head>
      <body>
        <h1>📜 Command History</h1>

        <!-- Statistics -->
        <div class="stats-container">
          <div class="stat-card">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">Total Commands</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.successful}</div>
            <div class="stat-label">Successful</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.failed}</div>
            <div class="stat-label">Failed</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.successRate.toFixed(1)}%</div>
            <div class="stat-label">Success Rate</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${(stats.avgDuration / 1000).toFixed(1)}s</div>
            <div class="stat-label">Avg Duration</div>
          </div>
        </div>

        <!-- Controls -->
        <div class="controls">
          <input type="text" class="search-box" id="searchBox" placeholder="Search commands..." value="${searchQuery || ''}">
          <button class="btn-primary" onclick="searchHistory()">Search</button>
          <button class="btn-primary" onclick="refresh()">Refresh</button>
          <button class="btn-primary" onclick="exportHistory()">Export</button>
          <button class="btn-danger" onclick="clearOld()">Clear Old</button>
          <button class="btn-danger" onclick="clearAll()">Clear All</button>
        </div>

        <!-- History Entries -->
        <div id="historyContainer">
          ${historyHtml}
        </div>

        <!-- Details Modal -->
        <div class="details-modal" id="detailsModal">
          <div class="details-content">
            <button class="close-button" onclick="closeDetails()">&times;</button>
            <div id="detailsContent"></div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();

          function refresh() {
            vscode.postMessage({ command: 'refresh' });
          }

          function searchHistory() {
            const query = document.getElementById('searchBox').value;
            vscode.postMessage({ command: 'search', query: query });
          }

          function clearAll() {
            if (confirm('Clear all command history?')) {
              vscode.postMessage({ command: 'clearAll' });
            }
          }

          function clearOld() {
            const days = prompt('Clear commands older than how many days?', '30');
            if (days && !isNaN(days)) {
              vscode.postMessage({ command: 'clearOld', days: parseInt(days) });
            }
          }

          function exportHistory() {
            vscode.postMessage({ command: 'export' });
          }

          function showDetails(id) {
            vscode.postMessage({ command: 'showDetails', id: id });
          }

          function rerunCommand(id) {
            vscode.postMessage({ command: 'rerun', id: id });
          }

          function closeDetails() {
            document.getElementById('detailsModal').classList.remove('visible');
          }

          // Handle Enter key in search box
          document.getElementById('searchBox').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
              searchHistory();
            }
          });

          // Handle messages from extension
          window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
              case 'showDetailsResult':
                const entry = message.entry;
                const detailsContent = document.getElementById('detailsContent');
                detailsContent.innerHTML = \`
                  <h3>Command Details</h3>
                  <p><strong>Timestamp:</strong> \${new Date(entry.timestamp).toLocaleString()}</p>
                  <p><strong>Status:</strong> \${entry.success ? '✅ Success' : '❌ Failed'}</p>
                  <p><strong>Duration:</strong> \${(entry.duration / 1000).toFixed(2)}s</p>
                  <p><strong>Command:</strong></p>
                  <pre>\${entry.preview}</pre>
                  \${entry.error ? \`<p><strong>Error:</strong></p><pre>\${entry.error}</pre>\` : ''}
                  \${entry.output ? \`<p><strong>Output:</strong></p><pre>\${entry.output}</pre>\` : ''}
                \`;
                document.getElementById('detailsModal').classList.add('visible');
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
