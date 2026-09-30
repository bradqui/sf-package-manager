/**
 * Pure helpers for package versions, shared by the extension and the webview.
 */
import type { Package } from '../models/package';
import type { PackageVersion } from '../models/packageVersion';
import type { InstalledPackage } from './protocol';

type VersionParts = Pick<PackageVersion, 'MajorVersion' | 'MinorVersion' | 'PatchVersion' | 'BuildNumber'>;

export function versionString(v: VersionParts): string {
  return `${v.MajorVersion}.${v.MinorVersion}.${v.PatchVersion}.${v.BuildNumber}`;
}

/** Negative if a < b, positive if a > b. */
export function compareVersions(a: VersionParts, b: VersionParts): number {
  return (a.MajorVersion - b.MajorVersion) ||
    (a.MinorVersion - b.MinorVersion) ||
    (a.PatchVersion - b.PatchVersion) ||
    (a.BuildNumber - b.BuildNumber);
}

/** Parse "1.2.3.4" into version parts (undefined if malformed). */
export function parseVersionString(value: string | undefined): VersionParts | undefined {
  const parts = (value || '').split('.').map(p => parseInt(p, 10));
  if (parts.length !== 4 || parts.some(p => isNaN(p))) {
    return undefined;
  }
  return { MajorVersion: parts[0], MinorVersion: parts[1], PatchVersion: parts[2], BuildNumber: parts[3] };
}

/**
 * `sf package version list` returns CreatedDate as "YYYY-MM-DD HH:mm" in UTC;
 * other commands return full ISO strings. Returns epoch ms (NaN if unparseable).
 */
export function parseSalesforceDate(value: string | undefined): number {
  if (!value) {
    return NaN;
  }
  const shortUtc = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
  return Date.parse(shortUtc.test(value) ? `${value.replace(' ', 'T')}:00Z` : value);
}

/** Newest first: by version number, then by creation date. */
export function sortVersionsDesc(versions: PackageVersion[]): PackageVersion[] {
  return [...versions].sort((a, b) =>
    compareVersions(b, a) || (parseSalesforceDate(b.CreatedDate) - parseSalesforceDate(a.CreatedDate)) || 0
  );
}

export function isManaged(pkg: Package | undefined): boolean {
  return pkg?.ContainerOptions === 'Managed';
}

export interface PackageVersionSummary {
  latestReleased?: PackageVersion;
  latestBeta?: PackageVersion;
  releasedCount: number;
  betaCount: number;
  total: number;
}

export function summarizeVersions(versions: PackageVersion[]): PackageVersionSummary {
  const sorted = sortVersionsDesc(versions);
  const released = sorted.filter(v => v.IsReleased);
  const betas = sorted.filter(v => !v.IsReleased);
  return {
    latestReleased: released[0],
    latestBeta: betas[0],
    releasedCount: released.length,
    betaCount: betas.length,
    total: sorted.length
  };
}

export interface UpgradeInfo {
  /** Dev Hub package this installed package belongs to (undefined if not ours) */
  package?: Package;
  current?: PackageVersion;
  currentIsBeta: boolean;
  /** Newest released version newer than the installed one */
  releasedUpgrade?: PackageVersion;
  /** Newest beta newer than the installed one (and newer than releasedUpgrade) */
  betaUpgrade?: PackageVersion;
}

/**
 * Work out which upgrades are available for an installed package.
 * Matches by SubscriberPackageId (033), falling back to package name.
 * Beta installs can't be upgraded in place, so they get no upgrade targets.
 */
export function computeUpgrade(
  installed: InstalledPackage,
  packages: Package[],
  versions: PackageVersion[]
): UpgradeInfo {
  const pkg = packages.find(p => p.SubscriberPackageId && p.SubscriberPackageId === installed.SubscriberPackageId)
    || packages.find(p => p.Name === installed.SubscriberPackageName);
  if (!pkg) {
    return { currentIsBeta: false };
  }

  const packageVersions = sortVersionsDesc(versions.filter(v => v.Package2Id === pkg.Id));
  const current = packageVersions.find(v => v.SubscriberPackageVersionId === installed.SubscriberPackageVersionId);
  const installedParts = current || parseVersionString(installed.SubscriberPackageVersionNumber);
  const currentIsBeta = current ? !current.IsReleased : false;

  if (currentIsBeta || !installedParts) {
    return { package: pkg, current, currentIsBeta };
  }

  const newer = packageVersions.filter(v => compareVersions(v, installedParts) > 0);
  const releasedUpgrade = newer.find(v => v.IsReleased);
  const newestBeta = newer.find(v => !v.IsReleased);
  const betaUpgrade = newestBeta && (!releasedUpgrade || compareVersions(newestBeta, releasedUpgrade) > 0)
    ? newestBeta
    : undefined;

  return { package: pkg, current, currentIsBeta, releasedUpgrade, betaUpgrade };
}
