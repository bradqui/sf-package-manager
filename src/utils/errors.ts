import * as vscode from 'vscode';
import { Logger } from './logger';
import { CANCELLED_ERROR } from '../models/cliResponse';

export class ErrorHandler {
  /**
   * Log an error and show it with a "Show Output" button.
   * Cancellations are ignored — the user already knows they cancelled.
   */
  static handle(error: any, context?: string): void {
    const message = this.extractMessage(error);
    if (message === CANCELLED_ERROR) {
      return;
    }
    const fullMessage = context ? `${context}: ${message}` : message;

    Logger.error(fullMessage);
    vscode.window.showErrorMessage(fullMessage, 'Show Output').then(choice => {
      if (choice === 'Show Output') {
        Logger.show();
      }
    });
  }

  static async handleWithRetry(
    operation: () => Promise<any>,
    maxRetries: number = 3,
    context?: string
  ): Promise<any> {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        Logger.warn(`Attempt ${attempt}/${maxRetries} failed: ${error}`);

        if (attempt < maxRetries) {
          const shouldRetry = await vscode.window.showErrorMessage(
            `${context || 'Operation'} failed. Retry?`,
            'Retry',
            'Cancel'
          );

          if (shouldRetry !== 'Retry') {
            break;
          }
        }
      }
    }

    this.handle(lastError, context);
    throw lastError;
  }

  private static extractMessage(error: any): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error.message) {
      return error.message;
    }

    if (error.toString) {
      return error.toString();
    }

    return 'An unknown error occurred';
  }

  static async showErrorWithActions(
    message: string,
    actions: { label: string; action: () => void }[]
  ): Promise<void> {
    const choice = await vscode.window.showErrorMessage(
      message,
      ...actions.map(a => a.label)
    );

    if (choice) {
      const action = actions.find(a => a.label === choice);
      if (action) {
        action.action();
      }
    }
  }
}
