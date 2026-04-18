import {
  FireCodeError,
  ConfigError,
  GitError,
  ExecutionError,
  IndexError,
  MemoryError,
  ProviderError,
  isFireCodeError,
  toFireCodeError,
} from '../../../src/utils/errors';

describe('FireCodeError hierarchy', () => {
  it('creates base error with code and context', () => {
    const err = new FireCodeError('msg', 'MY_CODE', { key: 'val' });
    expect(err.message).toBe('msg');
    expect(err.code).toBe('MY_CODE');
    expect(err.context).toEqual({ key: 'val' });
    expect(err instanceof Error).toBe(true);
  });

  it.each([
    ['ConfigError', ConfigError, 'CONFIG_ERROR'],
    ['GitError', GitError, 'GIT_ERROR'],
    ['ExecutionError', ExecutionError, 'EXECUTION_ERROR'],
    ['IndexError', IndexError, 'INDEX_ERROR'],
    ['MemoryError', MemoryError, 'MEMORY_ERROR'],
    ['ProviderError', ProviderError, 'PROVIDER_ERROR'],
  ])('%s has correct code', (_name, Cls, code) => {
    const err = new Cls('test');
    expect(err.code).toBe(code);
    expect(isFireCodeError(err)).toBe(true);
  });

  it('toFireCodeError wraps plain Error', () => {
    const plain = new Error('plain');
    const wrapped = toFireCodeError(plain);
    expect(isFireCodeError(wrapped)).toBe(true);
    expect(wrapped.message).toBe('plain');
  });

  it('toFireCodeError wraps string', () => {
    const wrapped = toFireCodeError('oops');
    expect(wrapped.message).toBe('oops');
  });

  it('toFireCodeError passes through FireCodeError unchanged', () => {
    const orig = new GitError('git fail');
    expect(toFireCodeError(orig)).toBe(orig);
  });
});
