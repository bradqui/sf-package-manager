import { useState } from 'preact/hooks';
import type { ScratchDefForm } from '../../../shared/protocol';
import { Checkbox, Field, HelpText } from '../ui';
import { FormDrawer } from './FormDrawer';

const FEATURES = [
  'API', 'AuthorApex', 'DebugApex', 'Communities', 'ContactsToMultipleAccounts', 'EnableSetPasswordInApi',
  'Knowledge', 'LiveAgent', 'MultiCurrency', 'PersonAccounts', 'ServiceCloud', 'Sites'
];

export function ScratchDefDrawer({ onClose }: { onClose: () => void }) {
  const [orgName, setOrgName] = useState('');
  const [edition, setEdition] = useState<ScratchDefForm['edition']>('Developer');
  const [features, setFeatures] = useState<string[]>(['API', 'AuthorApex', 'DebugApex']);
  const [lightning, setLightning] = useState(true);

  const toggleFeature = (feature: string, on: boolean) =>
    setFeatures(on ? [...features, feature] : features.filter(f => f !== feature));

  return (
    <FormDrawer
      title="New definition file"
      subtitle="Writes config/project-scratch-def.json (you’ll be asked before an existing file is replaced)."
      submitLabel="Create file"
      submitIcon="new-file"
      onClose={onClose}
      buildAction={() => ({
        kind: 'generateScratchDef',
        data: { orgName: orgName || undefined, edition, features, enableLightningExperience: lightning }
      })}
    >
      <Field label="Org name (optional)">
        <input type="text" value={orgName} placeholder="My Scratch Org" onInput={(e) => setOrgName((e.target as HTMLInputElement).value)} />
      </Field>
      <Field label="Edition">
        <select value={edition} onChange={(e) => setEdition((e.target as HTMLSelectElement).value as ScratchDefForm['edition'])}>
          <option value="Developer">Developer</option>
          <option value="Enterprise">Enterprise</option>
          <option value="Group">Group</option>
          <option value="Professional">Professional</option>
        </select>
      </Field>
      <fieldset class="field full">
        <legend class="field-label">Features</legend>
        <HelpText help="features" />
        <div class="checkbox-grid">
          {FEATURES.map(feature => (
            <Checkbox key={feature} label={feature} checked={features.includes(feature)} onChange={on => toggleFeature(feature, on)} />
          ))}
        </div>
      </fieldset>
      <div class="field full">
        <Checkbox label="Enable Lightning Experience" checked={lightning} onChange={setLightning} />
      </div>
    </FormDrawer>
  );
}
