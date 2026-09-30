import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { DashboardAction } from '../../../shared/protocol';
import { Button, Drawer, useAction } from '../ui';

/**
 * Drawer containing a form. Submitting runs the action; the drawer closes when
 * it succeeds and stays open (keeping the input) when it fails or is cancelled.
 */
export function FormDrawer({ title, subtitle, submitLabel, submitIcon, onClose, buildAction, children, extraFooter }: {
  title: string;
  subtitle?: string;
  submitLabel: string;
  submitIcon?: string;
  onClose: () => void;
  /** Return the action to run, or a string describing what is missing. */
  buildAction: () => DashboardAction | string;
  children: ComponentChildren;
  extraFooter?: ComponentChildren;
}) {
  const [busy, run] = useAction();
  const [error, setError] = useState('');

  const submit = async (event: Event) => {
    event.preventDefault();
    const action = buildAction();
    if (typeof action === 'string') {
      setError(action);
      return;
    }
    setError('');
    const result = await run(action);
    if (result.ok) {
      onClose();
    }
  };

  return (
    <Drawer
      title={title}
      subtitle={subtitle}
      onClose={() => { if (!busy) { onClose(); } }}
      footer={
        <>
          <span class="form-error" role="alert">{error}</span>
          {extraFooter}
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" icon={submitIcon} busy={busy} onClick={submit}>{submitLabel}</Button>
        </>
      }
    >
      <form class="form-grid" onSubmit={submit}>
        {children}
      </form>
    </Drawer>
  );
}
