import { useMemo } from 'preact/hooks';
import type { InstalledPackage } from '../../../shared/protocol';
import { computeUpgrade, UpgradeInfo, versionString } from '../../../shared/versions';
import { runAction } from '../api';
import { OrgSelect } from '../OrgSelect';
import { useApp } from '../state';
import { ActionButton, Badge, Button, Callout, CopyId, EmptyState, Menu, ResourceGate } from '../ui';

export function InstallationsView() {
  const { host, refresh, openDrawer } = useApp();
  const { installed, packages, versions } = host.resources;
  const targetOrg = host.context?.targetOrg;

  return (
    <div class="view">
      <header class="view-header">
        <div>
          <h1>Installations</h1>
          <p class="muted">
            {targetOrg ? <>Packages installed in <strong>{targetOrg}</strong>, and upgrades available from your Dev Hub.</> : 'Packages installed in your target org.'}
          </p>
        </div>
        <Button variant="primary" icon="cloud-download" onClick={() => openDrawer({ kind: 'install' })}>Install package</Button>
      </header>

      {!targetOrg
        ? (
          <Callout tone="warning" icon="target" actions={<OrgSelect kind="targetOrg" compact />}>
            <strong>Select a target org</strong> to see what’s installed in it.
          </Callout>
        )
        : (
          <ResourceGate states={[installed]} onRetry={() => refresh(['installed'])} loadingLabel={`Loading packages installed in ${targetOrg}…`}>
            {() => <InstalledTable items={installed.data!} upgradesKnown={!!packages.data && !!versions.data} />}
          </ResourceGate>
        )}
    </div>
  );
}

function InstalledTable({ items, upgradesKnown }: { items: InstalledPackage[]; upgradesKnown: boolean }) {
  const { host, openDrawer } = useApp();
  const packages = host.resources.packages.data || [];
  const versions = host.resources.versions.data || [];

  const rows = useMemo(
    () => items
      .map(item => ({ item, upgrade: computeUpgrade(item, packages, versions) }))
      .sort((a, b) => a.item.SubscriberPackageName.localeCompare(b.item.SubscriberPackageName)),
    [items, packages, versions]
  );

  if (items.length === 0) {
    return (
      <EmptyState icon="cloud-download" title="No packages installed" actions={
        <Button variant="primary" icon="cloud-download" onClick={() => openDrawer({ kind: 'install' })}>Install package</Button>
      } />
    );
  }

  return (
    <table class="table">
      <thead>
        <tr>
          <th>Package</th>
          <th>Installed version</th>
          <th>Status</th>
          <th>Version ID</th>
          <th class="col-actions"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ item, upgrade }) => (
          <tr key={item.SubscriberPackageVersionId}>
            <td>
              <div class="version-cell">
                <strong>{item.SubscriberPackageName}</strong>
                <span class="muted">{item.SubscriberPackageNamespace ? `Namespace ${item.SubscriberPackageNamespace}` : 'No namespace'}</span>
              </div>
            </td>
            <td>
              <code>{item.SubscriberPackageVersionNumber}</code>
              {item.SubscriberPackageVersionName && <span class="muted"> {item.SubscriberPackageVersionName}</span>}
            </td>
            <td><UpgradeStatus upgrade={upgrade} known={upgradesKnown} /></td>
            <td><CopyId value={item.SubscriberPackageVersionId} label="version ID" /></td>
            <td class="col-actions">
              <div class="row-actions">
                {upgrade.releasedUpgrade && (
                  <ActionButton small variant="primary" icon="arrow-up" action={{
                    kind: 'upgradePackage',
                    targetVersionId: upgrade.releasedUpgrade.SubscriberPackageVersionId,
                    name: item.SubscriberPackageName,
                    targetLabel: versionString(upgrade.releasedUpgrade),
                    isBeta: false
                  }}>
                    Upgrade
                  </ActionButton>
                )}
                <Menu items={[
                  {
                    label: `Upgrade to beta ${upgrade.betaUpgrade ? versionString(upgrade.betaUpgrade) : ''}`,
                    icon: 'beaker',
                    hidden: !upgrade.betaUpgrade,
                    onSelect: () => upgrade.betaUpgrade && runAction({
                      kind: 'upgradePackage',
                      targetVersionId: upgrade.betaUpgrade.SubscriberPackageVersionId,
                      name: item.SubscriberPackageName,
                      targetLabel: versionString(upgrade.betaUpgrade),
                      isBeta: true
                    })
                  },
                  { label: 'Copy version ID', icon: 'copy', onSelect: () => runAction({ kind: 'copy', text: item.SubscriberPackageVersionId, label: 'version ID' }) },
                  null,
                  {
                    label: 'Uninstall',
                    icon: 'trash',
                    danger: true,
                    onSelect: () => runAction({ kind: 'uninstallPackage', versionId: item.SubscriberPackageVersionId, name: item.SubscriberPackageName })
                  }
                ]} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UpgradeStatus({ upgrade, known }: { upgrade: UpgradeInfo; known: boolean }) {
  if (!known) {
    return <span class="muted">Checking…</span>;
  }
  if (!upgrade.package) {
    return <span class="muted" title="This package isn’t owned by the selected Dev Hub">Not from this Dev Hub</span>;
  }
  if (upgrade.currentIsBeta) {
    return <Badge tone="beta" title="Beta installs can’t be upgraded; uninstall and reinstall instead">Beta install</Badge>;
  }
  if (upgrade.releasedUpgrade) {
    return <Badge tone="info" icon="arrow-up">{versionString(upgrade.releasedUpgrade)} available</Badge>;
  }
  if (upgrade.betaUpgrade) {
    return <Badge tone="beta" icon="beaker" title="A newer beta exists (scratch orgs and sandboxes only)">Beta {versionString(upgrade.betaUpgrade)} available</Badge>;
  }
  return <Badge tone="released" icon="check">Up to date</Badge>;
}
