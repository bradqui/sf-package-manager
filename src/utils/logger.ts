import * as vscode from 'vscode';

/**
 * Thin wrapper around a VS Code LogOutputChannel.
 *
 * The channel adds timestamps and level tags itself, and users control what is
 * shown via "Developer: Set Log Level..." (default: info). Anything logged
 * before the channel is attached is dropped.
 */
export class Logger {
  private static outputChannel: vscode.LogOutputChannel | null = null;

  static setOutputChannel(channel: vscode.LogOutputChannel): void {
    this.outputChannel = channel;
  }

  static trace(message: string): void {
    this.outputChannel?.trace(message);
  }

  static debug(message: string): void {
    this.outputChannel?.debug(message);
  }

  static info(message: string): void {
    this.outputChannel?.info(message);
  }

  static warn(message: string): void {
    this.outputChannel?.warn(message);
  }

  static error(message: string): void {
    this.outputChannel?.error(message);
  }

  static show(): void {
    this.outputChannel?.show(true);
  }
}
