import { useMemo, useState } from 'preact/hooks';
import { sortVersionsDesc, versionString } from '../../../shared/versions';
import { useApp } from '../state';
import { Field } from '../ui';
import { FormDrawer } from './FormDrawer';

export function InstallDrawer({ versionId: initialVersionId, onClose }: { versionId?: string; onClose: () => void }) {
  const { host } = useApp();
  const context = host.context!;
  const orgs = host.resources.orgs.data || [];
  const versions = host.resources.versions.data || [];
  const packages = host.resources.packages.data || [];

  const [versionId, setVersionId] = useState(initialVersionId || '');
  const [targetOrg, setTargetOrg] = useState('');
  const [installationKey, setInstallationKey] = useState('');
  const [securityType, setSecurityType] = useState<'' | 'AdminsOnly' | 'AllUsers'>('');
  const [wait, setWait] = useState(String(context.settings.defaultWaitTime));

  // Versions from this Dev Hub, grouped by package, newest first
  const grouped = useMemo(() => packages
    .map(pkg => ({ pkg, versions: sortVersionsDesc(versions.filter(v => v.Package2Id === pkg.Id)).slice(0, 25) }))
    .filter(group => group.versions.length > 0), [packages, versions]);

  const selectedVersion = versions.find(v => v.SubscriberPackageVersionId === versionId);

  return (
    <FormDrawer
      title="Install package"
      subtitle="Install a package version into an org."
      submitLabel="Install"
      submitIcon="cloud-download"
      onClose={onClose}
      buildAction={() => {
        if (!versionId.trim().startsWith('04t')) {
          return 'Enter or choose a package version ID (starts with 04t).';
        }
        if (!targetOrg && !context.targetOrg) {
          return 'Choose the org to install into.';
        }
        const waitMinutes = parseInt(wait, 10);
        return {
          kind: 'installPackage',
          data: {
            versionId: versionId.trim(),
            targetOrg: targetOrg || undefined,
            installationKey: installationKey || undefined,
            securityType: securityType || undefined,
            wait: Number.isFinite(waitMinutes) ? waitMinutes : context.settings.defaultWaitTime
          }
        };
      }}
    >
      {grouped.length > 0 && (
        <Field label="Your versions" full hint="Newest 25 per package. Or paste any version ID below.">
          <select value={selectedVersion ? versionId : ''} onChange={(e) => setVersionId((e.target as HTMLSelectElement).value)}>
            <option value="">Choose a version…</option>
            {grouped.map(group => (
              <optgroup key={group.pkg.Id} label={group.pkg.Name}>
                {group.versions.map(v => (
                  <option key={v.SubscriberPackageVersionId} value={v.SubscriberPackageVersionId}>
                    {versionString(v)} {v.IsReleased ? '(released)' : '(beta)'}{v.Name ? ` · ${v.Name}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Field>
      )}
      <Field label="Package version ID" full>
        <input type="text" value={versionId} placeholder="04t…" onInput={(e) => setVersionId((e.target as HTMLInputElement).value)} />
      </Field>
      {selectedVersion && !selectedVersion.IsReleased && (
        <p class="hint full">This is a beta version: it can only be installed in scratch orgs and sandboxes.</p>
      )}
      <Field label="Install into" help="installTarget">
        <select value={targetOrg} onChange={(e) => setTargetOrg((e.target as HTMLSelectElement).value)}>
          <option value="">{context.targetOrg ? `Target org (${context.targetOrg})` : 'Choose an org…'}</option>
          {orgs.map(org => (
            <option key={org.username} value={org.alias || org.username}>
              {org.alias ? `${org.alias} (${org.username})` : org.username}{org.isScratch ? ' · scratch' : ''}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Installation key (if required)" help="installationKey">
        <input type="password" value={installationKey} autoComplete="new-password" onInput={(e) => setInstallationKey((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Access" help="securityType">
        <select value={securityType} onChange={(e) => setSecurityType((e.target as HTMLSelectElement).value as typeof securityType)}>
          <option value="">Default (admins only)</option>
          <option value="AdminsOnly">Admins only</option>
          <option value="AllUsers">All users</option>
        </select>
      </Field>
      <Field label="Wait (minutes)" help="waitTime">
        <input type="number" min={0} max={120} value={wait} onInput={(e) => setWait((e.target as HTMLInputElement).value)} />
      </Field>
    </FormDrawer>
  );
}
