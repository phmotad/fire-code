// NOTE: This is the core/app-level structured logger — utils/logger.ts is a simpler console logger.
// This module is the canonical logger for all service and repository layers.

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface StructuredLog {
  level: LogLevel;
  message: string;
  timestamp: string;
  service?: string;
  traceId?: string;
  spanId?: string;
  userId?: string;
  requestId?: string;
  duration?: number;
  error?: { message: string; type: string; stack?: string };
  [key: string]: unknown;
}

export interface AppLogger {
  trace(msg: string, ctx?: Record<string, unknown>): void;
  debug(msg: string, ctx?: Record<string, unknown>): void;
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, err?: Error, ctx?: Record<string, unknown>): void;
  fatal(msg: string, err?: Error, ctx?: Record<string, unknown>): void;
  withContext(ctx: Record<string, unknown>): AppLogger;
  withRequestId(requestId: string): AppLogger;
  withUserId(userId: string): AppLogger;
  withTraceId(traceId: string, spanId?: string): AppLogger;
}

const LEVELS: Record<LogLevel, number> = {
  trace: 0, debug: 1, info: 2, warn: 3, error: 4, fatal: 5,
};

export class StructuredLogger implements AppLogger {
  constructor(
    private readonly service: string,
    private readonly minLevel: LogLevel = 'info',
    private readonly ctx: Record<string, unknown> = {},
  ) {}

  private shouldLog(level: LogLevel): boolean {
    return LEVELS[level] >= LEVELS[this.minLevel];
  }

  private emit(level: LogLevel, msg: string, ctx: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const entry: StructuredLog = {
      level,
      message: msg,
      timestamp: new Date().toISOString(),
      service: this.service,
      ...this.ctx,
      ...ctx,
    };
    const out = JSON.stringify(entry);
    if (level === 'error' || level === 'fatal') process.stderr.write(out + '\n');
    else process.stdout.write(out + '\n');
  }

  trace(msg: string, ctx: Record<string, unknown> = {}): void { this.emit('trace', msg, ctx); }
  debug(msg: string, ctx: Record<string, unknown> = {}): void { this.emit('debug', msg, ctx); }
  info(msg: string, ctx: Record<string, unknown> = {}): void { this.emit('info', msg, ctx); }
  warn(msg: string, ctx: Record<string, unknown> = {}): void { this.emit('warn', msg, ctx); }

  error(msg: string, err?: Error, ctx: Record<string, unknown> = {}): void {
    const errCtx = err ? { error: { message: err.message, type: err.name, stack: err.stack } } : {};
    this.emit('error', msg, { ...errCtx, ...ctx });
  }

  fatal(msg: string, err?: Error, ctx: Record<string, unknown> = {}): void {
    const errCtx = err ? { error: { message: err.message, type: err.name, stack: err.stack } } : {};
    this.emit('fatal', msg, { ...errCtx, ...ctx });
  }

  withContext(ctx: Record<string, unknown>): AppLogger {
    return new StructuredLogger(this.service, this.minLevel, { ...this.ctx, ...ctx });
  }

  withRequestId(requestId: string): AppLogger { return this.withContext({ requestId }); }
  withUserId(userId: string): AppLogger { return this.withContext({ userId }); }
  withTraceId(traceId: string, spanId?: string): AppLogger { return this.withContext({ traceId, spanId }); }
}

export const createAppLogger = (service: string, level: LogLevel = 'info'): AppLogger =>
  new StructuredLogger(service, level);
