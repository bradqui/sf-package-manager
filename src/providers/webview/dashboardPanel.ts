import * as vscode from 'vscode';
import { CliExecutor } from '../../services/cliExecutor';
import { ConfigService } from '../../services/configService';
import { ProjectService } from '../../services/projectService';
import { PackageDataStore, StoreChange } from '../../services/packageDataStore';
import { DashboardActions } from './dashboardActions';
import { getNonce } from '../../utils/html';
import { Logger } from '../../utils/logger';
import {
  DashboardContext,
  HostMessage,
  ResourceKey,
  ResourceState,
  ViewId,
  WebviewMessage
} from '../../shared/protocol';

const SCRATCH_DEF_GLOB = '**/*scratch-def*.json';

/**
 * Hosts the dashboard webview app (src/webview/dashboard).
 *
 * The page is rendered once; after that the host only sends data:
 * - `context`: orgs, settings and project info
 * - `resource`: loading/ready/error state of packages, versions, installs, orgs
 * - `operations`: CLI commands currently running
 */
export class DashboardPanel {
  private panel: vscode.WebviewPanel | undefined;
  private panelDisposables: vscode.Disposable[] = [];
  private ready = false;
  private pendingNavigation: HostMessage | undefined;

  /** Resources the webview has asked for; only these are pushed on change. */
  private readonly subscribed = new Set<ResourceKey>();
  /** Changed while auto refresh is off: marked out of date until the user refreshes. */
  private readonly stale = new Set<ResourceKey>();
  /** Changed while the panel was hidden: reloaded when it becomes visible. */
  private readonly reloadWhenVisible = new Set<ResourceKey>();
  /** Last state sent per resource (and the org it came from), so loading/error states can keep showing data. */
  private readonly lastData = new Map<ResourceKey, ResourceState>();
  private readonly lastScope = new Map<ResourceKey, string>();
  private actionsInFlight = 0;
  private reloadTimer: NodeJS.Timeout | undefined;
  private readonly pendingReload = new Set<ResourceKey>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly extensionVersion: string,
    private readonly store: PackageDataStore,
    private readonly configService: ConfigService,
    private readonly projectService: ProjectService,
    private readonly actions: DashboardActions
  ) {}

  static create(
    context: vscode.ExtensionContext,
    deps: {
      store: PackageDataStore;
      configService: ConfigService;
      projectService: ProjectService;
      actions: DashboardActions;
    }
  ): DashboardPanel {
    return new DashboardPanel(
      context.extensionUri,
      String(context.extension.packageJSON.version ?? ''),
      deps.store,
      deps.configService,
      deps.projectService,
      deps.actions
    );
  }

  async show(view?: ViewId, packageId?: string): Promise<void> {
    const navigation: HostMessage | undefined = view ? { type: 'navigate', view, packageId } : undefined;

    if (this.panel) {
      this.panel.reveal();
      if (navigation) {
        this.post(navigation);
      }
      return;
    }

    const webviewRoot = vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview');
    this.panel = vscode.window.createWebviewPanel(
      'sfPackageManagerDashboard',
      'SF Package Manager',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [webviewRoot]
      }
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icons', 'package.svg');
    this.ready = false;
    this.pendingNavigation = navigation;

    const definitionWatcher = vscode.workspace.createFileSystemWatcher(SCRATCH_DEF_GLOB);
    const projectWatcher = vscode.workspace.createFileSystemWatcher('**/sfdx-project.json');
    const refreshContext = () => this.postContext();

    this.panelDisposables.push(
      this.panel.webview.onDidReceiveMessage((message: WebviewMessage) => this.onMessage(message)),
      this.store.onDidChange(change => this.onStoreChange(change)),
      CliExecutor.onDidChangeRunning(() => this.postOperations()),
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('sfPackageManager')) {
          this.postContext();
        }
      }),
      this.panel.onDidChangeViewState(e => {
        if (e.webviewPanel.visible && this.reloadWhenVisible.size > 0) {
          const keys = [...this.reloadWhenVisible];
          this.reloadWhenVisible.clear();
          keys.forEach(key => this.loadResource(key, true));
        }
      }),
      definitionWatcher,
      definitionWatcher.onDidCreate(refreshContext),
      definitionWatcher.onDidDelete(refreshContext),
      projectWatcher,
      projectWatcher.onDidChange(() => {
        this.projectService.clearCache();
        this.postContext();
      })
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
      clearTimeout(this.reloadTimer);
      this.panelDisposables.forEach(d => d.dispose());
      this.panelDisposables = [];
      this.subscribed.clear();
      this.stale.clear();
      this.reloadWhenVisible.clear();
      this.lastData.clear();
      this.lastScope.clear();
    });

    this.panel.webview.html = this.getHtml(this.panel.webview, webviewRoot);
  }

  private async onMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        this.ready = true;
        await this.postContext();
        this.postOperations();
        if (this.pendingNavigation) {
          this.post(this.pendingNavigation);
          this.pendingNavigation = undefined;
        }
        break;

      case 'load':
        for (const key of message.keys) {
          this.subscribed.add(key);
          this.stale.delete(key);
          this.reloadWhenVisible.delete(key);
          this.loadResource(key, message.force === true);
        }
        break;

      case 'action': {
        this.actionsInFlight++;
        let outcome: { ok: boolean; result?: string } = { ok: false };
        try {
          outcome = await this.actions.run(message.action);
        } finally {
          this.actionsInFlight--;
          this.post({ type: 'actionComplete', actionId: message.actionId, ok: outcome.ok, result: outcome.result });
        }
        break;
      }
    }
  }

  private async loadResource(key: ResourceKey, force: boolean): Promise<void> {
    const scope = this.store.scopeOf(key);
    const previous = this.lastData.get(key);
    // Keep showing the previous data (if it's for the same org) while loading
    const keepData = previous?.data !== undefined && this.lastScope.get(key) === scope ? previous.data : undefined;

    this.post({ type: 'resource', key, state: { status: 'loading', data: keepData, fetchedAt: previous?.fetchedAt } });

    let state: ResourceState;
    try {
      const entry = await this.store.load(key, force);
      state = { status: 'ready', data: entry.data, fetchedAt: entry.fetchedAt };
    } catch (error) {
      state = { status: 'error', error: error instanceof Error ? error.message : String(error), data: keepData };
    }

    // The org changed while loading; a newer load is already on its way
    if (this.store.scopeOf(key) !== scope) {
      return;
    }
    this.lastData.set(key, state);
    this.lastScope.set(key, scope);
    this.post({ type: 'resource', key, state });
  }

  private onStoreChange(change: StoreChange): void {
    const keys = change.keys.filter(key => this.subscribed.has(key));
    if (keys.length === 0 || !this.panel) {
      return;
    }

    // Org switches and explicit refreshes always reload; other changes follow
    // the auto refresh setting (changes made from the dashboard always reload)
    const shouldReload = change.reason !== 'changed' || this.actionsInFlight > 0 || this.configService.getAutoRefresh();

    for (const key of keys) {
      if (!shouldReload) {
        this.stale.add(key);
        const last = this.lastData.get(key);
        if (last) {
          this.post({ type: 'resource', key, state: { ...last, stale: true } });
        }
      } else if (!this.panel.visible) {
        this.reloadWhenVisible.add(key);
      } else {
        this.pendingReload.add(key);
      }
    }

    // Batch reloads: bulk operations fire many changes in quick succession
    if (this.pendingReload.size > 0) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        const toReload = [...this.pendingReload];
        this.pendingReload.clear();
        toReload.forEach(key => this.loadResource(key, true));
      }, 400);
    }
  }

  private async postContext(): Promise<void> {
    if (!this.panel || !this.ready) {
      return;
    }
    try {
      this.post({ type: 'context', context: await this.buildContext() });
    } catch (error) {
      Logger.error(`Failed to build dashboard context: ${error}`);
    }
  }

  private async buildContext(): Promise<DashboardContext> {
    const project = await this.projectService.getProject();
    const definitionFiles = (await vscode.workspace.findFiles(SCRATCH_DEF_GLOB, '**/node_modules/**', 50))
      .map(uri => vscode.workspace.asRelativePath(uri))
      .sort();
    const config = this.configService.getConfig();

    return {
      devHub: this.configService.getDefaultDevHub(),
      devHubSource: this.configService.getDevHubSource(),
      targetOrg: this.configService.getDefaultTargetOrg(),
      targetOrgSource: this.configService.getTargetOrgSource(),
      project: project
        ? {
            name: project.name,
            namespace: project.namespace,
            packageDirectories: (project.packageDirectories || []).map(dir => ({
              path: dir.path,
              package: dir.package,
              versionNumber: dir.versionNumber,
              versionName: dir.versionName,
              default: dir.default,
              ancestorVersion: dir.ancestorVersion,
              ancestorId: dir.ancestorId,
              packageId: dir.package ? project.packageAliases?.[dir.package] : undefined
            }))
          }
        : undefined,
      settings: {
        autoRefresh: config.autoRefresh,
        showCommandPreview: config.showCommandPreview,
        defaultWaitTime: config.defaultWaitTime,
        verboseOutput: config.verboseOutput
      },
      definitionFiles,
      extensionVersion: this.extensionVersion
    };
  }

  private postOperations(): void {
    this.post({ type: 'operations', operations: CliExecutor.getRunningOperations() });
  }

  private post(message: HostMessage): void {
    if (this.panel && this.ready) {
      this.panel.webview.postMessage(message);
    }
  }

  private getHtml(webview: vscode.Webview, root: vscode.Uri): string {
    const nonce = getNonce();
    const asset = (...segments: string[]) => webview.asWebviewUri(vscode.Uri.joinPath(root, ...segments));
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SF Package Manager</title>
  <link rel="stylesheet" href="${asset('codicons', 'codicon.css')}">
  <link rel="stylesheet" href="${asset('dashboard.css')}">
</head>
<body>
  <div id="app"><div class="boot">Loading dashboard…</div></div>
  <script nonce="${nonce}" src="${asset('dashboard.js')}"></script>
</body>
</html>`;
  }
}
