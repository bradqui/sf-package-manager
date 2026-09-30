import * as vscode from 'vscode';
import { CliExecutor } from './cliExecutor';
import { ErrorHandler } from '../utils/errors';

export interface OrgSummary {
  alias?: string;
  username: string;
  orgId: string;
  instanceUrl: string;
  isDevHub: boolean;
  isScratch: boolean;
  expirationDate?: string;
  isDefaultUsername?: boolean;
  isDefaultDevHubUsername?: boolean;
}

interface PickOrgOptions {
  title: string;
  placeHolder: string;
  /** Shown instead of the picker when no orgs match the filter. */
  emptyMessage: string;
  filter?: (org: OrgSummary) => boolean;
  /** Alias or username of the currently selected org, marked in the list. */
  current?: string;
}

const CACHE_TTL_MS = 60_000;

/**
 * Lists locally authenticated orgs. The list is cached briefly and shared by
 * every caller, and cleared whenever a command changes org data.
 */
export class OrgService {
  private static cache: { orgs: OrgSummary[]; fetchedAt: number } | undefined;
  private static pending: Promise<OrgSummary[]> | undefined;

  constructor(private cliExecutor: CliExecutor) {}

  static clearCache(): void {
    OrgService.cache = undefined;
  }

  /** Throws if the CLI call fails. */
  async listOrgs(force = false): Promise<OrgSummary[]> {
    const cache = OrgService.cache;
    if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return cache.orgs;
    }
    if (!OrgService.pending) {
      OrgService.pending = this.fetchOrgs().finally(() => {
        OrgService.pending = undefined;
      });
    }
    return OrgService.pending;
  }

  async listScratchOrgs(force = false): Promise<OrgSummary[]> {
    return (await this.listOrgs(force)).filter(org => org.isScratch);
  }

  /**
   * Show an org picker immediately with a busy indicator while orgs load.
   * Returns undefined if the user cancels, loading fails, or no orgs match.
   */
  async pickOrg(options: PickOrgOptions): Promise<OrgSummary | undefined> {
    type OrgItem = vscode.QuickPickItem & { org: OrgSummary };

    const picker = vscode.window.createQuickPick<OrgItem>();
    picker.title = options.title;
    picker.placeholder = 'Loading orgs…';
    picker.matchOnDescription = true;
    picker.matchOnDetail = true;
    picker.busy = true;
    picker.enabled = false;
    picker.show();

    let orgs: OrgSummary[];
    try {
      orgs = await this.listOrgs();
    } catch (error) {
      picker.dispose();
      ErrorHandler.handle(error, 'Failed to list orgs');
      return undefined;
    }

    const matching = options.filter ? orgs.filter(options.filter) : orgs;
    if (matching.length === 0) {
      picker.dispose();
      vscode.window.showWarningMessage(options.emptyMessage);
      return undefined;
    }

    picker.items = matching.map(org => {
      const isCurrent = !!options.current && (org.alias === options.current || org.username === options.current);
      const tags = [
        org.isDevHub ? 'Dev Hub' : '',
        org.isScratch ? 'Scratch' : '',
        org.expirationDate ? `expires ${new Date(org.expirationDate).toLocaleDateString()}` : ''
      ].filter(Boolean).join(' · ');
      return {
        label: `${isCurrent ? '$(check) ' : ''}${org.alias || org.username}`,
        description: org.alias ? org.username : undefined,
        detail: tags || undefined,
        org
      };
    });
    picker.placeholder = options.placeHolder;
    picker.busy = false;
    picker.enabled = true;

    return new Promise(resolve => {
      let resolved = false;
      picker.onDidAccept(() => {
        resolved = true;
        resolve(picker.selectedItems[0]?.org);
        picker.dispose();
      });
      picker.onDidHide(() => {
        if (!resolved) {
          resolve(undefined);
        }
        picker.dispose();
      });
    });
  }

  private async fetchOrgs(): Promise<OrgSummary[]> {
    const result = await this.cliExecutor.execute(
      'sf',
      ['org', 'list', '--skip-connection-status', '--json'],
      { label: 'Loading orgs' }
    );

    if (!result.success || !result.data?.result) {
      throw new Error(result.error || 'Failed to list orgs');
    }

    const toSummary = (org: any, isScratch: boolean): OrgSummary => ({
      alias: org.alias,
      username: org.username,
      orgId: org.orgId,
      instanceUrl: org.instanceUrl,
      isDevHub: org.isDevHub === true,
      isScratch,
      expirationDate: org.expirationDate,
      isDefaultUsername: org.isDefaultUsername,
      isDefaultDevHubUsername: org.isDefaultDevHubUsername
    });

    const orgs = [
      ...(result.data.result.nonScratchOrgs || []).map((org: any) => toSummary(org, false)),
      ...(result.data.result.scratchOrgs || []).map((org: any) => toSummary(org, true))
    ];

    OrgService.cache = { orgs, fetchedAt: Date.now() };
    return orgs;
  }
}

CliExecutor.onDidChangeData(() => OrgService.clearCache());
