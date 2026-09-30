import { execa, ExecaChildProcess } from 'execa';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { formatCommand } from '../utils/secrets';
import { CommandExecutionResult, CANCELLED_ERROR } from '../models/cliResponse';

export interface RunningOperation {
  id: number;
  label: string;
  startedAt: number;
}

// Positional words that mark a CLI command as read-only
const READ_ONLY_VERBS = new Set(['list', 'report', 'display', 'displayancestry', 'displaydependencies', 'open']);
// Positional words that mark a CLI command as changing org/package data
const MUTATING_VERBS = new Set(['create', 'update', 'delete', 'promote', 'install', 'uninstall', 'schedule', 'abort']);

export class CliExecutor {
  private static readonly running = new Map<number, RunningOperation>();
  private static nextOperationId = 1;

  private static readonly runningChanged = new vscode.EventEmitter<void>();
  /** Fires whenever a CLI command starts or finishes. */
  static readonly onDidChangeRunning = CliExecutor.runningChanged.event;

  private static readonly dataChanged = new vscode.EventEmitter<string>();
  /** Fires after a successful command that changed packages, versions, installs or orgs. */
  static readonly onDidChangeData = CliExecutor.dataChanged.event;

  static getRunningOperations(): RunningOperation[] {
    return [...CliExecutor.running.values()];
  }

  async execute(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeout?: number;
      /** Human-readable description shown in the status bar while running. */
      label?: string;
      signal?: AbortSignal;
    }
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const commandLine = formatCommand(command, args);
    const shortName = this.describe(command, args);
    const timeout = options?.timeout || this.defaultTimeout(args);

    Logger.debug(`▶ ${commandLine}`);
    const operationId = this.startOperation(options?.label || shortName);

    try {
      const subprocess = execa(command, args, {
        cwd: options?.cwd,
        timeout,
        reject: false
      });

      const signal = options?.signal;
      const onAbort = () => this.kill(subprocess);
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      const result = await subprocess;
      signal?.removeEventListener('abort', onAbort);
      const duration = Date.now() - startTime;
      const elapsed = this.formatDuration(duration);

      if (signal?.aborted) {
        Logger.info(`■ ${shortName} cancelled (${elapsed})`);
        return { success: false, cancelled: true, error: CANCELLED_ERROR, command: commandLine, duration };
      }

      const parsed = this.tryParseJson(result.stdout);
      this.logResponse(result.stdout, result.stderr, parsed);

      if (result.exitCode !== 0 || result.timedOut) {
        const error = result.timedOut
          ? `Timed out after ${this.formatDuration(timeout)}. The operation may still be running in Salesforce.`
          : this.extractError(parsed, result.stderr, result.stdout);
        Logger.error(`✗ ${shortName} (${elapsed}): ${error}`);
        return { success: false, error, command: commandLine, duration };
      }

      Logger.info(`✓ ${shortName} (${elapsed})`);

      if (this.isMutating(args)) {
        CliExecutor.dataChanged.fire(shortName);
      }

      let data: any;
      if (args.includes('--json') && parsed !== undefined) {
        data = parsed;
      } else {
        if (args.includes('--json')) {
          Logger.warn(`${shortName}: could not parse JSON response, using raw output`);
        }
        data = { output: result.stdout };
      }

      return { success: true, data, command: commandLine, duration };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      Logger.error(`✗ ${shortName} (${this.formatDuration(duration)}): ${error.message}`);
      return { success: false, error: error.message, command: commandLine, duration };
    } finally {
      this.endOperation(operationId);
    }
  }

  /**
   * Run a command behind a cancellable progress notification.
   * Cancelling stops waiting locally; Salesforce may still finish a request it already received.
   */
  async executeWithProgress(
    command: string,
    args: string[],
    progressMessage: string,
    options?: {
      cwd?: string;
      timeout?: number;
      cancellable?: boolean;
    }
  ): Promise<CommandExecutionResult> {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: progressMessage,
        cancellable: options?.cancellable ?? true
      },
      async (_progress, token) => {
        const controller = new AbortController();
        const subscription = token.onCancellationRequested(() => controller.abort());
        try {
          const result = await this.execute(command, args, {
            cwd: options?.cwd,
            timeout: options?.timeout,
            label: progressMessage.replace(/\.{3}$/, ''),
            signal: controller.signal
          });
          if (result.cancelled) {
            vscode.window.showInformationMessage(
              'Stopped waiting. If Salesforce already received the request, it may still complete.'
            );
          }
          return result;
        } finally {
          subscription.dispose();
        }
      }
    );
  }

  async checkSfCliAvailable(): Promise<boolean> {
    try {
      const result = await execa('sf', ['--version'], { reject: false });
      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  private startOperation(label: string): number {
    const id = CliExecutor.nextOperationId++;
    CliExecutor.running.set(id, { id, label, startedAt: Date.now() });
    CliExecutor.runningChanged.fire();
    return id;
  }

  private endOperation(id: number): void {
    CliExecutor.running.delete(id);
    CliExecutor.runningChanged.fire();
  }

  /**
   * 5 minutes, or long enough for the command's own --wait/--publish-wait
   * (in minutes) plus a 2 minute buffer, so we never kill a command that is
   * still legitimately waiting on Salesforce.
   */
  private defaultTimeout(args: string[]): number {
    const minutesFor = (flag: string) => {
      const index = args.indexOf(flag);
      const value = index >= 0 ? parseInt(args[index + 1], 10) : NaN;
      return isNaN(value) ? 0 : value;
    };
    const waitMinutes = minutesFor('--wait') + minutesFor('--publish-wait');
    return Math.max(5, waitMinutes + 2) * 60 * 1000;
  }

  /** "sf package version list --target-dev-hub x --json" -> "sf package version list" */
  private describe(command: string, args: string[]): string {
    const firstFlag = args.findIndex(arg => arg.startsWith('-'));
    const positional = firstFlag === -1 ? args : args.slice(0, firstFlag);
    return [command, ...positional].join(' ');
  }

  private isMutating(args: string[]): boolean {
    const firstFlag = args.findIndex(arg => arg.startsWith('-'));
    const positional = firstFlag === -1 ? args : args.slice(0, firstFlag);
    return positional.some(word => MUTATING_VERBS.has(word)) &&
      !positional.some(word => READ_ONLY_VERBS.has(word));
  }

  private kill(subprocess: ExecaChildProcess): void {
    // On Windows `sf` runs through a .cmd shim; kill the whole process tree
    if (process.platform === 'win32' && subprocess.pid) {
      execa('taskkill', ['/pid', String(subprocess.pid), '/T', '/F'], { reject: false }).catch(() => undefined);
    } else {
      subprocess.kill('SIGTERM');
    }
  }

  private tryParseJson(stdout: string): any {
    if (!stdout) {
      return undefined;
    }
    try {
      return JSON.parse(stdout);
    } catch {
      return undefined;
    }
  }

  /** Prefer the CLI's own JSON error message over raw stderr/stdout. */
  private extractError(parsed: any, stderr: string, stdout: string): string {
    if (parsed?.message) {
      return String(parsed.message);
    }
    const meaningful = (stderr || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !/update available/i.test(line))
      .join('\n');
    return meaningful || stdout || 'Command failed';
  }

  private logResponse(stdout: string, stderr: string, parsed: any): void {
    const verbose = vscode.workspace.getConfiguration('sfPackageManager').get<boolean>('verboseOutput') ?? false;
    const log = verbose ? Logger.info.bind(Logger) : Logger.trace.bind(Logger);

    if (stdout) {
      log(`Response:\n${parsed !== undefined ? JSON.stringify(parsed, null, 2) : stdout}`);
    }
    if (stderr) {
      // Usually just the CLI's "update available" notice
      Logger.debug(`stderr: ${stderr.trim()}`);
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    }
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}
