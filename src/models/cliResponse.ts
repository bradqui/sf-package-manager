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
  /** True when the user cancelled the operation before it finished. */
  cancelled?: boolean;
  command: string;
  duration: number;
}

/** Error text used for results the user cancelled; error handlers ignore it. */
export const CANCELLED_ERROR = 'Cancelled by user';
