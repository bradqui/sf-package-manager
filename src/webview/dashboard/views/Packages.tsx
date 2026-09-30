import { useMemo, useState } from 'preact/hooks';
import type { Package } from '../../../models/package';
import type { PackageVersion } from '../../../models/packageVersion';
import { isManaged, summarizeVersions, versionString } from '../../../shared/versions';
import { runAction } from '../api';
import { useApp } from '../state';
import { Badge, Button, CopyId, EmptyState, Icon, Menu, ResourceGate, SearchBox, Timestamp } from '../ui';

export function PackagesView() {
  const { host, refresh, openDrawer } = useApp();
  const { packages, versions } = host.resources;

  return (
    <div class="view">
      <header class="view-header">
        <div>
          <h1>Packages</h1>
          <p class="muted">Packages owned by your Dev Hub. Select one to see its versions and details.</p>
        </div>
        <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'createPackage' })}>New package</Button>
      </header>
      <ResourceGate states={[packages, versions]} onRetry={() => refresh(['packages', 'versions'])}>
        {() => <PackagesTable packages={packages.data!} versions={versions.data!} />}
      </ResourceGate>
    </div>
  );
}

function PackagesTable({ packages, versions }: { packages: Package[]; versions: PackageVersion[] }) {
  const { host, navigate, openDrawer } = useApp();
  const [search, setSearch] = useState('');
  const projectDirs = host.context?.project?.packageDirectories || [];

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const inProject = (pkg: Package) => projectDirs.findIndex(d => d.packageId === pkg.Id);
    return packages
      .filter(p => !query || [p.Name, p.Id, p.NamespacePrefix, p.Description].join(' ').toLowerCase().includes(query))
      .map(pkg => ({
        pkg,
        projectIndex: inProject(pkg),
        summary: summarizeVersions(versions.filter(v => v.Package2Id === pkg.Id))
      }))
      .sort((a, b) =>
        ((a.projectIndex === -1 ? Infinity : a.projectIndex) - (b.projectIndex === -1 ? Infinity : b.projectIndex)) ||
        a.pkg.Name.localeCompare(b.pkg.Name)
      );
  }, [packages, versions, search, projectDirs]);

  if (packages.length === 0) {
    return (
      <EmptyState icon="package" title="No packages in this Dev Hub yet" actions={
        <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'createPackage' })}>New package</Button>
      }>
        A package groups the metadata in one of your project’s package directories so it can be versioned and installed.
      </EmptyState>
    );
  }

  return (
    <>
      <div class="toolbar">
        <SearchBox value={search} onInput={setSearch} placeholder="Search packages" />
      </div>
      <table class="table">
        <thead>
          <tr>
            <th>Package</th>
            <th>Type</th>
            <th>Latest released</th>
            <th>Latest beta</th>
            <th>Versions</th>
            <th>Package ID</th>
            <th class="col-actions"><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pkg, projectIndex, summary }) => {
            const dir = projectIndex >= 0 ? projectDirs[projectIndex] : undefined;
            return (
              <tr key={pkg.Id} class="clickable" onClick={(e) => {
                if (!(e.target as HTMLElement).closest('button, a, input')) {
                  navigate('package', pkg.Id);
                }
              }}>
                <td>
                  <div class="version-cell">
                    <button type="button" class="link-button" onClick={() => navigate('package', pkg.Id)}>
                      <strong>{pkg.Name}</strong>
                    </button>
                    <span class="muted">
                      {pkg.NamespacePrefix ? `Namespace ${pkg.NamespacePrefix}` : 'No namespace'}
                      {dir && <> · <Icon name="folder" /> {dir.path}</>}
                    </span>
                  </div>
                </td>
                <td>
                  <div class="badges">
                    <Badge tone={isManaged(pkg) ? 'managed' : 'unlocked'}>{pkg.ContainerOptions}</Badge>
                    {pkg.IsOrgDependent && <Badge title="Org-dependent unlocked package">Org dependent</Badge>}
                  </div>
                </td>
                <td>{summary.latestReleased
                  ? <><code>{versionString(summary.latestReleased)}</code> <span class="muted"><Timestamp value={summary.latestReleased.CreatedDate} /></span></>
                  : <span class="muted">None</span>}</td>
                <td>{summary.latestBeta
                  ? <><code>{versionString(summary.latestBeta)}</code> <span class="muted"><Timestamp value={summary.latestBeta.CreatedDate} /></span></>
                  : <span class="muted">None</span>}</td>
                <td>{summary.total}</td>
                <td><CopyId value={pkg.Id} label="package ID" /></td>
                <td class="col-actions">
                  <div class="row-actions">
                    {dir?.package && (
                      <Button small icon="add" title="Create a new version" onClick={() => openDrawer({ kind: 'createVersion', packageName: dir.package })}>
                        Version
                      </Button>
                    )}
                    <Menu items={[
                      { label: 'Open details', icon: 'go-to-file', onSelect: () => navigate('package', pkg.Id) },
                      { label: 'Copy package ID', icon: 'copy', onSelect: () => runAction({ kind: 'copy', text: pkg.Id, label: 'package ID' }) },
                      {
                        label: `Install latest released${summary.latestReleased ? ` (${versionString(summary.latestReleased)})` : ''}`,
                        icon: 'cloud-download',
                        disabled: !summary.latestReleased,
                        onSelect: () => summary.latestReleased && runAction({
                          kind: 'installVersion',
                          versionId: summary.latestReleased.SubscriberPackageVersionId,
                          label: `${pkg.Name} ${versionString(summary.latestReleased)}`,
                          pickOrg: false
                        })
                      },
                      {
                        label: `Install latest beta${summary.latestBeta ? ` (${versionString(summary.latestBeta)})` : ''}`,
                        icon: 'beaker',
                        disabled: !summary.latestBeta,
                        onSelect: () => summary.latestBeta && runAction({
                          kind: 'installVersion',
                          versionId: summary.latestBeta.SubscriberPackageVersionId,
                          label: `${pkg.Name} ${versionString(summary.latestBeta)}`,
                          pickOrg: false
                        })
                      },
                      null,
                      { label: 'Delete package', icon: 'trash', danger: true, onSelect: () => runAction({ kind: 'deletePackage', packageId: pkg.Id, name: pkg.Name }) }
                    ]} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}
