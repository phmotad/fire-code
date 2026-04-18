import * as path from 'path';

// ── fs mock — must be before any import that uses fs ──────────────────────────

const fsState: Record<string, string> = {};

jest.mock('fs', () => ({
  existsSync: (p: string) => Object.prototype.hasOwnProperty.call(fsState, p),
  readFileSync: (p: string) => {
    if (!Object.prototype.hasOwnProperty.call(fsState, p)) throw new Error(`ENOENT: ${p}`);
    return fsState[p];
  },
  writeFileSync: (p: string, data: string) => { fsState[p] = data; },
  mkdirSync: jest.fn(),
}));

jest.mock('os', () => ({
  homedir: () => '/fakehome',
}));

jest.mock('chalk', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noop = (...args: any[]) => args[0] ?? '';
  const handler: ProxyHandler<typeof noop> = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get: (_t: any, _k: any) => new Proxy(noop, handler),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    apply: (_t: any, _th: any, args: any[]) => args[0] ?? '',
  };
  const proxy = new Proxy(noop, handler);
  // __esModule: true tells ts-jest to use .default for the default import
  return { __esModule: true, default: proxy };
});

jest.mock('ora', () => () => ({
  start: () => ({ stop: jest.fn(), fail: jest.fn(), succeed: jest.fn() }),
  stop: jest.fn(),
  fail: jest.fn(),
  succeed: jest.fn(),
}));

// ── helpers ───────────────────────────────────────────────────────────────────

const HOME = '/fakehome';

function p(...parts: string[]) {
  return path.join(HOME, ...parts);
}

function readJson(filePath: string): Record<string, unknown> {
  if (!Object.prototype.hasOwnProperty.call(fsState, filePath)) return {};
  return JSON.parse(fsState[filePath]) as Record<string, unknown>;
}

function seedJson(filePath: string, data: Record<string, unknown>) {
  fsState[filePath] = JSON.stringify(data, null, 2) + '\n';
}

function clearFs() {
  for (const k of Object.keys(fsState)) delete fsState[k];
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeEach(() => {
  clearFs();
  jest.clearAllMocks();
});

// ── import after mocks ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { installCommand, uninstallCommand } = require('../../../src/cli/commands/install') as typeof import('../../../src/cli/commands/install');

// ── installCommand tests ──────────────────────────────────────────────────────

describe('installCommand', () => {
  test('claude-code: registers MCP server and plugin hooks', async () => {
    await installCommand({ ide: 'claude-code' });

    const mcp = readJson(p('.claude', 'claude_desktop_config.json'));
    expect((mcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();

    const settings = readJson(p('.claude', 'settings.json'));
    expect((settings['plugins'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('cursor: registers MCP server in ~/.cursor/mcp.json', async () => {
    await installCommand({ ide: 'cursor' });

    const mcp = readJson(p('.cursor', 'mcp.json'));
    expect((mcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('windsurf: registers MCP server in ~/.codeium/windsurf/mcp_config.json', async () => {
    await installCommand({ ide: 'windsurf' });

    const mcp = readJson(p('.codeium', 'windsurf', 'mcp_config.json'));
    expect((mcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('opencode: registers MCP server in ~/.config/opencode/config.json', async () => {
    await installCommand({ ide: 'opencode' });

    const config = readJson(p('.config', 'opencode', 'config.json'));
    const servers = ((config['mcp'] as Record<string, unknown>)['servers'] as Record<string, unknown>);
    expect(servers['fire-code']).toBeDefined();
  });

  test('codex: registers MCP server in ~/.codex/config.json', async () => {
    await installCommand({ ide: 'codex' });

    const config = readJson(p('.codex', 'config.json'));
    expect((config['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('gemini: registers MCP server in ~/.gemini/settings.json', async () => {
    await installCommand({ ide: 'gemini' });

    const settings = readJson(p('.gemini', 'settings.json'));
    expect((settings['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('goose: registers MCP server in ~/.config/goose/mcp.json', async () => {
    await installCommand({ ide: 'goose' });

    const mcp = readJson(p('.config', 'goose', 'mcp.json'));
    expect((mcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('install preserves existing mcpServers entries', async () => {
    seedJson(p('.cursor', 'mcp.json'), {
      mcpServers: { 'other-tool': { command: 'npx', args: ['other'] } },
    });

    await installCommand({ ide: 'cursor' });

    const mcp = readJson(p('.cursor', 'mcp.json'));
    const servers = mcp['mcpServers'] as Record<string, unknown>;
    expect(servers['other-tool']).toBeDefined();
    expect(servers['fire-code']).toBeDefined();
  });

  test('auto-detection falls back to generic when no IDE dir exists', async () => {
    await installCommand({});

    // generic writes to process.cwd()/.firecode/mcp.json — mkdirSync is mocked,
    // but writeFileSync still writes to fsState under process.cwd()
    const genericPath = path.join(process.cwd(), '.firecode', 'mcp.json');
    const mcp = readJson(genericPath);
    expect((mcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('auto-detection picks cursor when ~/.cursor exists', async () => {
    // seed the cursor dir indicator
    fsState[p('.cursor')] = '__dir__';

    await installCommand({});

    const mcp = readJson(p('.cursor', 'mcp.json'));
    expect((mcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeDefined();
  });

  test('rejects unknown IDE and calls process.exit(1)', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    await expect(installCommand({ ide: 'unknownide' })).rejects.toThrow('process.exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

// ── uninstallCommand tests ────────────────────────────────────────────────────

describe('uninstallCommand', () => {
  test('removes fire-code from all IDEs that are installed', async () => {
    seedJson(p('.claude', 'claude_desktop_config.json'), {
      mcpServers: { 'fire-code': { command: 'npx' }, 'other': {} },
    });
    seedJson(p('.claude', 'settings.json'), {
      plugins: { 'fire-code': { enabled: true } },
    });
    seedJson(p('.cursor', 'mcp.json'), {
      mcpServers: { 'fire-code': { command: 'npx' } },
    });
    seedJson(p('.gemini', 'settings.json'), {
      mcpServers: { 'fire-code': { command: 'npx' } },
    });

    await uninstallCommand();

    const claudeMcp = readJson(p('.claude', 'claude_desktop_config.json'));
    expect((claudeMcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeUndefined();
    expect((claudeMcp['mcpServers'] as Record<string, unknown>)['other']).toBeDefined();

    const claudeSettings = readJson(p('.claude', 'settings.json'));
    expect((claudeSettings['plugins'] as Record<string, unknown>)['fire-code']).toBeUndefined();

    const cursorMcp = readJson(p('.cursor', 'mcp.json'));
    expect((cursorMcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeUndefined();

    const geminiSettings = readJson(p('.gemini', 'settings.json'));
    expect((geminiSettings['mcpServers'] as Record<string, unknown>)['fire-code']).toBeUndefined();
  });

  test('no-op when no IDE configs exist', async () => {
    await expect(uninstallCommand()).resolves.not.toThrow();
  });

  test('skips IDEs not installed without errors', async () => {
    seedJson(p('.claude', 'claude_desktop_config.json'), {
      mcpServers: { 'fire-code': { command: 'npx' } },
    });

    await uninstallCommand();

    const claudeMcp = readJson(p('.claude', 'claude_desktop_config.json'));
    expect((claudeMcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeUndefined();
  });

  test('removes windsurf entry from mcp_config.json', async () => {
    seedJson(p('.codeium', 'windsurf', 'mcp_config.json'), {
      mcpServers: { 'fire-code': { command: 'npx' } },
    });

    await uninstallCommand();

    const mcp = readJson(p('.codeium', 'windsurf', 'mcp_config.json'));
    expect((mcp['mcpServers'] as Record<string, unknown>)['fire-code']).toBeUndefined();
  });

  test('removes opencode nested entry', async () => {
    seedJson(p('.config', 'opencode', 'config.json'), {
      mcp: { servers: { 'fire-code': { command: 'npx' }, 'other': {} } },
    });

    await uninstallCommand();

    const config = readJson(p('.config', 'opencode', 'config.json'));
    const servers = ((config['mcp'] as Record<string, unknown>)['servers'] as Record<string, unknown>);
    expect(servers['fire-code']).toBeUndefined();
    expect(servers['other']).toBeDefined();
  });
});
