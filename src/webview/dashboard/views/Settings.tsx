import { useEffect, useState } from 'preact/hooks';
import type { SettingKey } from '../../../shared/protocol';
import { runAction } from '../api';
import { OrgSelect } from '../OrgSelect';
import { useApp } from '../state';
import { Button, Card, HelpText } from '../ui';
import type { HelpKey } from '../help';

export function SettingsView() {
  const { host } = useApp();
  const context = host.context!;
  const settings = context.settings;

  return (
    <div class="view narrow">
      <header class="view-header">
        <div>
          <h1>Settings</h1>
          <p class="muted">Changes are saved immediately.</p>
        </div>
      </header>

      <Card title="Orgs" icon="organization">
        <p class="muted">
          Org choices are saved for this workspace. When none is saved, the Salesforce CLI’s own defaults
          (<code>target-dev-hub</code> and <code>target-org</code>) are used.
        </p>
        <div class="form-grid">
          <OrgSelect kind="devHub" />
          <OrgSelect kind="targetOrg" />
        </div>
      </Card>

      <Card title="Behavior" icon="settings">
        <Toggle setting="autoRefresh" label="Refresh automatically after changes" value={settings.autoRefresh} />
        <Toggle setting="showCommandPreview" label="Preview CLI commands before running (sidebar and command palette)" value={settings.showCommandPreview} />
        <NumberSetting setting="defaultWaitTime" label="Default wait time (minutes)" value={settings.defaultWaitTime} min={0} max={120} />
      </Card>

      <Card title="Logging" icon="output">
        <Toggle setting="verboseOutput" label="Log full CLI responses" value={settings.verboseOutput} />
        <div class="button-row">
          <Button icon="output" onClick={() => runAction({ kind: 'showOutput' })}>Show output log</Button>
          <Button icon="settings-gear" onClick={() => runAction({ kind: 'openSettings' })}>Open VS Code settings</Button>
        </div>
      </Card>

      <p class="muted about">SF Package Manager {context.extensionVersion}</p>
    </div>
  );
}

function Toggle({ setting, label, value }: { setting: SettingKey; label: string; value: boolean }) {
  const [saving, setSaving] = useState(false);
  return (
    <div class="setting-row">
      <label class="toggle">
        <input
          type="checkbox"
          checked={value}
          disabled={saving}
          onChange={async (e) => {
            setSaving(true);
            try {
              await runAction({ kind: 'updateSetting', key: setting, value: (e.target as HTMLInputElement).checked });
            } finally {
              setSaving(false);
            }
          }}
        />
        <span>{label}</span>
      </label>
      <HelpText help={setting as HelpKey} />
    </div>
  );
}

function NumberSetting({ setting, label, value, min, max }: { setting: SettingKey; label: string; value: number; min: number; max: number }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const save = () => {
    const number = parseInt(draft, 10);
    if (Number.isFinite(number) && number >= min && number <= max && number !== value) {
      runAction({ kind: 'updateSetting', key: setting, value: number });
    } else {
      setDraft(String(value));
    }
  };

  return (
    <div class="setting-row">
      <label class="field inline">
        <span class="field-label">{label}</span>
        <input
          type="number"
          min={min}
          max={max}
          value={draft}
          onInput={(e) => setDraft((e.target as HTMLInputElement).value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') { save(); } }}
        />
      </label>
      <HelpText help={setting as HelpKey} />
    </div>
  );
}
