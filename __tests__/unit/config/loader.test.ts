import { join } from 'path';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { loadConfig } from '../../../src/config/loader';
import { ConfigError } from '../../../src/utils/errors';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'firecode-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadConfig', () => {
  it('returns defaults when no config file exists', async () => {
    const config = await loadConfig(tmpDir);
    expect(config.project.name).toBe('unnamed-project');
    expect(config.llm.provider).toBe('openrouter');
    expect(config.git.branchStrategy).toBe('reuse');
    expect(config.execution.mode).toBe('safe');
  });

  it('loads .firecode/config.json (canonical location)', async () => {
    const firecodeDir = join(tmpDir, '.firecode');
    mkdirSync(firecodeDir, { recursive: true });
    writeFileSync(
      join(firecodeDir, 'config.json'),
      JSON.stringify({ project: { name: 'canonical-app' }, git: { autoBranch: false } }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.project.name).toBe('canonical-app');
    expect(config.git.autoBranch).toBe(false);
    expect(config.git.branchStrategy).toBe('reuse'); // default preserved
  });

  it('.firecode/config.json takes priority over root firecode.config.json', async () => {
    const firecodeDir = join(tmpDir, '.firecode');
    mkdirSync(firecodeDir, { recursive: true });
    writeFileSync(join(firecodeDir, 'config.json'), JSON.stringify({ project: { name: 'inner' } }));
    writeFileSync(join(tmpDir, 'firecode.config.json'), JSON.stringify({ project: { name: 'outer' } }));
    const config = await loadConfig(tmpDir);
    expect(config.project.name).toBe('inner');
  });

  it('loads root firecode.config.json as fallback', async () => {
    writeFileSync(
      join(tmpDir, 'firecode.config.json'),
      JSON.stringify({ project: { name: 'my-app' }, git: { autoBranch: false } }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.project.name).toBe('my-app');
    expect(config.git.autoBranch).toBe(false);
    expect(config.git.branchStrategy).toBe('reuse'); // default preserved
  });

  it('loads .firecoderc.json config', async () => {
    writeFileSync(
      join(tmpDir, '.firecoderc.json'),
      JSON.stringify({ project: { name: 'rc-app' } }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.project.name).toBe('rc-app');
  });

  it('throws ConfigError for malformed JSON', async () => {
    writeFileSync(join(tmpDir, 'firecode.config.json'), '{ invalid json }');
    await expect(loadConfig(tmpDir)).rejects.toBeInstanceOf(ConfigError);
  });

  it('deep merges nested objects', async () => {
    writeFileSync(
      join(tmpDir, 'firecode.config.json'),
      JSON.stringify({ llm: { model: 'gpt-4o' } }),
    );
    const config = await loadConfig(tmpDir);
    expect(config.llm.model).toBe('gpt-4o');
    expect(config.llm.provider).toBe('openrouter'); // default preserved
  });

  it('applies all defaults when config is empty object', async () => {
    writeFileSync(join(tmpDir, 'firecode.config.json'), '{}');
    const config = await loadConfig(tmpDir);
    expect(config.execution.dryRun).toBe(false);
    expect(config.indexing.mode).toBe('lazy');
    expect(config.memory.strategy).toBe('auto');
  });
});
