import type { ComponentChildren } from 'preact';
import { computeUpgrade, isManaged, summarizeVersions, versionString } from '../../../shared/versions';
import { runAction } from '../api';
import { useApp } from '../state';
import { Badge, Button, Callout, Card, CopyId, EmptyState, Icon, ResourceGate, Timestamp } from '../ui';
import { VersionList } from './VersionList';

export function PackageDetailView({ packageId }: { packageId: string }) {
  const { host, refresh, navigate } = useApp();
  const { packages, versions } = host.resources;

  return (
    <div class="view">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <button type="button" class="link-button" onClick={() => navigate('packages')}>Packages</button>
        <Icon name="chevron-right" />
        <span>{packages.data?.find(p => p.Id === packageId)?.Name || packageId}</span>
      </nav>
      <ResourceGate states={[packages, versions]} onRetry={() => refresh(['packages', 'versions', 'installed'])}>
        {() => <PackageDetail packageId={packageId} />}
      </ResourceGate>
    </div>
  );
}

function PackageDetail({ packageId }: { packageId: string }) {
  const { host, navigate, openDrawer } = useApp();
  const pkg = host.resources.packages.data!.find(p => p.Id === packageId);
  const allVersions = host.resources.versions.data!;

  if (!pkg) {
    return (
      <EmptyState icon="question" title="Package not found" actions={<Button onClick={() => navigate('packages')}>Back to packages</Button>}>
        It may have been deleted, or it belongs to a different Dev Hub.
      </EmptyState>
    );
  }

  const versions = allVersions.filter(v => v.Package2Id === pkg.Id);
  const summary = summarizeVersions(versions);
  const dir = host.context?.project?.packageDirectories.find(d => d.packageId === pkg.Id);
  const managed = isManaged(pkg);

  // Which version of this package the target org has installed, if any
  const installedItem = host.resources.installed.data?.find(item =>
    computeUpgrade(item, [pkg], versions).package?.Id === pkg.Id
  );
  const upgrade = installedItem ? computeUpgrade(installedItem, [pkg], versions) : undefined;

  return (
    <>
      <header class="view-header">
        <div>
          <h1>
            {pkg.Name}
            <Badge tone={managed ? 'managed' : 'unlocked'}>{pkg.ContainerOptions}</Badge>
          </h1>
          {pkg.Description && <p class="muted">{pkg.Description}</p>}
        </div>
        <div class="header-actions">
          {dir?.package
            ? <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'createVersion', packageName: dir.package })}>New version</Button>
            : <span class="muted" title="Versions are built from a package directory in sfdx-project.json">Not in this project</span>}
          <Button variant="ghost" icon="trash" title="Delete package" onClick={() => runAction({ kind: 'deletePackage', packageId: pkg.Id, name: pkg.Name })} />
        </div>
      </header>

      <div class="card-grid">
        <Card title="Details" icon="info">
          <dl class="details">
            <Detail label="Package ID"><CopyId value={pkg.Id} label="package ID" /></Detail>
            <Detail label="Subscriber package ID"><CopyId value={pkg.SubscriberPackageId} label="subscriber package ID" /></Detail>
            <Detail label="Namespace">{pkg.NamespacePrefix || <span class="muted">None</span>}</Detail>
            {!managed && <Detail label="Org dependent">{pkg.IsOrgDependent ? 'Yes' : 'No'}</Detail>}
            <Detail label="Created"><Timestamp value={pkg.CreatedDate} /></Detail>
          </dl>
        </Card>

        <Card title="In this project" icon="folder">
          {dir
            ? (
              <dl class="details">
                <Detail label="Path"><code>{dir.path}</code>{dir.default && <Badge>default</Badge>}</Detail>
                <Detail label="Next version number"><code>{dir.versionNumber || '—'}</code></Detail>
                {dir.versionName && <Detail label="Version name">{dir.versionName}</Detail>}
                {managed && (
                  <Detail label="Ancestor">
                    {dir.ancestorVersion || dir.ancestorId
                      ? <code>{dir.ancestorVersion || dir.ancestorId}</code>
                      : <span class="muted">Highest released version (default)</span>}
                  </Detail>
                )}
              </dl>
            )
            : <p class="muted">This package isn’t in the open project’s sfdx-project.json, so new versions can’t be built from here.</p>}
        </Card>

        <Card title="Versions" icon="versions">
          <dl class="details">
            <Detail label="Latest released">
              {summary.latestReleased
                ? <><code>{versionString(summary.latestReleased)}</code> <span class="muted"><Timestamp value={summary.latestReleased.CreatedDate} /></span></>
                : <span class="muted">None yet</span>}
            </Detail>
            <Detail label="Latest beta">
              {summary.latestBeta
                ? <><code>{versionString(summary.latestBeta)}</code> <span class="muted"><Timestamp value={summary.latestBeta.CreatedDate} /></span></>
                : <span class="muted">None</span>}
            </Detail>
            <Detail label="Total">{summary.releasedCount} released · {summary.betaCount} beta</Detail>
          </dl>
        </Card>

        <Card title={`Target org${host.context?.targetOrg ? `: ${host.context.targetOrg}` : ''}`} icon="target">
          {!host.context?.targetOrg && <p class="muted">Select a target org in the header to see what’s installed.</p>}
          {host.context?.targetOrg && !host.resources.installed.data && <p class="muted">Loading…</p>}
          {host.resources.installed.data && !installedItem && host.context?.targetOrg && <p class="muted">Not installed.</p>}
          {installedItem && (
            <dl class="details">
              <Detail label="Installed">
                <code>{installedItem.SubscriberPackageVersionNumber}</code>
                {upgrade?.currentIsBeta && <Badge tone="beta">Beta</Badge>}
              </Detail>
              <Detail label="Status">
                {upgrade?.releasedUpgrade
                  ? <Badge tone="info" icon="arrow-up">{versionString(upgrade.releasedUpgrade)} available</Badge>
                  : upgrade?.currentIsBeta
                    ? <span class="muted">Beta installs must be uninstalled before upgrading</span>
                    : <Badge tone="released" icon="check">Up to date</Badge>}
              </Detail>
            </dl>
          )}
        </Card>
      </div>

      {managed && summary.releasedCount === 0 && (
        <Callout tone="info">
          Managed package versions become upgradeable for subscribers once promoted. Promote a beta when it’s ready to release.
        </Callout>
      )}

      <h2 class="section-title">Versions</h2>
      <VersionList versions={allVersions} packages={host.resources.packages.data!} lockedPackageId={pkg.Id} />
    </>
  );
}

function Detail({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
