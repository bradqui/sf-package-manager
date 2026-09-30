/**
 * Explanations shown next to options in the dashboard.
 * Links open in the browser (VS Code handles external links in webviews).
 */
export const DOCS = {
  packageCommands: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/cli_reference_package_commands_unified.htm',
  secondGeneration: 'https://developer.salesforce.com/docs/atlas.en-us.pkg2_dev.meta/pkg2_dev/sfdx_dev_dev2gp.htm',
  scratchDefinition: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_scratch_orgs_def_file.htm',
  scratchFeatures: 'https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_scratch_orgs_def_file_config_values.htm'
};

export interface HelpEntry {
  text: string;
  link?: string;
}

export const HELP = {
  // Packages
  packageType: {
    text: 'Unlocked packages are for internal apps: components stay editable in the org. Managed packages are for distribution (e.g. AppExchange): code is hidden, upgrades are strictly controlled, and a namespace is required.',
    link: DOCS.secondGeneration
  },
  packagePath: { text: 'The folder in sfdx-project.json whose contents make up the package.' },
  noNamespace: { text: 'Create an unlocked package without the project namespace. Only available for unlocked packages.' },
  orgDependent: { text: 'Unlocked only. Lets the package depend on metadata that exists in the installing org but not in the package. Versions skip validation against a clean org.' },

  // Versions
  versionNumber: { text: 'major.minor.patch.build. Use NEXT for the build number to have Salesforce pick the next one. Defaults to versionNumber in sfdx-project.json.' },
  installationKey: { text: 'A password subscribers must enter to install this version. Without one, anyone with the version ID (04t…) can install it.' },
  codeCoverage: {
    text: 'Runs Apex tests while building and records code coverage. Required to promote the version to Released (at least 75% coverage).',
    link: DOCS.packageCommands
  },
  skipValidation: { text: 'Builds much faster by skipping dependency checks, Apex tests and coverage. The resulting version can’t be promoted to Released — use it for quick testing only.' },
  asyncValidation: { text: 'Returns as soon as the version is created and runs validation afterwards. The version can be installed while validation continues, but can’t be promoted until it passes.' },
  skipAncestorCheck: { text: 'Managed packages only. Allows an ancestor other than the highest released version (set via ancestorVersion/ancestorId in sfdx-project.json), e.g. to abandon a released version.' },
  branch: { text: 'Optional source-control branch the version was built from. Versions are numbered separately per branch.' },
  tag: { text: 'Optional label, e.g. a git commit or release tag, stored with the version.' },
  waitTime: { text: 'How long to wait for Salesforce to finish. With 0 the request is queued and you can check on it later. You can also stop waiting from the progress notification.' },
  promote: { text: 'Released versions can be installed in production orgs. Promotion can’t be undone, and released versions can’t be deleted.' },
  betaVersions: { text: 'Beta versions can only be installed in scratch orgs and sandboxes, and can’t be upgraded in place.' },

  // Installs
  securityType: { text: 'Who gets access to the package’s components after install: only administrators, or all users.' },
  installTarget: { text: 'The org the package is installed into. Defaults to the target org selected in the header.' },

  // Scratch orgs
  definitionFile: {
    text: 'JSON file describing the org shape: edition, features and settings.',
    link: DOCS.scratchDefinition
  },
  setDefault: { text: 'Also makes the new org the Salesforce CLI’s default org (target-org) for this project.' },
  noAncestors: { text: 'Don’t include second-generation managed package ancestors in the scratch org.' },
  scratchNoNamespace: { text: 'Create the scratch org without the project namespace.' },
  duration: { text: 'Scratch orgs are deleted automatically after this many days (maximum 30).' },
  features: { text: 'Features to enable in the scratch org.', link: DOCS.scratchFeatures },

  // Settings
  autoRefresh: { text: 'Reload the dashboard and sidebar automatically after commands change packages, versions, installs or orgs. When off, changed data is marked “out of date” until you refresh.' },
  showCommandPreview: { text: 'Show the CLI command and ask for confirmation before running commands from the sidebar and command palette.' },
  defaultWaitTime: { text: 'Default number of minutes to wait for version creation and installs.' },
  verboseOutput: { text: 'Write full CLI responses to the SF Package Manager output channel. Use “Developer: Set Log Level…” for more control.' }
} satisfies Record<string, HelpEntry>;

export type HelpKey = keyof typeof HELP;
