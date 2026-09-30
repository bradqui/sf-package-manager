import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ExtensionConfig } from '../models/config';
import { Logger } from '../utils/logger';

export type SettingSource = 'workspace' | 'user' | 'sf-cli' | 'none';

type OrgSetting = 'defaultDevHub' | 'defaultTargetOrg';

// Salesforce CLI config keys (current, then legacy sfdx) for each setting
const SF_CONFIG_KEYS: Record<OrgSetting, string[]> = {
  defaultDevHub: ['target-dev-hub', 'defaultdevhubusername'],
  defaultTargetOrg: ['target-org', 'defaultusername']
};

const SF_CONFIG_CACHE_MS = 5000;

export class ConfigService {
  private readonly configSection = 'sfPackageManager';
  private sfConfigCache: { values: Record<string, string>; readAt: number } | undefined;

  getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(this.configSection);

    return {
      defaultDevHub: this.getDefaultDevHub(),
      defaultTargetOrg: this.getDefaultTargetOrg(),
      autoRefresh: config.get<boolean>('autoRefresh') ?? true,
      showCommandPreview: config.get<boolean>('showCommandPreview') ?? true,
      defaultWaitTime: config.get<number>('defaultWaitTime') ?? 10,
      verboseOutput: config.get<boolean>('verboseOutput') ?? false
    };
  }

  /** Extension setting, falling back to the Salesforce CLI's target-dev-hub. */
  getDefaultDevHub(): string {
    return this.getOrgSetting('defaultDevHub').value;
  }

  /** Extension setting, falling back to the Salesforce CLI's target-org. */
  getDefaultTargetOrg(): string {
    return this.getOrgSetting('defaultTargetOrg').value;
  }

  getDevHubSource(): SettingSource {
    return this.getOrgSetting('defaultDevHub').source;
  }

  getTargetOrgSource(): SettingSource {
    return this.getOrgSetting('defaultTargetOrg').source;
  }

  getAutoRefresh(): boolean {
    return vscode.workspace.getConfiguration(this.configSection).get<boolean>('autoRefresh') ?? true;
  }

  getShowCommandPreview(): boolean {
    return vscode.workspace.getConfiguration(this.configSection).get<boolean>('showCommandPreview') ?? true;
  }

  getDefaultWaitTime(): number {
    return vscode.workspace.getConfiguration(this.configSection).get<number>('defaultWaitTime') ?? 10;
  }

  getVerboseOutput(): boolean {
    return vscode.workspace.getConfiguration(this.configSection).get<boolean>('verboseOutput') ?? false;
  }

  /** Saved per workspace when a folder is open, so each project keeps its own Dev Hub. */
  async setDefaultDevHub(devHub: string): Promise<void> {
    await vscode.workspace.getConfiguration(this.configSection).update('defaultDevHub', devHub, this.orgSettingTarget());
  }

  /** Saved per workspace when a folder is open, so each project keeps its own target org. */
  async setDefaultTargetOrg(targetOrg: string): Promise<void> {
    await vscode.workspace.getConfiguration(this.configSection).update('defaultTargetOrg', targetOrg, this.orgSettingTarget());
  }

  async updateSetting(key: 'autoRefresh' | 'showCommandPreview' | 'defaultWaitTime' | 'verboseOutput', value: boolean | number): Promise<void> {
    await vscode.workspace.getConfiguration(this.configSection).update(key, value, vscode.ConfigurationTarget.Global);
  }

  private orgSettingTarget(): vscode.ConfigurationTarget {
    return vscode.workspace.workspaceFolders?.length
      ? vscode.ConfigurationTarget.Workspace
      : vscode.ConfigurationTarget.Global;
  }

  private getOrgSetting(setting: OrgSetting): { value: string; source: SettingSource } {
    const inspected = vscode.workspace.getConfiguration(this.configSection).inspect<string>(setting);
    if (inspected?.workspaceFolderValue || inspected?.workspaceValue) {
      return { value: (inspected.workspaceFolderValue || inspected.workspaceValue) as string, source: 'workspace' };
    }
    if (inspected?.globalValue) {
      return { value: inspected.globalValue, source: 'user' };
    }
    const sfValue = SF_CONFIG_KEYS[setting].map(key => this.readSfConfig()[key]).find(Boolean);
    if (sfValue) {
      return { value: sfValue, source: 'sf-cli' };
    }
    return { value: '', source: 'none' };
  }

  /**
   * Merge Salesforce CLI config: global (~/.sf, ~/.sfdx) overridden by the
   * project's local config (.sf, .sfdx). Cached briefly; the files are tiny.
   */
  private readSfConfig(): Record<string, string> {
    if (this.sfConfigCache && Date.now() - this.sfConfigCache.readAt < SF_CONFIG_CACHE_MS) {
      return this.sfConfigCache.values;
    }

    const home = os.homedir();
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const files = [
      path.join(home, '.sfdx', 'sfdx-config.json'),
      path.join(home, '.sf', 'config.json'),
      ...(workspaceRoot
        ? [path.join(workspaceRoot, '.sfdx', 'sfdx-config.json'), path.join(workspaceRoot, '.sf', 'config.json')]
        : [])
    ];

    const values: Record<string, string> = {};
    for (const file of files) {
      try {
        if (fs.existsSync(file)) {
          const content = JSON.parse(fs.readFileSync(file, 'utf8'));
          for (const [key, value] of Object.entries(content)) {
            if (typeof value === 'string' && value) {
              values[key] = value;
            }
          }
        }
      } catch (error) {
        Logger.debug(`Could not read Salesforce CLI config ${file}: ${error}`);
      }
    }

    this.sfConfigCache = { values, readAt: Date.now() };
    return values;
  }
}
