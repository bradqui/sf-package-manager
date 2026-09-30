import * as vscode from 'vscode';

export interface CommandHistoryEntry {
  id: string;
  timestamp: Date;
  command: string;
  args: string[];
  preview: string;
  success: boolean;
  duration: number; // milliseconds
  error?: string;
  output?: string;
}

export class CommandHistoryService {
  private history: CommandHistoryEntry[] = [];
  private maxEntries: number = 100;
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.loadHistory();
  }

  /**
   * Add a command to history
   */
  addEntry(
    command: string,
    args: string[],
    preview: string,
    success: boolean,
    duration: number,
    error?: string,
    output?: string
  ): void {
    const entry: CommandHistoryEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      command,
      args,
      preview,
      success,
      duration,
      error,
      output
    };

    this.history.unshift(entry);

    // Keep only max entries
    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
    }

    this.saveHistory();
  }

  /**
   * Get all history entries
   */
  getHistory(): CommandHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get recent history (last N entries)
   */
  getRecentHistory(count: number = 10): CommandHistoryEntry[] {
    return this.history.slice(0, count);
  }

  /**
   * Get history by date range
   */
  getHistoryByDateRange(startDate: Date, endDate: Date): CommandHistoryEntry[] {
    return this.history.filter(entry =>
      entry.timestamp >= startDate && entry.timestamp <= endDate
    );
  }

  /**
   * Get successful commands only
   */
  getSuccessfulCommands(): CommandHistoryEntry[] {
    return this.history.filter(entry => entry.success);
  }

  /**
   * Get failed commands only
   */
  getFailedCommands(): CommandHistoryEntry[] {
    return this.history.filter(entry => !entry.success);
  }

  /**
   * Get statistics
   */
  getStatistics(): {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDuration: number;
  } {
    const total = this.history.length;
    const successful = this.getSuccessfulCommands().length;
    const failed = this.getFailedCommands().length;
    const successRate = total > 0 ? (successful / total) * 100 : 0;
    const avgDuration = total > 0
      ? this.history.reduce((sum, entry) => sum + entry.duration, 0) / total
      : 0;

    return {
      total,
      successful,
      failed,
      successRate,
      avgDuration
    };
  }

  /**
   * Search history
   */
  searchHistory(query: string): CommandHistoryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.history.filter(entry =>
      entry.command.toLowerCase().includes(lowerQuery) ||
      entry.preview.toLowerCase().includes(lowerQuery) ||
      entry.args.some(arg => arg.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Clear all history
   */
  clearHistory(): void {
    this.history = [];
    this.saveHistory();
  }

  /**
   * Clear old history (older than N days)
   */
  clearOldHistory(days: number): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    this.history = this.history.filter(entry =>
      entry.timestamp >= cutoffDate
    );

    this.saveHistory();
  }

  /**
   * Get entry by ID
   */
  getEntry(id: string): CommandHistoryEntry | undefined {
    return this.history.find(entry => entry.id === id);
  }

  /**
   * Export history as JSON
   */
  exportHistory(): string {
    return JSON.stringify(this.history, null, 2);
  }

  /**
   * Import history from JSON
   */
  importHistory(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      if (Array.isArray(imported)) {
        this.history = imported.map(entry => ({
          ...entry,
          timestamp: new Date(entry.timestamp)
        }));
        this.saveHistory();
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Save history to workspace state
   */
  private saveHistory(): void {
    this.context.workspaceState.update('commandHistory', this.history);
  }

  /**
   * Load history from workspace state
   */
  private loadHistory(): void {
    const saved = this.context.workspaceState.get<CommandHistoryEntry[]>('commandHistory');
    if (saved && Array.isArray(saved)) {
      this.history = saved.map(entry => ({
        ...entry,
        timestamp: new Date(entry.timestamp)
      }));
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
