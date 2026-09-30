import { useState } from 'preact/hooks';
import type { ScratchOrgForm } from '../../../shared/protocol';
import { runAction } from '../api';
import { useApp } from '../state';
import { Button, Checkbox, Field } from '../ui';
import { FormDrawer } from './FormDrawer';

export function ScratchOrgDrawer({ onClose }: { onClose: () => void }) {
  const { host } = useApp();
  const files = host.context?.definitionFiles || [];

  const [definitionFile, setDefinitionFile] = useState(files.find(f => f.endsWith('project-scratch-def.json')) || files[0] || '');
  const [extraFiles, setExtraFiles] = useState<string[]>([]);
  const [alias, setAlias] = useState('');
  const [durationDays, setDurationDays] = useState(7);
  const [wait, setWait] = useState('10');
  const [setDefault, setSetDefault] = useState(true);
  const [noAncestors, setNoAncestors] = useState(false);
  const [noNamespace, setNoNamespace] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [description, setDescription] = useState('');
  const [preview, setPreview] = useState('');

  const form = (): ScratchOrgForm => ({
    definitionFile,
    alias,
    durationDays,
    wait: parseInt(wait, 10) || 10,
    setDefault,
    noAncestors,
    noNamespace,
    adminEmail: adminEmail || undefined,
    description: description || undefined
  });

  const allFiles = [...files, ...extraFiles.filter(f => !files.includes(f))];

  return (
    <FormDrawer
      title="New scratch org"
      subtitle={`Created from ${host.context?.devHub || 'your Dev Hub'}.`}
      submitLabel="Create scratch org"
      submitIcon="add"
      onClose={onClose}
      buildAction={() => {
        if (!definitionFile) {
          return 'Choose a definition file.';
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(alias)) {
          return 'Enter an alias using letters, numbers, hyphens or underscores.';
        }
        return { kind: 'createScratchOrg', data: form() };
      }}
      extraFooter={
        <Button variant="ghost" icon="terminal" onClick={async () => {
          const result = await runAction({ kind: 'previewScratchOrg', data: form() });
          setPreview(result.result || '');
        }}>
          Preview command
        </Button>
      }
    >
      <Field label="Definition file" help="definitionFile" full>
        <div class="input-row">
          <select value={definitionFile} onChange={(e) => setDefinitionFile((e.target as HTMLSelectElement).value)}>
            {allFiles.length === 0 && <option value="">No definition files found</option>}
            {allFiles.map(file => <option key={file} value={file}>{file}</option>)}
          </select>
          <Button icon="folder-opened" title="Browse for a definition file" onClick={async () => {
            const result = await runAction({ kind: 'browseDefinitionFile' });
            if (result.ok && result.result) {
              setExtraFiles([...extraFiles, result.result]);
              setDefinitionFile(result.result);
            }
          }} />
        </div>
      </Field>
      <Field label="Alias">
        <input type="text" value={alias} placeholder="feature-x" required onInput={(e) => setAlias((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Duration" help="duration">
        <select value={String(durationDays)} onChange={(e) => setDurationDays(parseInt((e.target as HTMLSelectElement).value, 10))}>
          <option value="1">1 day</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </select>
      </Field>
      <div class="field full">
        <Checkbox label="Set as the Salesforce CLI default org" checked={setDefault} onChange={setSetDefault} help="setDefault" />
        <Checkbox label="No ancestors" checked={noAncestors} onChange={setNoAncestors} help="noAncestors" />
        <Checkbox label="No namespace" checked={noNamespace} onChange={setNoNamespace} help="scratchNoNamespace" />
      </div>
      <Field label="Admin email (optional)">
        <input type="email" value={adminEmail} onInput={(e) => setAdminEmail((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Description (optional)">
        <input type="text" value={description} onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Wait (minutes)" help="waitTime">
        <input type="number" min={1} max={120} value={wait} onInput={(e) => setWait((e.target as HTMLInputElement).value)} />
      </Field>
      {preview && <pre class="command-preview full">{preview}</pre>}
    </FormDrawer>
  );
}
