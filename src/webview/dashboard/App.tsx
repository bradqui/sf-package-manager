import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import type { ResourceKey, ViewId } from '../../shared/protocol';
import { computeUpgrade } from '../../shared/versions';
import { loadResources, onHostMessage, runAction } from './api';
import { elapsed } from './format';
import { OrgSelect } from './OrgSelect';
import {
  AppApi,
  AppContext,
  DrawerState,
  UiState,
  loadUiState,
  saveUiState,
  useApp,
  useHostState
} from './state';
import { Button, Icon } from './ui';
import { OverviewView } from './views/Overview';
import { PackagesView } from './views/Packages';
import { PackageDetailView } from './views/PackageDetail';
import { VersionsView } from './views/Versions';
import { InstallationsView } from './views/Installations';
import { ScratchOrgsView } from './views/ScratchOrgs';
import { SettingsView } from './views/Settings';
import { CreatePackageDrawer } from './forms/CreatePackage';
import { CreateVersionDrawer } from './forms/CreateVersion';
import { InstallDrawer } from './forms/Install';
import { ScratchOrgDrawer } from './forms/ScratchOrg';
import { ScratchDefDrawer } from './forms/ScratchDef';

/** Data each view needs. The org list is always loaded for the header. */
const VIEW_RESOURCES: Record<ViewId, ResourceKey[]> = {
  overview: ['packages', 'versions', 'installed', 'orgs'],
  packages: ['packages', 'versions', 'orgs'],
  package: ['packages', 'versions', 'installed', 'orgs'],
  versions: ['packages', 'versions', 'orgs'],
  installations: ['installed', 'packages', 'versions', 'orgs'],
  'scratch-orgs': ['orgs'],
  settings: ['orgs']
};

const NAV_ITEMS: { view: ViewId; label: string; icon: string }[] = [
  { view: 'overview', label: 'Overview', icon: 'home' },
  { view: 'packages', label: 'Packages', icon: 'package' },
  { view: 'versions', label: 'Versions', icon: 'versions' },
  { view: 'installations', label: 'Installations', icon: 'cloud-download' },
  { view: 'scratch-orgs', label: 'Scratch Orgs', icon: 'vm' },
  { view: 'settings', label: 'Settings', icon: 'settings-gear' }
];

export function App() {
  const host = useHostState();
  const [ui, setUi] = useState<UiState>(loadUiState);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const updateUi = useCallback((patch: Partial<UiState>) => {
    setUi(previous => {
      const next = { ...previous, ...patch };
      saveUiState(next);
      return next;
    });
  }, []);

  const navigate = useCallback((view: ViewId, packageId?: string) => {
    updateUi({ view, packageId });
    document.querySelector('.content')?.scrollTo(0, 0);
  }, [updateUi]);

  // The host can ask us to navigate (e.g. "Open Dashboard" from the sidebar)
  useEffect(() => onHostMessage(message => {
    if (message.type === 'navigate') {
      navigate(message.view, message.packageId);
    }
  }), [navigate]);

  // Load what the current view needs. Only request data that isn't loaded yet;
  // the host pushes updates for anything already loaded.
  const devHub = host.context?.devHub;
  const targetOrg = host.context?.targetOrg;
  useEffect(() => {
    if (!host.context) {
      return;
    }
    const needed = VIEW_RESOURCES[ui.view].filter(key => {
      const state = host.resources[key];
      return state.status === 'idle' || (state.status === 'error' && state.data === undefined);
    });
    loadResources(needed);
    // Re-evaluate when the view changes or the selected orgs change
  }, [ui.view, !!host.context, devHub, targetOrg]);

  const refresh = useCallback((keys: ResourceKey[]) => loadResources(keys, true), []);

  const app: AppApi = useMemo(() => ({
    host,
    ui,
    updateUi,
    navigate,
    openDrawer: setDrawer,
    refresh
  }), [host, ui, updateUi, navigate, refresh]);

  if (!host.context) {
    return <div class="boot"><Icon name="loading" spin /> Loading dashboard…</div>;
  }

  return (
    <AppContext.Provider value={app}>
      <div class="app">
        <Header onRefresh={() => refresh(VIEW_RESOURCES[ui.view])} />
        <div class="app-body">
          <Nav />
          <main class="content">
            <CurrentView />
          </main>
        </div>
        {drawer && <DrawerHost drawer={drawer} onClose={() => setDrawer(null)} />}
      </div>
    </AppContext.Provider>
  );
}

function CurrentView() {
  const { ui } = useApp();
  switch (ui.view) {
    case 'packages': return <PackagesView />;
    case 'package': return <PackageDetailView packageId={ui.packageId || ''} />;
    case 'versions': return <VersionsView />;
    case 'installations': return <InstallationsView />;
    case 'scratch-orgs': return <ScratchOrgsView />;
    case 'settings': return <SettingsView />;
    default: return <OverviewView />;
  }
}

function DrawerHost({ drawer, onClose }: { drawer: DrawerState; onClose: () => void }) {
  switch (drawer.kind) {
    case 'createPackage': return <CreatePackageDrawer onClose={onClose} />;
    case 'createVersion': return <CreateVersionDrawer packageName={drawer.packageName} onClose={onClose} />;
    case 'install': return <InstallDrawer versionId={drawer.versionId} onClose={onClose} />;
    case 'scratchOrg': return <ScratchOrgDrawer onClose={onClose} />;
    case 'scratchDef': return <ScratchDefDrawer onClose={onClose} />;
  }
}

function Header({ onRefresh }: { onRefresh: () => void }) {
  const { host } = useApp();
  const context = host.context!;
  const operations = host.operations;
  const loading = Object.values(host.resources).some(r => r.status === 'loading');
  const [, setTick] = useState(0);

  // Tick every second while operations run so elapsed times update
  useEffect(() => {
    if (operations.length === 0) {
      return;
    }
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, [operations.length]);

  const latest = operations[operations.length - 1];

  return (
    <header class="app-header">
      <div class="brand">
        <Icon name="package" />
        <span class="brand-name">SF Package Manager</span>
        {context.project && <span class="project-chip" title="Salesforce DX project">{context.project.name}</span>}
      </div>
      <div class="header-orgs">
        <OrgSelect kind="devHub" compact />
        <OrgSelect kind="targetOrg" compact />
      </div>
      <div class="header-status">
        {latest && (
          <span
            class="operations"
            title={operations.map(op => `${op.label} (${elapsed(op.startedAt)})`).join('\n')}
            role="status"
          >
            <Icon name="loading" spin />
            <span class="operations-label">{latest.label}</span>
            <span class="muted">{elapsed(latest.startedAt)}</span>
            {operations.length > 1 && <span class="count-badge">+{operations.length - 1}</span>}
          </span>
        )}
        <Button variant="ghost" icon={loading ? undefined : 'refresh'} busy={loading} title="Refresh from Salesforce" onClick={onRefresh} />
        <Button variant="ghost" icon="output" title="Show output log" onClick={() => runAction({ kind: 'showOutput' })} />
      </div>
    </header>
  );
}

function Nav() {
  const { host, ui, navigate } = useApp();
  const { packages, versions, installed, orgs } = host.resources;

  const updates = useMemo(() => {
    if (!installed.data || !packages.data || !versions.data) {
      return 0;
    }
    return installed.data.filter(item => {
      const upgrade = computeUpgrade(item, packages.data!, versions.data!);
      return !!upgrade.releasedUpgrade;
    }).length;
  }, [installed.data, packages.data, versions.data]);

  const counts: Partial<Record<ViewId, number | undefined>> = {
    packages: packages.data?.length,
    versions: versions.data?.length,
    installations: installed.data?.length,
    'scratch-orgs': orgs.data?.filter(o => o.isScratch).length
  };

  return (
    <nav class="app-nav" aria-label="Dashboard sections">
      {NAV_ITEMS.map(item => {
        const active = ui.view === item.view || (item.view === 'packages' && ui.view === 'package');
        const count = counts[item.view];
        return (
          <button
            key={item.view}
            type="button"
            class={`nav-item${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            onClick={() => navigate(item.view)}
          >
            <Icon name={item.icon} />
            <span class="nav-label">{item.label}</span>
            {item.view === 'installations' && updates > 0
              ? <span class="count-badge accent" title={`${updates} update(s) available`}>{updates}</span>
              : count !== undefined && <span class="count-badge">{count}</span>}
          </button>
        );
      })}
    </nav>
  );
}
