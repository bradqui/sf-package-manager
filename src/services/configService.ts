import * as vscode from 'vscode';
import { ExtensionConfig } from '../models/config';

export class ConfigService {
  private readonly configSection = 'sfPackageManager';

  getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(this.configSection);

    return {
      defaultDevHub: config.get<string>('defaultDevHub') || '',
      defaultTargetOrg: config.get<string>('defaultTargetOrg') || '',
      autoRefresh: config.get<boolean>('autoRefresh') ?? true,
      showCommandPreview: config.get<boolean>('showCommandPreview') ?? true,
      defaultWaitTime: config.get<number>('defaultWaitTime') ?? 10,
      verboseOutput: config.get<boolean>('verboseOutput') ?? false,
      saveCommandHistory: config.get<boolean>('saveCommandHistory') ?? true
    };
  }

  getDefaultDevHub(): string {
    return vscode.workspace.getConfiguration(this.configSection).get<string>('defaultDevHub') || '';
  }

  getDefaultTargetOrg(): string {
    return vscode.workspace.getConfiguration(this.configSection).get<string>('defaultTargetOrg') || '';
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

  getSaveCommandHistory(): boolean {
    return vscode.workspace.getConfiguration(this.configSection).get<boolean>('saveCommandHistory') ?? true;
  }

  async setDefaultDevHub(devHub: string): Promise<void> {
    await vscode.workspace.getConfiguration(this.configSection).update('defaultDevHub', devHub, vscode.ConfigurationTarget.Global);
  }

  async setDefaultTargetOrg(targetOrg: string): Promise<void> {
    await vscode.workspace.getConfiguration(this.configSection).update('defaultTargetOrg', targetOrg, vscode.ConfigurationTarget.Global);
  }
}
