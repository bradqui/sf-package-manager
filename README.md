# SF Package Manager - VSCode Extension

Comprehensive management of Salesforce Second Generation Packages (2GP) with visual UI.

## Features

- **Dashboard** (click the status bar item or run `SF Package: Open Management Dashboard`):
  - Overview of your project's packages, target org upgrades and expiring scratch orgs
  - Versions grouped by package and major.minor, with search, filters and bulk cleanup of old betas
  - Package details, installs and upgrades, scratch orgs and settings in one place
  - Dev Hub and target org switchers; falls back to the Salesforce CLI's `target-dev-hub` / `target-org`
- **Sidebar tree views** of packages, versions and installations
- **Form-based UI** for package, version, install and scratch org commands
- **Command preview** before execution
- **Installation tracking** with upgrade detection
- **Version ancestry and dependency** views
- **Progress feedback** in the status bar, with cancellable long-running operations

## Requirements

- Visual Studio Code 1.85.0 or higher
- Salesforce CLI (`sf`) installed and in PATH
- Salesforce Dev Hub enabled
- Node.js 20.x or higher

## Installation

### Build and install locally

```bash
npm install
npm run install-local
```

This packages the extension and installs it into VS Code. Run **Developer: Reload Window** afterwards. Set `VSCODE_CLI=code-insiders` to target VS Code Insiders.

### From Source (development)

1. Clone this repository
2. Run `npm install`
3. Press F5 to launch Extension Development Host
4. Open a Salesforce DX project with `sfdx-project.json`

## Configuration

Set your default Dev Hub and target org in settings:

- `sfPackageManager.defaultDevHub`: Default Dev Hub username or alias
- `sfPackageManager.defaultTargetOrg`: Default target org username or alias
- `sfPackageManager.autoRefresh`: Refresh the dashboard and sidebar after commands that change data
- `sfPackageManager.showCommandPreview`: Show CLI command preview before execution
- `sfPackageManager.defaultWaitTime`: Default wait time in minutes for version creation and installs
- `sfPackageManager.verboseOutput`: Log full CLI responses to the Output panel

Logging goes to the **SF Package Manager** output channel. Use **Developer: Set Log Level...** to show debug detail such as full CLI commands.

## Usage

### Quick Start

1. Open a Salesforce DX project in VSCode
2. Click the SF Package Manager icon in the activity bar
3. Explore packages, versions, and installations in the tree views
4. Right-click items for context actions

### Commands

All commands are available via Command Palette (`Ctrl+Shift+P`):

- `SF Package: Create Package`
- `SF Package: Create Package Version`
- `SF Package: Promote Version to Released`
- `SF Package: Install Package`
- `SF Package: List All Packages`
- `SF Package: Refresh`
- `SF Package: Open Settings`

## Development

### Project Structure

```
sf-package-manager/
├── src/
│   ├── extension.ts           # Extension entry point
│   ├── commands/              # Command handlers
│   ├── providers/             # Tree view & webview providers
│   ├── services/              # Business logic & CLI execution
│   ├── models/                # TypeScript type definitions
│   └── utils/                 # Utilities
├── media/                     # Icons and assets
└── package.json               # Extension manifest
```

### Building

```bash
npm install
npm run compile
```

### Testing

```bash
npm run test
```

### Debugging

Press F5 in VSCode to launch the Extension Development Host.

## Roadmap

The extension is being reworked with the dashboard as the primary interface:

- Non-blocking version creation with live status
- Package ancestry management (including breaking ancestry)
- Scratch org definition editor
- Automatic updates from GitHub Releases

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.
