const SECRET_FLAGS = new Set(['--installation-key', '-k']);

/**
 * Replace the values of secret flags (installation keys) with asterisks so
 * CLI arguments can be logged or displayed safely.
 */
export function maskArgs(args: string[]): string[] {
  return args.map((arg, index) =>
    index > 0 && SECRET_FLAGS.has(args[index - 1]) ? '********' : arg
  );
}

/**
 * Render a command line with secrets masked.
 */
export function formatCommand(command: string, args: string[]): string {
  return `${command} ${maskArgs(args).join(' ')}`;
}
