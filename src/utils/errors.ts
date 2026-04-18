export class FireCodeError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = 'FireCodeError';
    this.code = code;
    this.context = context;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ConfigError extends FireCodeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
    this.name = 'ConfigError';
  }
}

export class GitError extends FireCodeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'GIT_ERROR', context);
    this.name = 'GitError';
  }
}

export class ExecutionError extends FireCodeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'EXECUTION_ERROR', context);
    this.name = 'ExecutionError';
  }
}

export class IndexError extends FireCodeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'INDEX_ERROR', context);
    this.name = 'IndexError';
  }
}

export class MemoryError extends FireCodeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'MEMORY_ERROR', context);
    this.name = 'MemoryError';
  }
}

export class ProviderError extends FireCodeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PROVIDER_ERROR', context);
    this.name = 'ProviderError';
  }
}

export function isFireCodeError(err: unknown): err is FireCodeError {
  return err instanceof FireCodeError;
}

export function toFireCodeError(err: unknown, code = 'UNKNOWN_ERROR'): FireCodeError {
  if (isFireCodeError(err)) return err;
  if (err instanceof Error) return new FireCodeError(err.message, code);
  return new FireCodeError(String(err), code);
}
