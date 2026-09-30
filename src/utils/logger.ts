import * as vscode from 'vscode';

export class Logger {
  private static outputChannel: vscode.OutputChannel | null = null;

  static setOutputChannel(channel: vscode.OutputChannel): void {
    this.outputChannel = channel;
  }

  static info(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [INFO] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);
    }
    console.log(logMessage);
  }

  static warn(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [WARN] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);
    }
    console.warn(logMessage);
  }

  static error(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [ERROR] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);
    }
    console.error(logMessage);
  }

  static debug(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [DEBUG] ${message}`;

    if (this.outputChannel) {
      this.outputChannel.appendLine(logMessage);
    }
    console.debug(logMessage);
  }

  static show(): void {
    if (this.outputChannel) {
      this.outputChannel.show();
    }
  }
}
