import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { existsSync, mkdirSync, rmdirSync } from 'fs';
import {
  getFireCodeDir,
  ensureFireCodeDir,
  getGraphPath,
  getVectorsPath,
  getBootstrapLogPath,
  resolveFromCwd,
  relativeFromCwd,
} from '../../../src/utils/paths';

describe('paths utilities', () => {
  const cwd = join(tmpdir(), 'fc-paths-test');

  test('getFireCodeDir returns .firecode subdir', () => {
    expect(getFireCodeDir(cwd)).toBe(join(cwd, '.firecode'));
  });

  test('getGraphPath returns graph.json inside .firecode', () => {
    expect(getGraphPath(cwd)).toBe(join(cwd, '.firecode', 'graph.json'));
  });

  test('getVectorsPath returns vectors.db inside .firecode', () => {
    expect(getVectorsPath(cwd)).toBe(join(cwd, '.firecode', 'vectors.db'));
  });

  test('getBootstrapLogPath returns bootstrap.log inside .firecode', () => {
    expect(getBootstrapLogPath(cwd)).toBe(join(cwd, '.firecode', 'bootstrap.log'));
  });

  test('resolveFromCwd returns absolute path unchanged', () => {
    const abs = resolve('/some/absolute/file.ts');
    expect(resolveFromCwd(cwd, abs)).toBe(abs);
  });

  test('resolveFromCwd resolves relative path from cwd', () => {
    const result = resolveFromCwd(cwd, 'src/index.ts');
    expect(result).toBe(resolve(cwd, 'src/index.ts'));
  });

  test('relativeFromCwd returns path relative to cwd', () => {
    const abs = join(cwd, 'src', 'index.ts');
    const rel = relativeFromCwd(cwd, abs);
    expect(rel).toBe(join('src', 'index.ts'));
  });

  describe('ensureFireCodeDir', () => {
    const testRoot = join(tmpdir(), `fc-ensure-${Date.now()}`);
    const firedotDir = join(testRoot, '.firecode');

    afterEach(() => {
      try { rmdirSync(firedotDir); rmdirSync(testRoot); } catch { /* cleanup */ }
    });

    test('creates .firecode dir when missing', () => {
      mkdirSync(testRoot, { recursive: true });
      const result = ensureFireCodeDir(testRoot);
      expect(existsSync(firedotDir)).toBe(true);
      expect(result).toBe(firedotDir);
    });

    test('is idempotent when dir already exists', () => {
      mkdirSync(firedotDir, { recursive: true });
      expect(() => ensureFireCodeDir(testRoot)).not.toThrow();
      expect(existsSync(firedotDir)).toBe(true);
    });
  });
});
