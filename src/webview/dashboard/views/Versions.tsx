import { useApp } from '../state';
import { Button, ResourceGate } from '../ui';
import { VersionList } from './VersionList';

export function VersionsView() {
  const { host, refresh, openDrawer } = useApp();
  const { packages, versions } = host.resources;

  return (
    <div class="view">
      <header class="view-header">
        <div>
          <h1>Versions</h1>
          <p class="muted">Every version of every package in your Dev Hub, newest first.</p>
        </div>
        <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'createVersion' })}>New version</Button>
      </header>
      <ResourceGate states={[packages, versions]} onRetry={() => refresh(['packages', 'versions'])}>
        {() => <VersionList versions={versions.data!} packages={packages.data!} />}
      </ResourceGate>
    </div>
  );
}
