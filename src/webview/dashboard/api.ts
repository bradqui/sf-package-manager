/**
 * Bridge between the dashboard app and the extension host.
 */
import type { DashboardAction, HostMessage, ResourceKey, WebviewMessage } from '../../shared/protocol';

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

export interface ActionResult {
  ok: boolean;
  result?: string;
}

// acquireVsCodeApi may only be called once per page
const vscode: VsCodeApi = typeof acquireVsCodeApi === 'function'
  ? acquireVsCodeApi()
  : { postMessage: () => undefined, getState: () => undefined, setState: () => undefined };

const listeners = new Set<(message: HostMessage) => void>();
const pendingActions = new Map<number, (result: ActionResult) => void>();
let nextActionId = 1;

window.addEventListener('message', (event: MessageEvent<HostMessage>) => {
  const message = event.data;
  if (message?.type === 'actionComplete') {
    pendingActions.get(message.actionId)?.({ ok: message.ok, result: message.result });
    pendingActions.delete(message.actionId);
  }
  listeners.forEach(listener => listener(message));
});

export function onHostMessage(listener: (message: HostMessage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function send(message: WebviewMessage): void {
  vscode.postMessage(message);
}

export function loadResources(keys: ResourceKey[], force = false): void {
  if (keys.length > 0) {
    send({ type: 'load', keys, force });
  }
}

/** Run an action in the extension; resolves when it has finished (or been cancelled). */
export function runAction(action: DashboardAction): Promise<ActionResult> {
  const actionId = nextActionId++;
  return new Promise(resolve => {
    pendingActions.set(actionId, resolve);
    send({ type: 'action', actionId, action });
  });
}

export function getPersistedState<T>(): T | undefined {
  return vscode.getState() as T | undefined;
}

export function setPersistedState<T>(state: T): void {
  vscode.setState(state);
}
