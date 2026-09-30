import { execa } from 'execa';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { CommandExecutionResult } from '../models/cliResponse';

export class CliExecutor {
  /**
   * Log formatted command output to the OUTPUT panel
   */
  private logCommandOutput(
    fullCommand: string,
    result: { stdout?: string; stderr?: string; exitCode?: number },
    duration: number,
    success: boolean
  ): void {
    Logger.info('═'.repeat(70));
    Logger.info(`Command: ${fullCommand}`);
    Logger.info('─'.repeat(70));

    if (result.stdout) {
      // For JSON output, format it nicely
      try {
        const parsed = JSON.parse(result.stdout);
        Logger.info('Output:');
        const formatted = JSON.stringify(parsed, null, 2);
        formatted.split('\n').forEach(line => Logger.info(line));
      } catch {
        Logger.info('Output:');
        result.stdout.split('\n').forEach(line => Logger.info(line));
      }
    }

    if (result.stderr) {
      Logger.warn('─'.repeat(70));
      Logger.warn('Errors/Warnings:');
      result.stderr.split('\n').forEach(line => Logger.warn(line));
    }

    Logger.info('─'.repeat(70));
    Logger.info(`Status: ${success ? 'SUCCESS' : 'FAILED'} | Duration: ${duration}ms`);
    Logger.info('═'.repeat(70));
  }

  async execute(
    command: string,
    args: string[],
    options?: {
      cwd?: string;
      timeout?: number;
      showOutput?: boolean;
      revealOutput?: boolean;
    }
  ): Promise<CommandExecutionResult> {
    const startTime = Date.now();
    const fullCommand = `${command} ${args.join(' ')}`;

    // Always log the command being executed
    Logger.info(`Executing: ${fullCommand}`);

    try {
      const result = await execa(command, args, {
        cwd: options?.cwd,
        timeout: options?.timeout || 300000, // 5 minutes default
        reject: false
      });

      const duration = Date.now() - startTime;
      const success = result.exitCode === 0;

      // ALWAYS log output to the OUTPUT panel
      this.logCommandOutput(fullCommand, result, duration, success);

      // Reveal OUTPUT panel if requested (or if command failed)
      if (options?.revealOutput || !success) {
        Logger.show();
      }

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: result.stderr || result.stdout || 'Command failed',
          command: fullCommand,
          duration
        };
      }

      // Parse JSON response if --json flag was used
      let data: any;
      try {
        if (args.includes('--json')) {
          data = JSON.parse(result.stdout);
        } else {
          data = { output: result.stdout };
        }
      } catch (parseError) {
        Logger.warn('Failed to parse JSON response, using raw output');
        data = { output: result.stdout };
      }

      return {
        success: true,
        data,
        command: fullCommand,
        duration
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;

      // Log error to OUTPUT panel
      Logger.info('═'.repeat(70));
      Logger.info(`Command: ${fullCommand}`);
      Logger.info('─'.repeat(70));
      Logger.error(`Execution Error: ${error.message}`);
      Logger.info('─'.repeat(70));
      Logger.info(`Status: FAILED | Duration: ${duration}ms`);
      Logger.info('═'.repeat(70));

      // Always show OUTPUT panel on error
      Logger.show();

      return {
        success: false,
        error: error.message,
        command: fullCommand,
        duration
      };
    }
  }

  async executeWithProgress(
    command: string,
    args: string[],
    progressMessage: string,
    options?: {
      cwd?: string;
      timeout?: number;
      revealOutput?: boolean;
    }
  ): Promise<CommandExecutionResult> {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: progressMessage,
        cancellable: false
      },
      async () => {
        // Always reveal OUTPUT panel for commands with progress
        return this.execute(command, args, {
          ...options,
          revealOutput: options?.revealOutput ?? true
        });
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
}
