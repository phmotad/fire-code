export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: Date;
  context?: Record<string, unknown>;
  error?: Error;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3, silent: 4,
};

export class ConsoleLogger implements Logger {
  private context: Record<string, unknown>;

  constructor(
    private readonly level: LogLevel = 'info',
    context: Record<string, unknown> = {},
  ) {
    this.context = context;
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_ORDER[level] >= LEVEL_ORDER[this.level];
  }

  private format(level: LogLevel, message: string, context?: Record<string, unknown>): string {
    const ts = new Date().toISOString();
    const ctx = { ...this.context, ...context };
    const ctxStr = Object.keys(ctx).length ? ' ' + JSON.stringify(ctx) : '';
    return `[${ts}] ${level.toUpperCase().padEnd(5)} ${message}${ctxStr}`;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) console.debug(this.format('debug', message, context));
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('info')) console.info(this.format('info', message, context));
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) console.warn(this.format('warn', message, context));
  }

  error(message: string, error?: Error, context?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      const ctx = error ? { ...context, error: error.message, stack: error.stack } : context;
      console.error(this.format('error', message, ctx));
    }
  }

  child(context: Record<string, unknown>): Logger {
    return new ConsoleLogger(this.level, { ...this.context, ...context });
  }
}

export const createLogger = (level: LogLevel = 'info', context: Record<string, unknown> = {}): Logger =>
  new ConsoleLogger(level, context);

export const noop: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noop,
};
