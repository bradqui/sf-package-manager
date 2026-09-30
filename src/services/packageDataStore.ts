import * as vscode from 'vscode';
import { CliExecutor } from './cliExecutor';
import { CommandBuilder } from './commandBuilder';
import { ConfigService } from './configService';
import { OrgService } from './orgService';
import { Package } from '../models/package';
import { PackageVersion } from '../models/packageVersion';
import { InstalledPackage, OrgInfo, ResourceKey, ResourceTypes } from '../shared/protocol';
import { Logger } from '../utils/logger';

/**
 * - changed: a command changed Salesforce data (views reload if auto refresh is on)
 * - refresh: the user asked for fresh data (views always reload)
 * - scope: the Dev Hub or target org changed (views always reload)
 */
export interface StoreChange {
  keys: ResourceKey[];
  reason: 'changed' | 'refresh' | 'scope';
}

interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

// Cached data is reused for this long unless a refresh is forced. Changes made
// through the extension invalidate the cache immediately, so this only bounds
// how stale data changed elsewhere (another tool, another user) can get.
const CACHE_TTL_MS = 10 * 60 * 1000;
// Orgs can be authorized from a terminal at any time, so re-read them sooner
const ORGS_CACHE_TTL_MS = 60 * 1000;

/**
 * Single source of Salesforce data for the dashboard and the sidebar.
 *
 * - Caches per Dev Hub / target org, so switching orgs never shows the wrong data
 * - Concurrent requests for the same data share one CLI call
 * - Commands that change data invalidate the affected resources and fire
 *   onDidChange so every view can reload
 */
export class PackageDataStore implements vscode.Disposable {
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly changed = new vscode.EventEmitter<StoreChange>();
  private readonly disposables: vscode.Disposable[] = [];

  /** Fires with the resources whose data is no longer current, and why. */
  readonly onDidChange = this.changed.event;

  constructor(
    private readonly cliExecutor: CliExecutor,
    private readonly commandBuilder: CommandBuilder,
    private readonly configService: ConfigService,
    private readonly orgService: OrgService
  ) {
    this.disposables.push(
      this.changed,
      CliExecutor.onDidChangeData(command => this.invalidate(this.resourcesChangedBy(command), 'changed')),
      vscode.workspace.onDidChangeConfiguration(e => {
        const changed: ResourceKey[] = [];
        if (e.affectsConfiguration('sfPackageManager.defaultDevHub')) {
          changed.push('packages', 'versions');
        }
        if (e.affectsConfiguration('sfPackageManager.defaultTargetOrg')) {
          changed.push('installed');
        }
        if (changed.length > 0) {
          // Cache keys include the org, so nothing to clear; just tell views to reload
          this.changed.fire({ keys: changed, reason: 'scope' });
        }
      })
    );
  }

  dispose(): void {
    this.disposables.forEach(d => d.dispose());
  }

  /** The Dev Hub or target org a resource is loaded from ('' if not configured). */
  scopeOf(key: ResourceKey): string {
    switch (key) {
      case 'packages':
      case 'versions':
        return this.configService.getDefaultDevHub();
      case 'installed':
        return this.configService.getDefaultTargetOrg();
      case 'orgs':
        return 'local';
    }
  }

  /** Cached copy, if any, without loading. */
  peek<K extends ResourceKey>(key: K): CacheEntry<ResourceTypes[K]> | undefined {
    return this.cache.get(this.cacheKey(key)) as CacheEntry<ResourceTypes[K]> | undefined;
  }

  async getPackages(force = false): Promise<Package[]> {
    return (await this.load('packages', force)).data;
  }

  async getVersions(force = false): Promise<PackageVersion[]> {
    return (await this.load('versions', force)).data;
  }

  async getInstalled(force = false): Promise<InstalledPackage[]> {
    return (await this.load('installed', force)).data;
  }

  async getOrgs(force = false): Promise<OrgInfo[]> {
    return (await this.load('orgs', force)).data;
  }

  /**
   * Load a resource (from cache unless forced or expired).
   * Throws if the CLI call fails or the needed org isn't configured.
   */
  async load<K extends ResourceKey>(key: K, force = false): Promise<CacheEntry<ResourceTypes[K]>> {
    const cacheKey = this.cacheKey(key);
    const cached = this.cache.get(cacheKey) as CacheEntry<ResourceTypes[K]> | undefined;
    const ttl = key === 'orgs' ? ORGS_CACHE_TTL_MS : CACHE_TTL_MS;
    if (!force && cached && Date.now() - cached.fetchedAt < ttl) {
      return cached;
    }

    let pending = this.pending.get(cacheKey) as Promise<CacheEntry<ResourceTypes[K]>> | undefined;
    if (!pending) {
      pending = this.fetch(key, force).then(data => {
        const entry = { data, fetchedAt: Date.now() };
        this.cache.set(cacheKey, entry);
        return entry;
      }).finally(() => this.pending.delete(cacheKey));
      this.pending.set(cacheKey, pending);
    }
    return pending;
  }

  /** Drop cached data (all resources when none given) and notify listeners. */
  invalidate(keys: ResourceKey[] = ['packages', 'versions', 'installed', 'orgs'], reason: StoreChange['reason'] = 'refresh'): void {
    if (keys.length === 0) {
      return;
    }
    for (const key of keys) {
      for (const cacheKey of [...this.cache.keys()]) {
        if (cacheKey.startsWith(`${key}:`)) {
          this.cache.delete(cacheKey);
        }
      }
      if (key === 'orgs') {
        OrgService.clearCache();
      }
    }
    Logger.debug(`Data invalidated (${reason}): ${keys.join(', ')}`);
    this.changed.fire({ keys, reason });
  }

  private cacheKey(key: ResourceKey): string {
    return `${key}:${this.scopeOf(key)}`;
  }

  private async fetch<K extends ResourceKey>(key: K, force: boolean): Promise<ResourceTypes[K]> {
    if (key === 'orgs') {
      return (await this.orgService.listOrgs(force)) as ResourceTypes[K];
    }

    const scope = this.scopeOf(key);
    if (!scope) {
      throw new Error(key === 'installed'
        ? 'No target org selected.'
        : 'No Dev Hub selected.');
    }

    const { args, label } = this.commandFor(key, scope);
    const result = await this.cliExecutor.execute('sf', args, { label });
    if (!result.success) {
      throw new Error(result.error || `Failed to load ${key}`);
    }
    return (result.data?.result || []) as ResourceTypes[K];
  }

  private commandFor(key: ResourceKey, scope: string): { args: string[]; label: string } {
    switch (key) {
      case 'packages':
        return { args: this.commandBuilder.buildPackageList(scope), label: 'Loading packages' };
      case 'versions':
        return { args: this.commandBuilder.buildPackageVersionList(scope), label: 'Loading package versions' };
      default:
        return { args: this.commandBuilder.buildPackageInstalledList(scope), label: `Loading packages installed in ${scope}` };
    }
  }

  /** Map a CLI command ("sf package version create") to the data it changes. */
  private resourcesChangedBy(command: string): ResourceKey[] {
    const words = command.split(' ');
    if (words[1] === 'org') {
      return ['orgs', 'installed'];
    }
    if (words[1] === 'package') {
      if (words[2] === 'install' || words[2] === 'uninstall') {
        return ['installed'];
      }
      if (words[2] === 'version') {
        return ['versions'];
      }
      return ['packages', 'versions'];
    }
    return [];
  }
}
