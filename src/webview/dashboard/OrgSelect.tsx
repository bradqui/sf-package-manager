import { useState } from 'preact/hooks';
import type { OrgInfo, SettingSource } from '../../shared/protocol';
import { runAction } from './api';
import { useApp } from './state';
import { Icon } from './ui';

const SOURCE_LABELS: Record<SettingSource, string> = {
  workspace: 'Saved for this workspace',
  user: 'From your user settings',
  'sf-cli': 'From the Salesforce CLI config (target-dev-hub / target-org)',
  none: 'Not set'
};

/**
 * Dropdown to choose the Dev Hub or target org. Changing it saves the setting
 * for this workspace; the dashboard reloads the affected data.
 */
export function OrgSelect({ kind, compact }: { kind: 'devHub' | 'targetOrg'; compact?: boolean }) {
  const { host } = useApp();
  const [saving, setSaving] = useState(false);
  const context = host.context;
  const orgsState = host.resources.orgs;

  const current = kind === 'devHub' ? context?.devHub || '' : context?.targetOrg || '';
  const source = kind === 'devHub' ? context?.devHubSource : context?.targetOrgSource;
  const label = kind === 'devHub' ? 'Dev Hub' : 'Target org';

  const allOrgs = orgsState.data || [];
  const orgs = kind === 'devHub' ? allOrgs.filter(o => o.isDevHub) : allOrgs;
  const matches = (org: OrgInfo) => org.alias === current || org.username === current;
  const currentKnown = !current || orgs.some(matches);

  const describe = (org: OrgInfo) => {
    const name = org.alias ? `${org.alias} (${org.username})` : org.username;
    return org.isScratch ? `${name} · scratch` : name;
  };

  const onChange = async (value: string) => {
    if (!value || value === current) {
      return;
    }
    setSaving(true);
    try {
      await runAction(kind === 'devHub' ? { kind: 'setDevHub', value } : { kind: 'setTargetOrg', value });
    } finally {
      setSaving(false);
    }
  };

  const title = `${label}: ${current || 'none'}\n${source ? SOURCE_LABELS[source] : ''}`;

  return (
    <label class={`org-select${compact ? ' compact' : ''}`} title={title}>
      <span class="org-select-label">
        <Icon name={kind === 'devHub' ? 'server-environment' : 'target'} />
        {label}
      </span>
      <span class="org-select-control">
        <select
          value={current && currentKnown ? orgs.find(matches)?.alias || orgs.find(matches)?.username || current : current}
          disabled={saving}
          aria-label={label}
          onChange={(e) => onChange((e.target as HTMLSelectElement).value)}
        >
          {!current && <option value="">{orgsState.status === 'loading' ? 'Loading orgs…' : `Select a ${label.toLowerCase()}…`}</option>}
          {current && !currentKnown && <option value={current}>{current}{orgsState.data ? ' (not authorized)' : ''}</option>}
          {orgs.map(org => (
            <option key={org.username} value={org.alias || org.username}>{describe(org)}</option>
          ))}
        </select>
        {saving && <Icon name="loading" spin />}
      </span>
      {!compact && source && <span class="hint">{SOURCE_LABELS[source]}</span>}
    </label>
  );
}
