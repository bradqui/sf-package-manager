import { parseSalesforceDate } from '../../shared/versions';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 days ago", "in 2 days", or a date for older values. */
export function relativeTime(value: string | number | undefined, now = Date.now()): string {
  const time = typeof value === 'number' ? value : parseSalesforceDate(value);
  if (!Number.isFinite(time)) {
    return '—';
  }
  const diff = time - now;
  const abs = Math.abs(diff);
  const future = diff > 0;
  const phrase = (amount: number, unit: string) => {
    const text = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
    return future ? `in ${text}` : `${text} ago`;
  };

  if (abs < MINUTE) {
    return future ? 'in a moment' : 'just now';
  }
  if (abs < HOUR) {
    return phrase(Math.round(abs / MINUTE), 'minute');
  }
  if (abs < DAY) {
    return phrase(Math.round(abs / HOUR), 'hour');
  }
  if (abs < 30 * DAY) {
    return phrase(Math.round(abs / DAY), 'day');
  }
  return new Date(time).toLocaleDateString();
}

export function absoluteTime(value: string | number | undefined): string {
  const time = typeof value === 'number' ? value : parseSalesforceDate(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : '';
}

export function daysUntil(value: string | undefined, now = Date.now()): number {
  const time = parseSalesforceDate(value);
  return Number.isFinite(time) ? Math.floor((time - now) / DAY) : NaN;
}

export function elapsed(startedAt: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function installUrl(versionId: string): string {
  return `https://login.salesforce.com/packaging/installPackage.apexp?p0=${versionId}`;
}
