/**
 * Small UI building blocks styled with VS Code theme variables (see dashboard.css).
 */
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type { DashboardAction, ResourceState } from '../../shared/protocol';
import { runAction } from './api';
import { absoluteTime, relativeTime } from './format';
import { HELP, HelpKey } from './help';

export function Icon({ name, spin, title }: { name: string; spin?: boolean; title?: string }) {
  return (
    <i
      class={`codicon codicon-${name}${spin ? ' codicon-modifier-spin' : ''}`}
      aria-hidden={title ? undefined : 'true'}
      title={title}
    />
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span class="spinner" role="status">
      <Icon name="loading" spin />
      {label && <span>{label}</span>}
    </span>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  variant?: ButtonVariant;
  icon?: string;
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  onClick?: (event: MouseEvent) => void;
  children?: ComponentChildren;
}

export function Button({ variant = 'secondary', icon, busy, disabled, small, title, type = 'button', onClick, children }: ButtonProps) {
  const iconOnly = !children;
  return (
    <button
      type={type}
      class={`btn btn-${variant}${small ? ' btn-sm' : ''}${iconOnly ? ' btn-icon' : ''}${busy ? ' is-busy' : ''}`}
      disabled={disabled || busy}
      title={title}
      aria-label={iconOnly ? title : undefined}
      aria-busy={busy ? 'true' : undefined}
      onClick={onClick}
    >
      {busy ? <Icon name="loading" spin /> : icon && <Icon name={icon} />}
      {children && <span>{children}</span>}
    </button>
  );
}

/** Button that runs a host action and shows a spinner until it finishes. */
export function ActionButton({ action, onDone, ...props }: Omit<ButtonProps, 'busy' | 'onClick'> & {
  action: DashboardAction | (() => DashboardAction);
  onDone?: (ok: boolean, result?: string) => void;
}) {
  const [busy, run] = useAction();
  return (
    <Button
      {...props}
      busy={busy}
      onClick={async () => {
        const result = await run(typeof action === 'function' ? action() : action);
        onDone?.(result.ok, result.result);
      }}
    />
  );
}

/** [busy, run]: run an action and track whether it is in progress. */
export function useAction(): [boolean, (action: DashboardAction) => Promise<{ ok: boolean; result?: string }>] {
  const [busy, setBusy] = useState(false);
  const run = async (action: DashboardAction) => {
    setBusy(true);
    try {
      return await runAction(action);
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

type BadgeTone = 'released' | 'beta' | 'managed' | 'unlocked' | 'neutral' | 'info' | 'warning' | 'danger';

export function Badge({ tone = 'neutral', title, icon, children }: { tone?: BadgeTone; title?: string; icon?: string; children: ComponentChildren }) {
  return (
    <span class={`badge badge-${tone}`} title={title}>
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}

export function VersionStatusBadge({ released }: { released: boolean }) {
  return released
    ? <Badge tone="released" icon="verified" title="Released: installable in any org">Released</Badge>
    : <Badge tone="beta" icon="beaker" title={HELP.betaVersions.text}>Beta</Badge>;
}

export function PackageTypeBadge({ pkg }: { pkg: { ContainerOptions: string } }) {
  return pkg.ContainerOptions === 'Managed'
    ? <Badge tone="managed" title="Managed package">Managed</Badge>
    : <Badge tone="unlocked" title="Unlocked package">Unlocked</Badge>;
}

export function Timestamp({ value }: { value: string | number | undefined }) {
  return <time title={absoluteTime(value)}>{relativeTime(value)}</time>;
}

/** Monospace ID with a copy button. */
export function CopyId({ value, label }: { value: string | undefined; label: string }) {
  if (!value) {
    return <span class="muted">—</span>;
  }
  return (
    <span class="copy-id">
      <code>{value}</code>
      <button
        type="button"
        class="icon-link"
        title={`Copy ${label}`}
        aria-label={`Copy ${label}`}
        onClick={() => runAction({ kind: 'copy', text: value, label })}
      >
        <Icon name="copy" />
      </button>
    </span>
  );
}

export function EmptyState({ icon = 'info', title, children, actions }: {
  icon?: string;
  title: string;
  children?: ComponentChildren;
  actions?: ComponentChildren;
}) {
  return (
    <div class="empty-state">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div class="empty-actions">{actions}</div>}
    </div>
  );
}

export function Callout({ tone = 'info', icon, children, actions }: {
  tone?: 'info' | 'warning' | 'error';
  icon?: string;
  children: ComponentChildren;
  actions?: ComponentChildren;
}) {
  const defaultIcon = tone === 'error' ? 'error' : tone === 'warning' ? 'warning' : 'info';
  return (
    <div class={`callout callout-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon name={icon || defaultIcon} />
      <div class="callout-body">{children}</div>
      {actions && <div class="callout-actions">{actions}</div>}
    </div>
  );
}

/**
 * Shows a spinner while the first load is running, an error with Retry when
 * loading failed, and an "out of date" notice for stale data. Renders children
 * once data is available (including while a refresh is in progress).
 */
export function ResourceGate({ states, onRetry, loadingLabel, children }: {
  states: ResourceState[];
  onRetry: () => void;
  loadingLabel?: string;
  children: () => ComponentChildren;
}) {
  const hasAllData = states.every(s => s.data !== undefined);
  const error = states.find(s => s.status === 'error');
  const stale = states.some(s => s.stale);

  if (!hasAllData) {
    if (error) {
      return (
        <Callout tone="error" actions={<>
          <Button small icon="refresh" onClick={onRetry}>Retry</Button>
          <Button small variant="ghost" onClick={() => runAction({ kind: 'showOutput' })}>Show Output</Button>
        </>}>
          {error.error}
        </Callout>
      );
    }
    return <div class="loading-block"><Spinner label={loadingLabel || 'Loading from Salesforce…'} /></div>;
  }

  return (
    <>
      {error && (
        <Callout tone="error" actions={<Button small icon="refresh" onClick={onRetry}>Retry</Button>}>
          Couldn’t refresh: {error.error} Showing the last loaded data.
        </Callout>
      )}
      {stale && !error && (
        <Callout tone="warning" icon="history" actions={<Button small icon="refresh" onClick={onRetry}>Refresh</Button>}>
          This data changed in Salesforce since it was loaded.
        </Callout>
      )}
      {children()}
    </>
  );
}

export interface MenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  onSelect: () => void;
}

/** "⋯" button with a dropdown menu. Use `null` entries for separators. */
export function Menu({ items, label = 'More actions', icon = 'ellipsis' }: { items: (MenuItem | null)[]; label?: string; icon?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !ref.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  // Drop hidden items, and separators at the ends or next to each other
  const visible = items
    .filter(item => item === null || !item.hidden)
    .filter((item, index, list) => item !== null || (index > 0 && index < list.length - 1 && list[index - 1] !== null));

  return (
    <div class="menu" ref={ref}>
      <button
        type="button"
        class="btn btn-ghost btn-sm btn-icon"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen(!open)}
      >
        <Icon name={icon} />
      </button>
      {open && (
        <div class="menu-list" role="menu">
          {visible.map((item, index) => item === null
            ? <div key={`sep-${index}`} class="menu-separator" role="separator" />
            : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                class={`menu-item${item.danger ? ' danger' : ''}`}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
              >
                <Icon name={item.icon || 'blank'} />
                <span>{item.label}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/** Slide-in panel for forms. */
export function Drawer({ title, subtitle, onClose, children, footer }: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) { onClose(); } }}>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header class="drawer-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p class="muted">{subtitle}</p>}
          </div>
          <Button variant="ghost" icon="close" title="Close" onClick={onClose} />
        </header>
        <div class="drawer-body">{children}</div>
        {footer && <footer class="drawer-footer">{footer}</footer>}
      </aside>
    </div>
  );
}

export function HelpText({ help }: { help?: HelpKey }) {
  if (!help) {
    return null;
  }
  const entry = HELP[help] as { text: string; link?: string };
  return (
    <span class="hint">
      {entry.text}
      {entry.link && <> <a href={entry.link}>Learn more</a></>}
    </span>
  );
}

export function Field({ label, help, hint, children, full }: {
  label: string;
  help?: HelpKey;
  hint?: ComponentChildren;
  children: ComponentChildren;
  full?: boolean;
}) {
  return (
    <label class={`field${full ? ' full' : ''}`}>
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="hint">{hint}</span>}
      <HelpText help={help} />
    </label>
  );
}

export function Checkbox({ label, checked, onChange, help, disabled }: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: HelpKey;
  disabled?: boolean;
}) {
  return (
    <div class={`checkbox${disabled ? ' disabled' : ''}`}>
      <label>
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange((e.target as HTMLInputElement).checked)}
        />
        <span>{label}</span>
      </label>
      <HelpText help={help} />
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div class="segmented" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value ? 'true' : 'false'}
          class={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SearchBox({ value, onInput, placeholder }: { value: string; onInput: (value: string) => void; placeholder: string }) {
  return (
    <div class="search-box">
      <Icon name="search" />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onInput={(e) => onInput((e.target as HTMLInputElement).value)}
      />
    </div>
  );
}

export function Card({ title, icon, actions, children, class: className }: {
  title?: ComponentChildren;
  icon?: string;
  actions?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
}) {
  return (
    <section class={`card${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header class="card-header">
          <h2>{icon && <Icon name={icon} />}{title}</h2>
          {actions && <div class="card-actions">{actions}</div>}
        </header>
      )}
      <div class="card-body">{children}</div>
    </section>
  );
}

export type InputEvent = JSX.TargetedEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, Event>;

/** Read the value from an input/select/textarea event. */
export function valueOf(event: InputEvent): string {
  return event.currentTarget.value;
}
