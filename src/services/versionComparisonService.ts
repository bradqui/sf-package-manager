import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CliExecutor } from './cliExecutor';
import { CommandBuilder } from './commandBuilder';
import { Logger } from '../utils/logger';

export interface VersionDiff {
  field: string;
  oldValue: string;
  newValue: string;
  changed: boolean;
}

export interface FileDiff {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
  additions?: number;
  deletions?: number;
}

export interface VersionComparison {
  version1: any;
  version2: any;
  metadataDiffs: VersionDiff[];
  fileDiffs?: FileDiff[];
  summary: {
    metadataChanges: number;
    filesAdded: number;
    filesModified: number;
    filesDeleted: number;
    totalAdditions: number;
    totalDeletions: number;
  };
}

export class VersionComparisonService {
  constructor(
    private cliExecutor: CliExecutor,
    private commandBuilder: CommandBuilder
  ) {}

  /**
   * Compare two package versions
   */
  async compareVersions(
    version1Id: string,
    version2Id: string,
    devHub: string
  ): Promise<VersionComparison | null> {
    try {
      // Fetch details for both versions
      const version1Args = this.commandBuilder.buildPackageVersionReport(version1Id, devHub);
      const version2Args = this.commandBuilder.buildPackageVersionReport(version2Id, devHub);

      const [result1, result2] = await Promise.all([
        this.cliExecutor.execute('sf', version1Args),
        this.cliExecutor.execute('sf', version2Args)
      ]);

      if (!result1.success || !result2.success) {
        Logger.error('Failed to fetch version details for comparison');
        return null;
      }

      const version1 = result1.data?.result || result1.data;
      const version2 = result2.data?.result || result2.data;

      // Compare metadata
      const metadataDiffs = this.compareMetadata(version1, version2);

      // Calculate summary
      const summary = {
        metadataChanges: metadataDiffs.filter(d => d.changed).length,
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        totalAdditions: 0,
        totalDeletions: 0
      };

      return {
        version1,
        version2,
        metadataDiffs,
        summary
      };
    } catch (error) {
      Logger.error(`Failed to compare versions: ${error}`);
      return null;
    }
  }

  /**
   * Compare metadata fields between two versions
   */
  private compareMetadata(version1: any, version2: any): VersionDiff[] {
    const fieldsToCompare = [
      'Name',
      'MajorVersion',
      'MinorVersion',
      'PatchVersion',
      'BuildNumber',
      'Version',
      'Description',
      'Branch',
      'Tag',
      'CodeCoverage',
      'HasPassedCodeCoverageCheck',
      'ValidationSkipped',
      'AncestorVersion',
      'Language',
      'ReleaseVersion',
      'BuildDurationInSeconds',
      'HasMetadataRemoved',
      'CreatedDate',
      'LastModifiedDate'
    ];

    const diffs: VersionDiff[] = [];

    for (const field of fieldsToCompare) {
      const oldValue = this.formatValue(version1[field]);
      const newValue = this.formatValue(version2[field]);
      const changed = oldValue !== newValue;

      diffs.push({
        field,
        oldValue,
        newValue,
        changed
      });
    }

    return diffs;
  }

  /**
   * Format value for display
   */
  private formatValue(value: any): string {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }

  /**
   * Get version display name
   */
  getVersionDisplayName(version: any): string {
    if (version.Name) {
      return version.Name;
    }
    const versionNumber = version.Version ||
      `${version.MajorVersion}.${version.MinorVersion}.${version.PatchVersion}.${version.BuildNumber}`;
    return `Version ${versionNumber}`;
  }

  /**
   * Get diff color for HTML
   */
  getDiffColor(field: string, changed: boolean): string {
    if (!changed) {
      return '';
    }

    // Fields that improved
    const positiveFields = ['CodeCoverage', 'HasPassedCodeCoverageCheck'];
    if (positiveFields.includes(field)) {
      return 'positive';
    }

    // Version fields
    const versionFields = ['MajorVersion', 'MinorVersion', 'PatchVersion', 'BuildNumber'];
    if (versionFields.includes(field)) {
      return 'version';
    }

    return 'changed';
  }

  /**
   * Format field name for display
   */
  formatFieldName(field: string): string {
    // Convert camelCase to Title Case with spaces
    return field
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .replace(/^./, str => str.toUpperCase());
  }

  /**
   * Get change icon
   */
  getChangeIcon(field: string, oldValue: string, newValue: string): string {
    if (oldValue === newValue) {
      return '=';
    }

    // Version numbers - always forward
    if (['MajorVersion', 'MinorVersion', 'PatchVersion', 'BuildNumber'].includes(field)) {
      return '⬆️';
    }

    // Boolean fields
    if ((oldValue === 'Yes' || oldValue === 'No') && (newValue === 'Yes' || newValue === 'No')) {
      return oldValue === 'Yes' ? '❌' : '✅';
    }

    // Numeric comparisons
    const oldNum = parseFloat(oldValue);
    const newNum = parseFloat(newValue);
    if (!isNaN(oldNum) && !isNaN(newNum)) {
      return newNum > oldNum ? '📈' : newNum < oldNum ? '📉' : '=';
    }

    return '🔄';
  }

  /**
   * Generate comparison HTML
   */
  generateComparisonHtml(comparison: VersionComparison): string {
    const { version1, version2, metadataDiffs, summary } = comparison;

    const changedDiffs = metadataDiffs.filter(d => d.changed);
    const unchangedDiffs = metadataDiffs.filter(d => !d.changed);

    const createDiffRow = (diff: VersionDiff) => {
      const icon = this.getChangeIcon(diff.field, diff.oldValue, diff.newValue);
      const colorClass = this.getDiffColor(diff.field, diff.changed);

      return `
        <tr class="${diff.changed ? 'changed' : ''}">
          <td class="field-name">${this.formatFieldName(diff.field)}</td>
          <td class="value old-value ${colorClass}">${diff.oldValue}</td>
          <td class="icon">${icon}</td>
          <td class="value new-value ${colorClass}">${diff.newValue}</td>
        </tr>
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
            margin-bottom: 10px;
          }
          .version-info {
            display: flex;
            gap: 30px;
            margin-bottom: 30px;
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
          }
          .version-box {
            flex: 1;
          }
          .version-label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
          }
          .version-name {
            font-size: 1.2em;
            font-weight: 500;
          }
          .version-id {
            font-family: monospace;
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
          }
          .summary {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 15px;
            margin-bottom: 30px;
          }
          .summary-card {
            padding: 15px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            text-align: center;
          }
          .summary-value {
            font-size: 2em;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
          }
          .summary-label {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
          }
          .section {
            margin-bottom: 30px;
          }
          .section-title {
            font-size: 1.2em;
            font-weight: 500;
            margin-bottom: 15px;
            padding-bottom: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
          }
          th {
            text-align: left;
            padding: 10px;
            background: var(--vscode-editor-background);
            border-bottom: 2px solid var(--vscode-panel-border);
            font-weight: 500;
          }
          td {
            padding: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          tr.changed {
            background: var(--vscode-list-hoverBackground);
          }
          .field-name {
            font-weight: 500;
            width: 25%;
          }
          .value {
            font-family: monospace;
            font-size: 0.9em;
            width: 32%;
          }
          .icon {
            text-align: center;
            font-size: 1.2em;
            width: 10%;
          }
          .old-value.changed {
            color: var(--vscode-errorForeground);
            text-decoration: line-through;
          }
          .new-value.changed {
            color: var(--vscode-charts-green);
            font-weight: 500;
          }
          .old-value.version,
          .new-value.version {
            color: var(--vscode-charts-blue);
          }
          .old-value.positive,
          .new-value.positive {
            color: var(--vscode-charts-green);
          }
          .toggle-button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin-bottom: 15px;
          }
          .toggle-button:hover {
            background: var(--vscode-button-hoverBackground);
          }
          .unchanged-section {
            display: none;
          }
          .unchanged-section.visible {
            display: block;
          }
        </style>
      </head>
      <body>
        <h1>📊 Version Comparison</h1>

        <div class="version-info">
          <div class="version-box">
            <div class="version-label">Old Version</div>
            <div class="version-name">${this.getVersionDisplayName(version1)}</div>
            <div class="version-id">${version1.SubscriberPackageVersionId || version1.Id}</div>
          </div>
          <div class="version-box">
            <div class="version-label">New Version</div>
            <div class="version-name">${this.getVersionDisplayName(version2)}</div>
            <div class="version-id">${version2.SubscriberPackageVersionId || version2.Id}</div>
          </div>
        </div>

        <div class="summary">
          <div class="summary-card">
            <div class="summary-value">${summary.metadataChanges}</div>
            <div class="summary-label">Metadata Changes</div>
          </div>
        </div>

        ${changedDiffs.length > 0 ? `
        <div class="section">
          <div class="section-title">🔄 Changed Fields (${changedDiffs.length})</div>
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Old Value</th>
                <th></th>
                <th>New Value</th>
              </tr>
            </thead>
            <tbody>
              ${changedDiffs.map(diff => createDiffRow(diff)).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <button class="toggle-button" onclick="toggleUnchanged()">
          Show/Hide Unchanged Fields (${unchangedDiffs.length})
        </button>

        <div class="unchanged-section" id="unchanged-section">
          <div class="section">
            <div class="section-title">= Unchanged Fields</div>
            <table>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Old Value</th>
                  <th></th>
                  <th>New Value</th>
                </tr>
              </thead>
              <tbody>
                ${unchangedDiffs.map(diff => createDiffRow(diff)).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <script>
          function toggleUnchanged() {
            const section = document.getElementById('unchanged-section');
            section.classList.toggle('visible');
          }
        </script>
      </body>
      </html>
    `;
  }
}
