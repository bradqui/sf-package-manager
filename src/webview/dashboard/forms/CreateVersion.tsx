import { useMemo, useState } from 'preact/hooks';
import { summarizeVersions, versionString } from '../../../shared/versions';
import { useApp } from '../state';
import { Callout, Checkbox, Field, Segmented } from '../ui';
import { FormDrawer } from './FormDrawer';

export function CreateVersionDrawer({ packageName, onClose }: { packageName?: string; onClose: () => void }) {
  const { host } = useApp();
  const context = host.context!;
  const dirs = (context.project?.packageDirectories || []).filter(d => d.package);
  const packages = host.resources.packages.data || [];

  const [pkgName, setPkgName] = useState(packageName || dirs.find(d => d.default)?.package || dirs[0]?.package || '');
  const dir = dirs.find(d => d.package === pkgName);
  const pkg = packages.find(p => p.Id === dir?.packageId);
  const managed = pkg?.ContainerOptions === 'Managed';

  const [versionNumber, setVersionNumber] = useState('');
  const [versionName, setVersionName] = useState('');
  const [description, setDescription] = useState('');
  const [keyMode, setKeyMode] = useState<'none' | 'key'>('none');
  const [installationKey, setInstallationKey] = useState('');
  const [codeCoverage, setCodeCoverage] = useState(true);
  const [skipValidation, setSkipValidation] = useState(false);
  const [asyncValidation, setAsyncValidation] = useState(false);
  const [skipAncestorCheck, setSkipAncestorCheck] = useState(false);
  const [branch, setBranch] = useState('');
  const [tag, setTag] = useState('');
  const [wait, setWait] = useState(String(context.settings.defaultWaitTime));

  const latest = useMemo(() => {
    const versions = (host.resources.versions.data || []).filter(v => v.Package2Id === dir?.packageId);
    return summarizeVersions(versions);
  }, [host.resources.versions.data, dir?.packageId]);

  if (dirs.length === 0) {
    return (
      <FormDrawer title="New version" submitLabel="Create version" onClose={onClose} buildAction={() => 'No packages in this project.'}>
        <Callout tone="warning">
          None of the package directories in sfdx-project.json has a package yet. Create a package first.
        </Callout>
      </FormDrawer>
    );
  }

  const buildAction = () => {
    if (!pkgName) {
      return 'Choose a package.';
    }
    if (keyMode === 'key' && !installationKey) {
      return 'Enter an installation key, or choose "No key".';
    }
    if (versionNumber && !/^\d+\.\d+\.\d+\.(NEXT|\d+)$/.test(versionNumber)) {
      return 'Version number must look like 1.2.0.NEXT or 1.2.0.4.';
    }
    const waitMinutes = parseInt(wait, 10);
    return {
      kind: 'createVersion' as const,
      data: {
        package: pkgName,
        versionNumber: versionNumber || undefined,
        versionName: versionName || undefined,
        versionDescription: description || undefined,
        installationKeyBypass: keyMode === 'none',
        installationKey: keyMode === 'key' ? installationKey : undefined,
        codeCoverage: !skipValidation && codeCoverage,
        skipValidation,
        asyncValidation: !skipValidation && asyncValidation,
        skipAncestorCheck: managed && skipAncestorCheck,
        branch: branch || undefined,
        tag: tag || undefined,
        wait: Number.isFinite(waitMinutes) ? waitMinutes : context.settings.defaultWaitTime
      }
    };
  };

  const ancestor = dir?.ancestorVersion || dir?.ancestorId;

  return (
    <FormDrawer
      title="New version"
      subtitle="Builds an installable version from the package directory’s current source."
      submitLabel="Create version"
      submitIcon="add"
      onClose={onClose}
      buildAction={buildAction}
    >
      <Field label="Package" hint={dir ? `Built from ${dir.path}` : undefined}>
        <select value={pkgName} onChange={(e) => setPkgName((e.target as HTMLSelectElement).value)}>
          {dirs.map(d => <option key={d.package} value={d.package}>{d.package}</option>)}
        </select>
      </Field>
      <Field
        label="Version number"
        help="versionNumber"
        hint={latest.latestReleased || latest.latestBeta
          ? `Latest: ${[latest.latestReleased && `${versionString(latest.latestReleased)} released`, latest.latestBeta && `${versionString(latest.latestBeta)} beta`].filter(Boolean).join(', ')}`
          : undefined}
      >
        <input type="text" value={versionNumber} placeholder={dir?.versionNumber || '1.0.0.NEXT'} onInput={(e) => setVersionNumber((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Version name (optional)">
        <input type="text" value={versionName} placeholder={dir?.versionName || 'e.g. Spring Release'} onInput={(e) => setVersionName((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Description (optional)">
        <input type="text" value={description} onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />
      </Field>

      <Field label="Installation key" help="installationKey" full>
        <Segmented
          label="Installation key"
          value={keyMode}
          onChange={setKeyMode}
          options={[{ value: 'none', label: 'No key' }, { value: 'key', label: 'Require a key' }]}
        />
        {keyMode === 'key' && (
          <input type="password" value={installationKey} placeholder="Installation key" autoComplete="new-password" onInput={(e) => setInstallationKey((e.target as HTMLInputElement).value)} />
        )}
      </Field>

      <fieldset class="field full">
        <legend class="field-label">Validation</legend>
        <Checkbox label="Calculate code coverage" checked={codeCoverage && !skipValidation} disabled={skipValidation} onChange={setCodeCoverage} help="codeCoverage" />
        <Checkbox label="Skip validation" checked={skipValidation} onChange={setSkipValidation} help="skipValidation" />
        <Checkbox label="Validate asynchronously" checked={asyncValidation && !skipValidation} disabled={skipValidation} onChange={setAsyncValidation} help="asyncValidation" />
        {managed && (
          <Checkbox label="Skip ancestor check" checked={skipAncestorCheck} onChange={setSkipAncestorCheck} help="skipAncestorCheck" />
        )}
        {!codeCoverage && !skipValidation && (
          <Callout tone="warning">Without code coverage this version can’t be promoted to Released.</Callout>
        )}
      </fieldset>

      {managed && (
        <p class="hint full">
          Ancestor: {ancestor ? <code>{ancestor}</code> : 'highest released version (default)'} — set by ancestorVersion/ancestorId in sfdx-project.json.
        </p>
      )}

      <Field label="Branch (optional)" help="branch">
        <input type="text" value={branch} onInput={(e) => setBranch((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Tag (optional)" help="tag">
        <input type="text" value={tag} onInput={(e) => setTag((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Wait (minutes)" help="waitTime">
        <input type="number" min={0} max={120} value={wait} onInput={(e) => setWait((e.target as HTMLInputElement).value)} />
      </Field>
    </FormDrawer>
  );
}
