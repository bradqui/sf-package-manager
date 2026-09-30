import { createContext } from 'preact';
import { useContext, useEffect, useReducer } from 'preact/hooks';
import type {
  DashboardContext,
  HostMessage,
  ResourceKey,
  ResourceState,
  RunningOperationInfo,
  ViewId
} from '../../shared/protocol';
import { getPersistedState, onHostMessage, send, setPersistedState } from './api';

export type Resources = { [K in ResourceKey]: ResourceState<K> };

export interface HostState {
  context?: DashboardContext;
  resources: Resources;
  operations: RunningOperationInfo[];
}

const idle = { status: 'idle' as const };

const initialHostState: HostState = {
  resources: { packages: idle, versions: idle, installed: idle, orgs: idle },
  operations: []
};

function hostReducer(state: HostState, message: HostMessage): HostState {
  switch (message.type) {
    case 'context':
      return { ...state, context: message.context };
    case 'resource':
      return { ...state, resources: { ...state.resources, [message.key]: message.state } };
    case 'operations':
      return { ...state, operations: message.operations };
    default:
      return state;
  }
}

/** Subscribes to host messages and tells the host the page is ready. */
export function useHostState(): HostState {
  const [state, dispatch] = useReducer(hostReducer, initialHostState);
  useEffect(() => {
    const unsubscribe = onHostMessage(dispatch);
    send({ type: 'ready' });
    return unsubscribe;
  }, []);
  return state;
}

// ---------- Persisted UI state (survives hiding the panel and reloads) ----------

export interface VersionFilters {
  search: string;
  status: 'all' | 'released' | 'beta';
  branch: string;
  packageId: string;
  showAllBetas: boolean;
}

export interface UiState {
  view: ViewId;
  packageId?: string;
  versionFilters: VersionFilters;
  /** Collapsed version groups, keyed "packageId:major.minor" */
  collapsedGroups: string[];
  /** Groups the user expanded explicitly (overrides the default collapse) */
  expandedGroups: string[];
}

export const defaultUiState: UiState = {
  view: 'overview',
  versionFilters: { search: '', status: 'all', branch: '', packageId: '', showAllBetas: false },
  collapsedGroups: [],
  expandedGroups: []
};

export function loadUiState(): UiState {
  const saved = getPersistedState<Partial<UiState>>();
  return {
    ...defaultUiState,
    ...saved,
    versionFilters: { ...defaultUiState.versionFilters, ...(saved?.versionFilters || {}) }
  };
}

export function saveUiState(state: UiState): void {
  setPersistedState(state);
}

// ---------- App context ----------

export type DrawerState =
  | { kind: 'createPackage' }
  | { kind: 'createVersion'; packageName?: string }
  | { kind: 'install'; versionId?: string }
  | { kind: 'scratchOrg' }
  | { kind: 'scratchDef' };

export interface AppApi {
  host: HostState;
  ui: UiState;
  updateUi: (patch: Partial<UiState>) => void;
  navigate: (view: ViewId, packageId?: string) => void;
  openDrawer: (drawer: DrawerState) => void;
  refresh: (keys: ResourceKey[]) => void;
}

export const AppContext = createContext<AppApi | null>(null);

export function useApp(): AppApi {
  const app = useContext(AppContext);
  if (!app) {
    throw new Error('useApp must be used inside AppContext');
  }
  return app;
}
