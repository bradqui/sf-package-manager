import type { OrgInfo } from '../../../shared/protocol';
import { parseSalesforceDate } from '../../../shared/versions';
import { runAction } from '../api';
import { daysUntil } from '../format';
import { useApp } from '../state';
import { ActionButton, Badge, Button, Card, CopyId, EmptyState, Menu, ResourceGate, Timestamp } from '../ui';

export function ScratchOrgsView() {
  const { host, refresh, openDrawer } = useApp();
  const orgs = host.resources.orgs;
  const definitionFiles = host.context?.definitionFiles || [];

  return (
    <div class="view">
      <header class="view-header">
        <div>
          <h1>Scratch Orgs</h1>
          <p class="muted">Short-lived orgs for developing and testing packages.</p>
        </div>
        <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'scratchOrg' })}>New scratch org</Button>
      </header>

      <ResourceGate states={[orgs]} onRetry={() => refresh(['orgs'])} loadingLabel="Loading orgs…">
        {() => <ScratchOrgTable orgs={orgs.data!.filter(o => o.isScratch)} />}
      </ResourceGate>

      <Card title="Definition files" icon="json" actions={
        <Button small icon="add" onClick={() => openDrawer({ kind: 'scratchDef' })}>New definition</Button>
      }>
        {definitionFiles.length === 0
          ? <p class="muted">No *scratch-def*.json files in this workspace. Create one to describe the edition, features and settings of your scratch orgs.</p>
          : (
            <ul class="file-list">
              {definitionFiles.map(file => (
                <li key={file}>
                  <button type="button" class="link-button" onClick={() => runAction({ kind: 'openFile', path: file })}>
                    <code>{file}</code>
                  </button>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

function ScratchOrgTable({ orgs }: { orgs: OrgInfo[] }) {
  const { host, openDrawer } = useApp();
  const targetOrg = host.context?.targetOrg;
  const sorted = [...orgs].sort((a, b) => parseSalesforceDate(a.expirationDate) - parseSalesforceDate(b.expirationDate));

  if (sorted.length === 0) {
    return (
      <EmptyState icon="vm" title="No active scratch orgs" actions={
        <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'scratchOrg' })}>New scratch org</Button>
      } />
    );
  }

  return (
    <table class="table">
      <thead>
        <tr>
          <th>Org</th>
          <th>Expires</th>
          <th>Org ID</th>
          <th class="col-actions"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map(org => {
          const name = org.alias || org.username;
          const isTarget = targetOrg === org.alias || targetOrg === org.username;
          const days = daysUntil(org.expirationDate);
          return (
            <tr key={org.username}>
              <td>
                <div class="version-cell">
                  <span><strong>{name}</strong> {isTarget && <Badge tone="info" icon="target">Target org</Badge>}</span>
                  {org.alias && <span class="muted">{org.username}</span>}
                </div>
              </td>
              <td>
                {days < 0
                  ? <Badge tone="danger">Expired</Badge>
                  : days <= 2
                    ? <Badge tone="warning" icon="warning"><Timestamp value={org.expirationDate} /></Badge>
                    : <Timestamp value={org.expirationDate} />}
              </td>
              <td><CopyId value={org.orgId} label="org ID" /></td>
              <td class="col-actions">
                <div class="row-actions">
                  <ActionButton small icon="globe" action={{ kind: 'openOrg', username: org.username }}>Open</ActionButton>
                  {!isTarget && (
                    <ActionButton small variant="ghost" icon="target" title="Use as target org for installs" action={{ kind: 'setTargetOrg', value: org.alias || org.username }} />
                  )}
                  <Menu items={[
                    { label: 'Copy username', icon: 'copy', onSelect: () => runAction({ kind: 'copy', text: org.username, label: 'username' }) },
                    null,
                    { label: 'Delete scratch org', icon: 'trash', danger: true, onSelect: () => runAction({ kind: 'deleteScratchOrg', username: org.username, label: name }) }
                  ]} />
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
