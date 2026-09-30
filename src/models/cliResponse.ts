export interface CliResponse<T = any> {
  status: number;
  result: T;
  warnings?: string[];
}

export interface CliError {
  name: string;
  message: string;
  exitCode: number;
  commandName: string;
  stack?: string;
  warnings?: string[];
}

export interface CommandExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  command: string;
  duration: number;
}
