import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';

const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const INJECT_SCRIPT = join(PLUGIN_ROOT, 'plugin', 'scripts', 'context-inject.js');

export type IdeTarget =
  | 'claude-code'
  | 'cursor'
  | 'windsurf'
  | 'opencode'
  | 'codex'
  | 'gemini'
  | 'goose'
  | 'generic';

const IDE_ALIASES: Record<string, IdeTarget> = {
  claude: 'claude-code',
  'claude-code': 'claude-code',
  cursor: 'cursor',
  windsurf: 'windsurf',
  opencode: 'opencode',
  codex: 'codex',
  gemini: 'gemini',
  goose: 'goose',
  generic: 'generic',
};

function resolveIde(input: string): IdeTarget | undefined {
  return IDE_ALIASES[input.toLowerCase()];
}

interface InstallOptions {
  ide?: string;
  cwd?: string;
}

const MCP_SERVER_ENTRY = {
  command: 'npx',
  args: ['@phmotad/fire-code', 'dev'],
  description: 'Fire Code — intelligent MCP execution engine',
};

// ── JSON helpers ─────────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function ensureDir(filePath: string): void {
  const sep = filePath.includes('/') ? '/' : '\\';
  const dir = filePath.substring(0, filePath.lastIndexOf(sep));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function registerMcp(mcpPath: string, serverKey = 'fire-code'): void {
  const cfg = readJson(mcpPath);
  if (!cfg['mcpServers']) cfg['mcpServers'] = {};
  (cfg['mcpServers'] as Record<string, unknown>)[serverKey] = MCP_SERVER_ENTRY;
  writeJson(mcpPath, cfg);
}

// ── Hook helpers ─────────────────────────────────────────────────────────────

type HookEntry = Record<string, unknown>;

function hookCmd(event: string): string {
  return `node "${INJECT_SCRIPT}" ${event}`;
}

function isFireCodeHook(entry: HookEntry): boolean {
  const cmd = String(entry['command'] ?? '');
  return cmd.includes('context-inject.js');
}

function appendHook(
  array: HookEntry[],
  entry: HookEntry,
): HookEntry[] {
  if (array.some(isFireCodeHook)) return array;
  return [...array, entry];
}

function removeFireCodeHooks(array: HookEntry[]): HookEntry[] {
  return array.filter(e => !isFireCodeHook(e));
}

// ── Claude Code ───────────────────────────────────────────────────────────────

function installClaudeCode(): string[] {
  const h = homedir();
  const mcpPath = join(h, '.claude', 'claude_desktop_config.json');
  registerMcp(mcpPath);

  const settingsPath = join(h, '.claude', 'settings.json');
  const settings = readJson(settingsPath);
  if (!settings['plugins']) settings['plugins'] = {};
  (settings['plugins'] as Record<string, unknown>)['fire-code'] = {
    enabled: true,
    hooksPath: join(PLUGIN_ROOT, 'plugin', 'hooks', 'hooks.json'),
  };
  writeJson(settingsPath, settings);

  return [
    'MCP server → ~/.claude/claude_desktop_config.json',
    'Hooks (SessionStart, PostToolUse, Stop) → ~/.claude/settings.json',
  ];
}

// ── Cursor ────────────────────────────────────────────────────────────────────

function installCursor(): string[] {
  const h = homedir();
  registerMcp(join(h, '.cursor', 'mcp.json'));

  const hooksPath = join(h, '.cursor', 'hooks.json');
  const cfg = readJson(hooksPath);
  if (!cfg['version']) cfg['version'] = 1;
  if (!cfg['hooks']) cfg['hooks'] = {};
  const hooks = cfg['hooks'] as Record<string, HookEntry[]>;

  hooks['beforeSubmitPrompt'] = appendHook(hooks['beforeSubmitPrompt'] ?? [], { command: hookCmd('session-start'), timeout: 10 });
  hooks['beforeReadFile']     = appendHook(hooks['beforeReadFile'] ?? [], { command: hookCmd('pre-read'), timeout: 5 });
  hooks['afterFileEdit']      = appendHook(hooks['afterFileEdit'] ?? [], { command: hookCmd('post-tool'), timeout: 30 });
  hooks['stop']               = appendHook(hooks['stop'] ?? [], { command: hookCmd('stop'), timeout: 30 });

  writeJson(hooksPath, cfg);

  return [
    'MCP server → ~/.cursor/mcp.json',
    'Hooks (beforeSubmitPrompt, beforeReadFile, afterFileEdit, stop) → ~/.cursor/hooks.json',
  ];
}

// ── Windsurf ──────────────────────────────────────────────────────────────────

function installWindsurf(): string[] {
  const h = homedir();
  registerMcp(join(h, '.codeium', 'windsurf', 'mcp_config.json'));

  const hooksPath = join(h, '.codeium', 'windsurf', 'hooks.json');
  const cfg = readJson(hooksPath);
  if (!cfg['hooks']) cfg['hooks'] = {};
  const hooks = cfg['hooks'] as Record<string, HookEntry[]>;

  hooks['pre_read_code']    = appendHook(hooks['pre_read_code'] ?? [], { command: hookCmd('pre-read'), show_output: false });
  hooks['post_write_code']  = appendHook(hooks['post_write_code'] ?? [], { command: hookCmd('post-tool'), show_output: false });
  hooks['post_mcp_tool_use'] = appendHook(hooks['post_mcp_tool_use'] ?? [], { command: hookCmd('post-tool'), show_output: false });

  writeJson(hooksPath, cfg);

  return [
    'MCP server → ~/.codeium/windsurf/mcp_config.json',
    'Hooks (pre_read_code, post_write_code, post_mcp_tool_use) → ~/.codeium/windsurf/hooks.json',
  ];
}

// ── OpenCode ──────────────────────────────────────────────────────────────────

function installOpenCode(): string[] {
  const h = homedir();

  // MCP
  const configPath = join(h, '.config', 'opencode', 'config.json');
  const cfg = readJson(configPath);
  if (!cfg['mcp']) cfg['mcp'] = {};
  const mcp = cfg['mcp'] as Record<string, unknown>;
  if (!mcp['servers']) mcp['servers'] = {};
  (mcp['servers'] as Record<string, unknown>)['fire-code'] = MCP_SERVER_ENTRY;

  // Plugin: generate JS plugin file with the baked-in script path
  const pluginContent = buildOpenCodePlugin();
  if (!cfg['plugins']) cfg['plugins'] = {};
  (cfg['plugins'] as Record<string, unknown>)['fire-code'] = { enabled: true };
  writeJson(configPath, cfg);

  const pluginsDir = join(h, '.config', 'opencode', 'plugins');
  if (!existsSync(pluginsDir)) mkdirSync(pluginsDir, { recursive: true });
  writeFileSync(join(pluginsDir, 'fire-code.js'), pluginContent, 'utf8');

  return [
    'MCP server → ~/.config/opencode/config.json',
    'Plugin (session.created, tool.execute.after) → ~/.config/opencode/plugins/fire-code.js',
  ];
}

function buildOpenCodePlugin(): string {
  return `'use strict';
// Fire Code — OpenCode plugin (auto-generated by fire-code install)
const { execSync } = require('child_process');
const SCRIPT = ${JSON.stringify(INJECT_SCRIPT)};

function run(event, env) {
  try { execSync('node "' + SCRIPT + '" ' + event, { env: { ...process.env, ...env }, stdio: 'ignore', timeout: 30000 }); } catch {}
}

module.exports = async (ctx) => ({
  'session.created': () => run('session-start', { CLAUDE_CWD: ctx.directory ?? process.cwd() }),
  'tool.execute.after': (input) => run('post-tool', {
    CLAUDE_CWD: ctx.directory ?? process.cwd(),
    CLAUDE_TOOL_NAME: String(input?.tool ?? ''),
    CLAUDE_TOOL_INPUT_JSON: JSON.stringify(input?.args ?? {}),
  }),
  'session.compacted': () => run('stop', { CLAUDE_CWD: ctx.directory ?? process.cwd() }),
});
`;
}

// ── Codex CLI ─────────────────────────────────────────────────────────────────

function installCodex(): string[] {
  const h = homedir();
  registerMcp(join(h, '.codex', 'config.json'));

  // Enable hooks feature flag in config.toml
  const tomlPath = join(h, '.codex', 'config.toml');
  const toml = existsSync(tomlPath) ? readFileSync(tomlPath, 'utf8') : '';
  if (!toml.includes('codex_hooks')) {
    ensureDir(tomlPath);
    writeFileSync(tomlPath, toml + '\n[features]\ncodex_hooks = true\n', 'utf8');
  }

  // Register hooks
  const hooksPath = join(h, '.codex', 'hooks.json');
  const cfg = readJson(hooksPath);
  if (!cfg['hooks']) cfg['hooks'] = {};
  const hooks = cfg['hooks'] as Record<string, unknown[]>;

  hooks['SessionStart'] = mergeCodexHook(hooks['SessionStart'] ?? [], hookCmd('session-start'), '*', 10);
  hooks['PostToolUse']  = mergeCodexHook(hooks['PostToolUse'] ?? [], hookCmd('post-tool'), '*', 30);
  hooks['Stop']         = mergeCodexHookStop(hooks['Stop'] ?? [], hookCmd('stop'), 30);

  writeJson(hooksPath, cfg);

  return [
    'MCP server → ~/.codex/config.json',
    'Feature flag codex_hooks → ~/.codex/config.toml',
    'Hooks (SessionStart, PostToolUse, Stop) → ~/.codex/hooks.json',
  ];
}

function mergeCodexHook(arr: unknown[], cmd: string, matcher: string, timeout: number): unknown[] {
  const alreadySet = (arr as Record<string, unknown>[]).some(g =>
    ((g['hooks'] ?? []) as HookEntry[]).some(isFireCodeHook)
  );
  if (alreadySet) return arr;
  return [...arr, { matcher, hooks: [{ type: 'command', command: cmd, timeout }] }];
}

function mergeCodexHookStop(arr: unknown[], cmd: string, timeout: number): unknown[] {
  const alreadySet = (arr as Record<string, unknown>[]).some(g =>
    ((g['hooks'] ?? []) as HookEntry[]).some(isFireCodeHook)
  );
  if (alreadySet) return arr;
  return [...arr, { hooks: [{ type: 'command', command: cmd, timeout }] }];
}

// ── Gemini CLI ────────────────────────────────────────────────────────────────

function installGemini(): string[] {
  const h = homedir();

  const settingsPath = join(h, '.gemini', 'settings.json');
  const settings = readJson(settingsPath);
  if (!settings['mcpServers']) settings['mcpServers'] = {};
  (settings['mcpServers'] as Record<string, unknown>)['fire-code'] = MCP_SERVER_ENTRY;
  if (!settings['hooks']) settings['hooks'] = {};
  const hooks = settings['hooks'] as Record<string, unknown[]>;

  hooks['SessionStart'] = mergeGeminiHook(hooks['SessionStart'] ?? [], hookCmd('session-start'), '*', 5000);
  hooks['AfterTool']    = mergeGeminiHook(hooks['AfterTool'] ?? [], hookCmd('post-tool'), '.*', 30000);
  hooks['SessionEnd']   = mergeGeminiHook(hooks['SessionEnd'] ?? [], hookCmd('stop'), '*', 30000);

  writeJson(settingsPath, settings);

  return [
    'MCP server → ~/.gemini/settings.json',
    'Hooks (SessionStart, AfterTool, SessionEnd) → ~/.gemini/settings.json',
  ];
}

function mergeGeminiHook(arr: unknown[], cmd: string, matcher: string, timeout: number): unknown[] {
  const alreadySet = (arr as Record<string, unknown>[]).some(g =>
    ((g['hooks'] ?? []) as HookEntry[]).some(isFireCodeHook)
  );
  if (alreadySet) return arr;
  return [...arr, { matcher, hooks: [{ type: 'command', command: cmd, timeout }] }];
}

// ── Goose ─────────────────────────────────────────────────────────────────────

function installGoose(): string[] {
  registerMcp(join(homedir(), '.config', 'goose', 'mcp.json'));
  return ['MCP server → ~/.config/goose/mcp.json'];
}

// ── Generic ───────────────────────────────────────────────────────────────────

function installGeneric(): string[] {
  const mcpPath = join(process.cwd(), '.firecode', 'mcp.json');
  if (!existsSync(join(process.cwd(), '.firecode')))
    mkdirSync(join(process.cwd(), '.firecode'), { recursive: true });
  writeFileSync(mcpPath, JSON.stringify({ mcpServers: { 'fire-code': MCP_SERVER_ENTRY } }, null, 2) + '\n', 'utf8');
  return [
    'MCP config → .firecode/mcp.json',
    "Point your IDE's MCP setting to this file to complete setup",
  ];
}

// ── Global config bootstrap ──────────────────────────────────────────────────

function ensureGlobalConfig(): void {
  const configPath = join(homedir(), '.firecode', 'config.json');
  if (existsSync(configPath)) return;
  const dir = join(homedir(), '.firecode');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(configPath, JSON.stringify({ llm: { provider: 'openrouter' } }, null, 2) + '\n', 'utf8');
}

// ── agents.md ────────────────────────────────────────────────────────────────

function writeAgentsMd(cwd: string): void {
  const dest = join(cwd, 'agents.md');
  if (existsSync(dest)) return;
  try {
    const src = join(PLUGIN_ROOT, 'plugin', 'agents.md');
    writeFileSync(dest, existsSync(src) ? readFileSync(src, 'utf8') : defaultAgentsMd(), 'utf8');
  } catch { /* best-effort */ }
}

function defaultAgentsMd(): string {
  return `# Fire Code — Agent Instructions\n\n> Read automatically by your AI coding agent. Do not delete.\n\nYou have Fire Code MCP tools available. **Use them without waiting to be asked.**\n`;
}

// ── Auto-detection ────────────────────────────────────────────────────────────

function detectIde(): IdeTarget {
  const h = homedir();
  if (existsSync(join(h, '.claude'))) return 'claude-code';
  if (existsSync(join(h, '.cursor'))) return 'cursor';
  if (existsSync(join(h, '.codeium', 'windsurf'))) return 'windsurf';
  if (existsSync(join(h, '.config', 'opencode'))) return 'opencode';
  if (existsSync(join(h, '.codex'))) return 'codex';
  if (existsSync(join(h, '.gemini'))) return 'gemini';
  if (existsSync(join(h, '.config', 'goose'))) return 'goose';
  return 'generic';
}

// ── Main command ──────────────────────────────────────────────────────────────

const HOOKS_SUPPORT = new Set<IdeTarget>(['claude-code', 'cursor', 'windsurf', 'opencode', 'codex', 'gemini']);

export async function installCommand(opts: InstallOptions = {}): Promise<void> {
  console.log(chalk.red('\n  🔥 Fire Code') + chalk.gray(' — install\n'));

  let ide: IdeTarget;

  if (opts.ide) {
    const resolved = resolveIde(opts.ide);
    if (!resolved) {
      console.error(chalk.red(`  Unknown IDE: ${opts.ide}`));
      console.error(chalk.gray('  Supported: claude, cursor, windsurf, opencode, codex, gemini, goose, generic'));
      process.exit(1);
    }
    ide = resolved;
  } else {
    ide = detectIde();
    const label = ide === 'claude-code' ? 'claude' : ide;
    console.log(chalk.gray(`  Auto-detected: ${chalk.bold(label)}`) + chalk.gray('  (override with --ide <name>)\n'));
  }

  ensureGlobalConfig();

  const spinner = ora({ text: `Installing for ${chalk.bold(ide)}...`, color: 'red' }).start();
  spinner.stop();

  try {
    let messages: string[];
    switch (ide) {
      case 'claude-code': messages = installClaudeCode(); break;
      case 'cursor':      messages = installCursor(); break;
      case 'windsurf':    messages = installWindsurf(); break;
      case 'opencode':    messages = installOpenCode(); break;
      case 'codex':       messages = installCodex(); break;
      case 'gemini':      messages = installGemini(); break;
      case 'goose':       messages = installGoose(); break;
      default:            messages = installGeneric();
    }

    for (const msg of messages) console.log(chalk.green('  ✓') + ' ' + msg);

    writeAgentsMd(opts.cwd ?? process.cwd());
    console.log(chalk.green('  ✓') + ' agents.md written to project root');

    console.log(chalk.green('\n  ✓ Fire Code installed successfully!\n'));
    console.log(chalk.gray('  Next steps:'));
    console.log(chalk.gray(`    1. Restart ${ide === 'claude-code' ? 'Claude Code' : ide}`));
    console.log(chalk.gray('    2. Run: ') + chalk.white('fire-code index') + chalk.gray(' in your project'));
    if (HOOKS_SUPPORT.has(ide)) {
      console.log(chalk.gray('    3. Lifecycle hooks active — auto re-indexing and context injection enabled'));
    }
    console.log();
  } catch (err) {
    console.error(chalk.red('  Installation failed:'), String(err));
    process.exit(1);
  }
}

// ── Uninstall ─────────────────────────────────────────────────────────────────

function removeMcpEntry(filePath: string, serverKey = 'fire-code'): boolean {
  if (!existsSync(filePath)) return false;
  const cfg = readJson(filePath);
  if (!(cfg['mcpServers'] as Record<string, unknown> | undefined)?.[serverKey]) return false;
  delete (cfg['mcpServers'] as Record<string, unknown>)[serverKey];
  writeJson(filePath, cfg);
  return true;
}

function removeNestedEntry(filePath: string, ...keys: string[]): boolean {
  if (!existsSync(filePath)) return false;
  const cfg = readJson(filePath);
  let node: Record<string, unknown> = cfg;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]]) return false;
    node = node[keys[i]] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (!node[last]) return false;
  delete node[last];
  writeJson(filePath, cfg);
  return true;
}

function removeHooksFromFile(filePath: string, hooksKey: string): boolean {
  if (!existsSync(filePath)) return false;
  const cfg = readJson(filePath);
  const hooks = cfg[hooksKey] as Record<string, unknown[]> | undefined;
  if (!hooks) return false;
  let changed = false;
  for (const event of Object.keys(hooks)) {
    const filtered = removeFireCodeHooks(hooks[event] as HookEntry[]);
    if (filtered.length !== (hooks[event] as unknown[]).length) { hooks[event] = filtered; changed = true; }
  }
  if (changed) writeJson(filePath, cfg);
  return changed;
}

export async function uninstallCommand(): Promise<void> {
  console.log(chalk.red('\n  🔥 Fire Code') + chalk.gray(' — uninstall\n'));

  const h = homedir();
  const removed: string[] = [];

  // Claude Code
  if (removeMcpEntry(join(h, '.claude', 'claude_desktop_config.json'))) removed.push('Claude MCP config');
  if (removeNestedEntry(join(h, '.claude', 'settings.json'), 'plugins', 'fire-code')) removed.push('Claude hooks');

  // Cursor
  if (removeMcpEntry(join(h, '.cursor', 'mcp.json'))) removed.push('Cursor MCP');
  if (removeHooksFromFile(join(h, '.cursor', 'hooks.json'), 'hooks')) removed.push('Cursor hooks');

  // Windsurf
  if (removeMcpEntry(join(h, '.codeium', 'windsurf', 'mcp_config.json'))) removed.push('Windsurf MCP');
  if (removeHooksFromFile(join(h, '.codeium', 'windsurf', 'hooks.json'), 'hooks')) removed.push('Windsurf hooks');

  // OpenCode
  if (removeNestedEntry(join(h, '.config', 'opencode', 'config.json'), 'mcp', 'servers', 'fire-code')) removed.push('OpenCode MCP');
  if (removeNestedEntry(join(h, '.config', 'opencode', 'config.json'), 'plugins', 'fire-code')) removed.push('OpenCode plugin');
  const ocPlugin = join(h, '.config', 'opencode', 'plugins', 'fire-code.js');
  if (existsSync(ocPlugin)) { require('fs').unlinkSync(ocPlugin); removed.push('OpenCode plugin file'); }

  // Codex
  if (removeMcpEntry(join(h, '.codex', 'config.json'))) removed.push('Codex MCP');
  if (removeHooksFromFile(join(h, '.codex', 'hooks.json'), 'hooks')) removed.push('Codex hooks');

  // Gemini
  if (removeNestedEntry(join(h, '.gemini', 'settings.json'), 'mcpServers', 'fire-code')) removed.push('Gemini MCP');
  if (removeHooksFromFile(join(h, '.gemini', 'settings.json'), 'hooks')) removed.push('Gemini hooks');

  // Goose
  if (removeMcpEntry(join(h, '.config', 'goose', 'mcp.json'))) removed.push('Goose MCP');

  if (removed.length === 0) { console.log(chalk.yellow('  No Fire Code installations found.\n')); return; }

  for (const f of removed) console.log(chalk.green('  ✓') + ` Removed: ${f}`);
  console.log(chalk.green('\n  ✓ Fire Code uninstalled'));
  console.log(chalk.gray('\n  Restart your IDE to apply changes.\n'));
}
