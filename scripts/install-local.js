#!/usr/bin/env node
/**
 * Build the extension into a .vsix and install it into your local VS Code.
 *
 *   npm run install-local
 *
 * Set VSCODE_CLI to use a different VS Code CLI (e.g. "code-insiders").
 * Afterwards, run "Developer: Reload Window" in open VS Code windows.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const vsix = path.join(root, `${pkg.name}-${pkg.version}.vsix`);
const codeCli = process.env.VSCODE_CLI || 'code';

function run(command, args) {
  console.log(`\n> ${command} ${args.join(' ')}`);
  // shell: true so Windows can resolve npm.cmd / code.cmd
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`\n"${command}" failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

run('npm', ['run', 'package']);

if (!fs.existsSync(vsix)) {
  console.error(`\nExpected ${path.basename(vsix)} after packaging, but it was not found.`);
  process.exit(1);
}

run(codeCli, ['--install-extension', `"${vsix}"`, '--force']);

console.log(`\nInstalled ${pkg.displayName} ${pkg.version}.`);
console.log('Run "Developer: Reload Window" in open VS Code windows to load the new version.');
