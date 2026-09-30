import { useState } from 'preact/hooks';
import { useApp } from '../state';
import { Checkbox, Field, Segmented } from '../ui';
import { FormDrawer } from './FormDrawer';

export function CreatePackageDrawer({ onClose }: { onClose: () => void }) {
  const { host } = useApp();
  const dirs = host.context?.project?.packageDirectories || [];
  const [name, setName] = useState('');
  const [packageType, setPackageType] = useState<'Unlocked' | 'Managed'>('Unlocked');
  const [path, setPath] = useState(dirs.find(d => !d.packageId)?.path || dirs[0]?.path || 'force-app');
  const [description, setDescription] = useState('');
  const [noNamespace, setNoNamespace] = useState(false);
  const [orgDependent, setOrgDependent] = useState(false);

  return (
    <FormDrawer
      title="New package"
      subtitle={`Created in ${host.context?.devHub || 'your Dev Hub'}. sfdx-project.json gets a package alias for it.`}
      submitLabel="Create package"
      submitIcon="add"
      onClose={onClose}
      buildAction={() => name.trim()
        ? { kind: 'createPackage', data: { name: name.trim(), packageType, path, description, noNamespace, orgDependent } }
        : 'Enter a package name.'}
    >
      <Field label="Name">
        <input type="text" value={name} required placeholder="My Package" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Type" help="packageType">
        <Segmented
          label="Package type"
          value={packageType}
          onChange={setPackageType}
          options={[{ value: 'Unlocked', label: 'Unlocked' }, { value: 'Managed', label: 'Managed' }]}
        />
      </Field>
      <Field label="Package directory" help="packagePath">
        {dirs.length > 0
          ? (
            <select value={path} onChange={(e) => setPath((e.target as HTMLSelectElement).value)}>
              {dirs.map(d => (
                <option key={d.path} value={d.path}>{d.path}{d.package ? ` (used by ${d.package})` : ''}</option>
              ))}
            </select>
          )
          : <input type="text" value={path} onInput={(e) => setPath((e.target as HTMLInputElement).value)} />}
      </Field>
      <Field label="Description (optional)" full>
        <textarea rows={2} value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
      </Field>
      {packageType === 'Unlocked' && (
        <div class="field full">
          <Checkbox label="No namespace" checked={noNamespace} onChange={setNoNamespace} help="noNamespace" />
          <Checkbox label="Org dependent" checked={orgDependent} onChange={setOrgDependent} help="orgDependent" />
        </div>
      )}
    </FormDrawer>
  );
}
