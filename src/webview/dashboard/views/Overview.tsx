import { useMemo } from 'preact/hooks';
import type { Package } from '../../../models/package';
import { computeUpgrade, parseSalesforceDate, summarizeVersions, versionString } from '../../../shared/versions';
import { daysUntil, plural } from '../format';
import { OrgSelect } from '../OrgSelect';
import { useApp } from '../state';
import { Badge, Button, Callout, Card, EmptyState, Icon, PackageTypeBadge, Spinner, Timestamp, VersionStatusBadge } from '../ui';
import { versionLabel } from './VersionList';

export function OverviewView() {
  const { host } = useApp();
  const context = host.context!;

  return (
    <div class="view">
      <header class="view-header">
        <div>
          <h1>{context.project?.name || 'Overview'}</h1>
          <p class="muted">
            {context.project
              ? `${plural(context.project.packageDirectories.length, 'package directory', 'package directories')}${context.project.namespace ? ` · namespace ${context.project.namespace}` : ''}`
              : 'No sfdx-project.json found in this workspace.'}
          </p>
        </div>
      </header>

      {!context.devHub && (
        <Callout tone="warning" icon="server-environment" actions={<OrgSelect kind="devHub" compact />}>
          <strong>Choose a Dev Hub to get started.</strong> Packages and versions are created and stored in your Dev Hub org.
        </Callout>
      )}

      <div class="card-grid">
        <ProjectPackagesCard />
        <InstallationsCard />
        <ScratchOrgsCard />
        <RecentVersionsCard />
      </div>
    </div>
  );
}

function ProjectPackagesCard() {
  const { host, navigate, openDrawer } = useApp();
  const { packages, versions } = host.resources;
  const dirs = host.context?.project?.packageDirectories || [];

  // Packages in this project; fall back to all Dev Hub packages if none are linked yet
  const rows = useMemo(() => {
    if (!packages.data) {
      return [];
    }
    const inProject = dirs
      .map(dir => ({ dir, pkg: packages.data!.find(p => p.Id === dir.packageId) }))
      .filter((row): row is { dir: typeof dirs[number]; pkg: Package } => !!row.pkg);
    const list = inProject.length > 0 ? inProject : packages.data.map(pkg => ({ pkg, dir: undefined }));
    return list.map(row => ({ ...row, summary: summarizeVersions((versions.data || []).filter(v => v.Package2Id === row.pkg.Id)) }));
  }, [packages.data, versions.data, dirs]);

  return (
    <Card title="Packages" icon="package" class="span-2" actions={
      <Button small variant="ghost" onClick={() => navigate('packages')}>All packages</Button>
    }>
      {!packages.data && (packages.status === 'error'
        ? <p class="muted">Couldn’t load packages: {packages.error}</p>
        : <Spinner label="Loading packages…" />)}
      {packages.data && rows.length === 0 && (
        <EmptyState icon="package" title="No packages yet" actions={
          <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'createPackage' })}>New package</Button>
        } />
      )}
      {rows.length > 0 && (
        <table class="table compact">
          <thead>
            <tr>
              <th>Package</th>
              <th>Latest released</th>
              <th>Latest beta</th>
              <th class="col-actions"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ pkg, dir, summary }) => (
              <tr key={pkg.Id}>
                <td>
                  <button type="button" class="link-button" onClick={() => navigate('package', pkg.Id)}>
                    <strong>{pkg.Name}</strong>
                  </button>{' '}
                  <PackageTypeBadge pkg={pkg} />
                </td>
                <td>{summary.latestReleased
                  ? <><code>{versionString(summary.latestReleased)}</code> <span class="muted"><Timestamp value={summary.latestReleased.CreatedDate} /></span></>
                  : <span class="muted">None</span>}</td>
                <td>{summary.latestBeta
                  ? <><code>{versionString(summary.latestBeta)}</code> <span class="muted"><Timestamp value={summary.latestBeta.CreatedDate} /></span></>
                  : <span class="muted">None</span>}</td>
                <td class="col-actions">
                  {dir?.package && (
                    <Button small icon="add" onClick={() => openDrawer({ kind: 'createVersion', packageName: dir.package })}>New version</Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function InstallationsCard() {
  const { host, navigate, openDrawer } = useApp();
  const { installed, packages, versions } = host.resources;
  const targetOrg = host.context?.targetOrg;

  const withUpdates = useMemo(() => {
    if (!installed.data || !packages.data || !versions.data) {
      return [];
    }
    return installed.data
      .map(item => ({ item, upgrade: computeUpgrade(item, packages.data!, versions.data!) }))
      .filter(row => row.upgrade.releasedUpgrade);
  }, [installed.data, packages.data, versions.data]);

  return (
    <Card title="Target org" icon="target" actions={
      <Button small variant="ghost" onClick={() => navigate('installations')}>Installations</Button>
    }>
      {!targetOrg && (
        <>
          <p class="muted">Pick the org you install and test packages in.</p>
          <OrgSelect kind="targetOrg" />
        </>
      )}
      {targetOrg && !installed.data && (installed.status === 'error'
        ? <p class="muted">Couldn’t load installed packages: {installed.error}</p>
        : <Spinner label={`Loading ${targetOrg}…`} />)}
      {targetOrg && installed.data && (
        <>
          <p class="stat"><strong>{installed.data.length}</strong> {installed.data.length === 1 ? 'package' : 'packages'} installed in <strong>{targetOrg}</strong></p>
          {withUpdates.length > 0
            ? (
              <ul class="plain-list">
                {withUpdates.map(({ item, upgrade }) => (
                  <li key={item.SubscriberPackageVersionId}>
                    <Icon name="arrow-up" /> {item.SubscriberPackageName}: {item.SubscriberPackageVersionNumber} → <code>{versionString(upgrade.releasedUpgrade!)}</code>
                  </li>
                ))}
              </ul>
            )
            : installed.data.length > 0 && <p class="muted"><Icon name="check" /> Everything from this Dev Hub is up to date.</p>}
          <div class="card-footer-actions">
            <Button small icon="cloud-download" onClick={() => openDrawer({ kind: 'install' })}>Install a package</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function ScratchOrgsCard() {
  const { host, navigate, openDrawer } = useApp();
  const orgs = host.resources.orgs;
  const scratchOrgs = (orgs.data || []).filter(o => o.isScratch)
    .sort((a, b) => parseSalesforceDate(a.expirationDate) - parseSalesforceDate(b.expirationDate));
  const expiringSoon = scratchOrgs.filter(o => daysUntil(o.expirationDate) <= 2);

  return (
    <Card title="Scratch orgs" icon="vm" actions={
      <Button small variant="ghost" onClick={() => navigate('scratch-orgs')}>Manage</Button>
    }>
      {!orgs.data && <Spinner label="Loading orgs…" />}
      {orgs.data && (
        <>
          <p class="stat"><strong>{scratchOrgs.length}</strong> active scratch {scratchOrgs.length === 1 ? 'org' : 'orgs'}</p>
          {expiringSoon.length > 0 && (
            <ul class="plain-list">
              {expiringSoon.map(org => (
                <li key={org.username}>
                  <Icon name="warning" /> {org.alias || org.username} expires <Timestamp value={org.expirationDate} />
                </li>
              ))}
            </ul>
          )}
          <div class="card-footer-actions">
            <Button small icon="add" onClick={() => openDrawer({ kind: 'scratchOrg' })}>New scratch org</Button>
          </div>
        </>
      )}
    </Card>
  );
}

function RecentVersionsCard() {
  const { host, navigate } = useApp();
  const versions = host.resources.versions;
  const recent = useMemo(
    () => [...(versions.data || [])]
      .sort((a, b) => parseSalesforceDate(b.CreatedDate) - parseSalesforceDate(a.CreatedDate))
      .slice(0, 6),
    [versions.data]
  );

  return (
    <Card title="Recently created versions" icon="history" class="span-2" actions={
      <Button small variant="ghost" onClick={() => navigate('versions')}>All versions</Button>
    }>
      {!versions.data && (versions.status === 'error'
        ? <p class="muted">Couldn’t load versions: {versions.error}</p>
        : <Spinner label="Loading versions…" />)}
      {versions.data && recent.length === 0 && <p class="muted">No versions yet.</p>}
      {recent.length > 0 && (
        <table class="table compact">
          <tbody>
            {recent.map(version => (
              <tr key={version.SubscriberPackageVersionId}>
                <td><code>{versionLabel(version)}</code> {version.Name && <span class="muted">{version.Name}</span>}</td>
                <td><VersionStatusBadge released={version.IsReleased} /></td>
                <td>{version.Branch && <Badge icon="git-branch">{version.Branch}</Badge>}</td>
                <td class="muted"><Timestamp value={version.CreatedDate} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
