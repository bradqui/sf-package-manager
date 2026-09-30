import { useMemo, useState } from 'preact/hooks';
import type { Package } from '../../../models/package';
import type { PackageVersion } from '../../../models/packageVersion';
import { isManaged, sortVersionsDesc, versionString } from '../../../shared/versions';
import { runAction } from '../api';
import { installUrl, plural } from '../format';
import { useApp, VersionFilters } from '../state';
import {
  ActionButton,
  Badge,
  Button,
  CopyId,
  EmptyState,
  Icon,
  Menu,
  SearchBox,
  Segmented,
  Timestamp,
  VersionStatusBadge
} from '../ui';

/** Betas shown per package before "Show older betas". */
const BETAS_SHOWN = 5;
/** Newest major.minor groups expanded by default. */
const GROUPS_EXPANDED = 2;
const NO_BRANCH = '__none__';

interface MinorGroup {
  key: string;
  label: string;
  versions: PackageVersion[];
  releasedCount: number;
  betaCount: number;
}

interface PackageGroup {
  packageId: string;
  name: string;
  pkg?: Package;
  inProject: boolean;
  hiddenBetas: number;
  total: number;
  groups: MinorGroup[];
}

export function versionLabel(version: PackageVersion): string {
  const name = version.Package2Name ? `${version.Package2Name} ` : '';
  return `${name}${versionString(version)}`;
}

function matchesSearch(version: PackageVersion, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = [
    versionString(version), version.Name, version.SubscriberPackageVersionId, version.Branch, version.Tag, version.Package2Name, version.Description
  ].join(' ').toLowerCase();
  return query.split(/\s+/).every(term => haystack.includes(term));
}

export function buildGroups(
  versions: PackageVersion[],
  packages: Package[],
  filters: VersionFilters,
  packageFilter: string,
  projectPackageIds: string[],
  showAllBetasFor: Set<string>
): PackageGroup[] {
  const query = filters.search.trim().toLowerCase();
  const filtered = versions.filter(v =>
    (!packageFilter || v.Package2Id === packageFilter) &&
    (filters.status === 'all' || (filters.status === 'released') === v.IsReleased) &&
    (!filters.branch || (filters.branch === NO_BRANCH ? !v.Branch : v.Branch === filters.branch)) &&
    matchesSearch(v, query)
  );

  const byPackage = new Map<string, PackageVersion[]>();
  for (const version of filtered) {
    const list = byPackage.get(version.Package2Id) || [];
    list.push(version);
    byPackage.set(version.Package2Id, list);
  }

  // Trimming old betas only applies to the default, unfiltered view
  const trimmingAllowed = !filters.showAllBetas && !query && !filters.branch && filters.status !== 'beta';

  const result: PackageGroup[] = [];
  for (const [packageId, list] of byPackage) {
    const pkg = packages.find(p => p.Id === packageId);
    const sorted = sortVersionsDesc(list);

    let visible = sorted;
    let hiddenBetas = 0;
    if (trimmingAllowed && !showAllBetasFor.has(packageId)) {
      const keptBetas = new Set(sorted.filter(v => !v.IsReleased).slice(0, BETAS_SHOWN).map(v => v.SubscriberPackageVersionId));
      visible = sorted.filter(v => v.IsReleased || keptBetas.has(v.SubscriberPackageVersionId));
      hiddenBetas = sorted.length - visible.length;
    }

    const minorGroups = new Map<string, MinorGroup>();
    for (const version of visible) {
      const minor = `${version.MajorVersion}.${version.MinorVersion}`;
      const key = `${packageId}:${minor}`;
      const group = minorGroups.get(key) || { key, label: minor, versions: [], releasedCount: 0, betaCount: 0 };
      group.versions.push(version);
      if (version.IsReleased) {
        group.releasedCount++;
      } else {
        group.betaCount++;
      }
      minorGroups.set(key, group);
    }

    result.push({
      packageId,
      name: pkg?.Name || sorted[0]?.Package2Name || packageId,
      pkg,
      inProject: projectPackageIds.includes(packageId),
      hiddenBetas,
      total: sorted.length,
      groups: [...minorGroups.values()]
    });
  }

  // Packages in this project first (in project order), then the rest by name
  return result.sort((a, b) => {
    const ai = projectPackageIds.indexOf(a.packageId);
    const bi = projectPackageIds.indexOf(b.packageId);
    if (ai !== bi) {
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Versions grouped by package and major.minor, with filters, per-row actions
 * and bulk deletion of betas. Pass `lockedPackageId` to show a single package.
 */
export function VersionList({ versions, packages, lockedPackageId }: {
  versions: PackageVersion[];
  packages: Package[];
  lockedPackageId?: string;
}) {
  const { host, ui, updateUi, openDrawer, navigate } = useApp();
  const filters = ui.versionFilters;
  const setFilters = (patch: Partial<VersionFilters>) => updateUi({ versionFilters: { ...filters, ...patch } });
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [showAllBetasFor, setShowAllBetasFor] = useState<Set<string>>(new Set());

  const packageFilter = lockedPackageId ?? filters.packageId;
  const projectDirs = host.context?.project?.packageDirectories || [];
  const projectPackageIds = projectDirs.map(d => d.packageId).filter((id): id is string => !!id);
  const targetOrg = host.context?.targetOrg;

  const scoped = packageFilter ? versions.filter(v => v.Package2Id === packageFilter) : versions;
  const branches = useMemo(
    () => [...new Set(scoped.map(v => v.Branch).filter((b): b is string => !!b))].sort(),
    [scoped]
  );
  const hasUnbranched = scoped.some(v => !v.Branch);

  const groups = useMemo(
    () => buildGroups(versions, packages, filters, packageFilter, projectPackageIds, showAllBetasFor),
    [versions, packages, filters, packageFilter, projectPackageIds.join(), showAllBetasFor]
  );

  const filtering = !!(filters.search || filters.branch || filters.status !== 'all');
  const isCollapsed = (key: string, index: number) => {
    if (filtering) {
      return false;
    }
    if (ui.collapsedGroups.includes(key)) {
      return true;
    }
    return index >= GROUPS_EXPANDED && !ui.expandedGroups.includes(key);
  };
  const toggleGroup = (key: string, collapsed: boolean) => {
    updateUi(collapsed
      ? { collapsedGroups: ui.collapsedGroups.filter(k => k !== key), expandedGroups: [...ui.expandedGroups.filter(k => k !== key), key] }
      : { expandedGroups: ui.expandedGroups.filter(k => k !== key), collapsedGroups: [...ui.collapsedGroups.filter(k => k !== key), key] });
  };

  const toggleSelected = (version: PackageVersion, on: boolean) => {
    const next = new Map(selected);
    if (on) {
      next.set(version.SubscriberPackageVersionId, versionLabel(version));
    } else {
      next.delete(version.SubscriberPackageVersionId);
    }
    setSelected(next);
  };
  const setGroupSelected = (group: MinorGroup, on: boolean) => {
    const next = new Map(selected);
    group.versions.filter(v => !v.IsReleased).forEach(v => {
      if (on) {
        next.set(v.SubscriberPackageVersionId, versionLabel(v));
      } else {
        next.delete(v.SubscriberPackageVersionId);
      }
    });
    setSelected(next);
  };

  const visibleCount = groups.reduce((sum, g) => sum + g.groups.reduce((s, m) => s + m.versions.length, 0), 0);
  const totalCount = scoped.length;

  return (
    <div class="version-list">
      <div class="toolbar">
        <SearchBox
          value={filters.search}
          placeholder="Search version, name, ID, branch or tag"
          onInput={search => setFilters({ search })}
        />
        {!lockedPackageId && packages.length > 1 && (
          <select
            aria-label="Package"
            value={filters.packageId}
            onChange={(e) => setFilters({ packageId: (e.target as HTMLSelectElement).value })}
          >
            <option value="">All packages</option>
            {packages.map(p => <option key={p.Id} value={p.Id}>{p.Name}</option>)}
          </select>
        )}
        <Segmented
          label="Status"
          value={filters.status}
          onChange={status => setFilters({ status })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'released', label: 'Released' },
            { value: 'beta', label: 'Beta' }
          ]}
        />
        {(branches.length > 0) && (
          <select
            aria-label="Branch"
            value={filters.branch}
            onChange={(e) => setFilters({ branch: (e.target as HTMLSelectElement).value })}
          >
            <option value="">All branches</option>
            {hasUnbranched && <option value={NO_BRANCH}>No branch</option>}
            {branches.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
        <label class="toggle" title={`Show every beta instead of the newest ${BETAS_SHOWN} per package`}>
          <input
            type="checkbox"
            checked={filters.showAllBetas}
            onChange={(e) => setFilters({ showAllBetas: (e.target as HTMLInputElement).checked })}
          />
          Show all betas
        </label>
        {filtering && (
          <Button small variant="ghost" icon="clear-all" onClick={() => setFilters({ search: '', status: 'all', branch: '' })}>
            Clear filters
          </Button>
        )}
      </div>

      <div class="list-summary muted">
        Showing {visibleCount} of {plural(totalCount, 'version')}
        {!filtering && !filters.showAllBetas && visibleCount < totalCount && ` · older betas are hidden`}
      </div>

      {selected.size > 0 && (
        <div class="bulk-bar" role="region" aria-label="Selected versions">
          <span><strong>{selected.size}</strong> beta {selected.size === 1 ? 'version' : 'versions'} selected</span>
          <ActionButton
            small
            variant="danger"
            icon="trash"
            action={() => ({
              kind: 'deleteVersions',
              versions: [...selected.entries()].map(([versionId, label]) => ({ versionId, label }))
            })}
            onDone={ok => { if (ok) { setSelected(new Map()); } }}
          >
            Delete selected
          </ActionButton>
          <Button small variant="ghost" onClick={() => setSelected(new Map())}>Clear selection</Button>
        </div>
      )}

      {groups.length === 0 && (
        totalCount === 0
          ? <EmptyState icon="versions" title="No versions yet" actions={
              <Button variant="primary" icon="add" onClick={() => openDrawer({ kind: 'createVersion' })}>New version</Button>
            }>Create a version to build an installable snapshot of your package.</EmptyState>
          : <EmptyState icon="filter" title="No versions match these filters" actions={
              <Button onClick={() => setFilters({ search: '', status: 'all', branch: '' })}>Clear filters</Button>
            } />
      )}

      {groups.map(group => {
        const projectDir = projectDirs.find(d => d.packageId === group.packageId);
        return (
          <section key={group.packageId} class="package-group">
            {!lockedPackageId && (
              <header class="package-group-header">
                <button type="button" class="link-button" onClick={() => navigate('package', group.packageId)}>
                  <Icon name="package" />
                  <strong>{group.name}</strong>
                </button>
                {group.pkg && <Badge tone={isManaged(group.pkg) ? 'managed' : 'unlocked'}>{group.pkg.ContainerOptions}</Badge>}
                {group.inProject && <Badge tone="info" title={`In this project: ${projectDir?.path}`}>In project</Badge>}
                <span class="muted">{plural(group.total, 'version')}</span>
                <span class="spacer" />
                {projectDir?.package && (
                  <Button small icon="add" onClick={() => openDrawer({ kind: 'createVersion', packageName: projectDir.package })}>
                    New version
                  </Button>
                )}
              </header>
            )}

            {group.groups.map((minor, index) => {
              const collapsed = isCollapsed(minor.key, index);
              const betas = minor.versions.filter(v => !v.IsReleased);
              const allBetasSelected = betas.length > 0 && betas.every(v => selected.has(v.SubscriberPackageVersionId));
              return (
                <div key={minor.key} class="minor-group">
                  <div class="minor-group-header">
                    <button
                      type="button"
                      class="group-toggle"
                      aria-expanded={collapsed ? 'false' : 'true'}
                      onClick={() => toggleGroup(minor.key, collapsed)}
                    >
                      <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} />
                      <strong>{minor.label}</strong>
                      <span class="muted">
                        {[minor.releasedCount && `${minor.releasedCount} released`, minor.betaCount && plural(minor.betaCount, 'beta')].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    {!collapsed && betas.length > 1 && (
                      <label class="toggle small" title="Select every beta in this group">
                        <input type="checkbox" checked={allBetasSelected} onChange={(e) => setGroupSelected(minor, (e.target as HTMLInputElement).checked)} />
                        Select betas
                      </label>
                    )}
                  </div>
                  {!collapsed && (
                    <table class="table versions-table">
                      <thead>
                        <tr>
                          <th class="col-select"><span class="sr-only">Select</span></th>
                          <th>Version</th>
                          <th>Status</th>
                          <th>Branch / tag</th>
                          <th>Created</th>
                          <th>Version ID</th>
                          <th class="col-actions"><span class="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {minor.versions.map(version => (
                          <VersionRow
                            key={version.SubscriberPackageVersionId}
                            version={version}
                            pkg={group.pkg}
                            targetOrg={targetOrg}
                            selected={selected.has(version.SubscriberPackageVersionId)}
                            onSelect={on => toggleSelected(version, on)}
                          />
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {group.hiddenBetas > 0 && (
              <div class="show-more">
                <Button small variant="ghost" icon="unfold" onClick={() => setShowAllBetasFor(new Set([...showAllBetasFor, group.packageId]))}>
                  Show {plural(group.hiddenBetas, 'older beta')}
                </Button>
              </div>
            )}
            {showAllBetasFor.has(group.packageId) && !filters.showAllBetas && (
              <div class="show-more">
                <Button small variant="ghost" icon="fold" onClick={() => {
                  const next = new Set(showAllBetasFor);
                  next.delete(group.packageId);
                  setShowAllBetasFor(next);
                }}>
                  Hide older betas
                </Button>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function VersionRow({ version, pkg, targetOrg, selected, onSelect }: {
  version: PackageVersion;
  pkg?: Package;
  targetOrg?: string;
  selected: boolean;
  onSelect: (on: boolean) => void;
}) {
  const label = versionLabel(version);
  const id = version.SubscriberPackageVersionId;
  const managed = isManaged(pkg);

  return (
    <tr class={selected ? 'selected' : ''}>
      <td class="col-select">
        {!version.IsReleased && (
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select ${label}`}
            onChange={(e) => onSelect((e.target as HTMLInputElement).checked)}
          />
        )}
      </td>
      <td>
        <div class="version-cell">
          <code class="version-number">{versionString(version)}</code>
          {version.Name && <span class="muted">{version.Name}</span>}
        </div>
      </td>
      <td>
        <div class="badges">
          <VersionStatusBadge released={version.IsReleased} />
          {version.IsPasswordProtected && <Badge icon="lock" title="Requires an installation key">Key</Badge>}
          {version.ValidationSkipped && <Badge tone="warning" title="Built with validation skipped: can’t be promoted">No validation</Badge>}
          {version.HasPassedCodeCoverageCheck === false && !version.ValidationSkipped && (
            <Badge tone="warning" title="Did not pass the code coverage check: can’t be promoted">Coverage</Badge>
          )}
        </div>
      </td>
      <td>
        <div class="badges">
          {version.Branch && <Badge icon="git-branch">{version.Branch}</Badge>}
          {version.Tag && <Badge icon="tag">{version.Tag}</Badge>}
          {!version.Branch && !version.Tag && <span class="muted">—</span>}
        </div>
      </td>
      <td><Timestamp value={version.CreatedDate} /></td>
      <td><CopyId value={id} label="version ID" /></td>
      <td class="col-actions">
        <div class="row-actions">
          {!version.IsReleased && (
            <ActionButton small icon="rocket" title="Promote to Released" action={{ kind: 'promoteVersion', versionId: id, label }}>
              Promote
            </ActionButton>
          )}
          <ActionButton
            small
            variant="ghost"
            icon="cloud-download"
            title={targetOrg ? `Install into ${targetOrg}` : 'Install into an org…'}
            action={{ kind: 'installVersion', versionId: id, label, pickOrg: !targetOrg }}
          />
          <Menu items={[
            { label: 'Copy version ID', icon: 'copy', onSelect: () => runAction({ kind: 'copy', text: id, label: 'version ID' }) },
            { label: 'Copy install URL', icon: 'link', onSelect: () => runAction({ kind: 'copy', text: version.InstallUrl || installUrl(id), label: 'install URL' }) },
            null,
            { label: 'Install into another org…', icon: 'cloud-download', onSelect: () => runAction({ kind: 'installVersion', versionId: id, label, pickOrg: true }) },
            { label: 'Test in a new scratch org', icon: 'vm', onSelect: () => runAction({ kind: 'testInScratchOrg', versionId: id }) },
            null,
            { label: 'Details', icon: 'info', onSelect: () => runAction({ kind: 'versionDetails', versionId: id }) },
            { label: 'Ancestry', icon: 'type-hierarchy', hidden: !managed, onSelect: () => runAction({ kind: 'versionAncestry', versionId: id }) },
            { label: 'Dependencies', icon: 'references', onSelect: () => runAction({ kind: 'versionDependencies', versionId: id }) },
            { label: 'Compare with…', icon: 'git-compare', onSelect: () => runAction({ kind: 'compareVersion', versionId: id }) },
            null,
            { label: 'Delete', icon: 'trash', danger: true, hidden: version.IsReleased, onSelect: () => runAction({ kind: 'deleteVersions', versions: [{ versionId: id, label }] }) }
          ]} />
        </div>
      </td>
    </tr>
  );
}
