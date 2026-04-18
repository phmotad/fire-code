import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';

// __dirname is CJS-native; resolves to dist/cli/commands → 3 levels up = package root
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

export type IdeTarget =
  | 'claude-code'
  | 'cursor'
  | 'windsurf'
  | 'opencode'
  | 'codex'
  | 'gemini'
  | 'goose'
  | 'generic';

const SUPPORTED_IDES: IdeTarget[] = [
  'claude-code',
  'cursor',
  'windsurf',
  'opencode',
  'codex',
  'gemini',
  'goose',
  'generic',
];

interface InstallOptions {
  ide?: string;
  cwd?: string;
}

const MCP_SERVER_ENTRY = {
  command: 'npx',
  args: ['@phmotad/fire-code', 'dev'],
  description: 'Fire Code — intelligent MCP execution engine',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function readJson(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  const dir = filePath.substring(0, filePath.lastIndexOf('/') === -1
    ? filePath.lastIndexOf('\\')
    : filePath.lastIndexOf('/'));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function registerMcp(mcpPath: string, serverKey = 'fire-code'): void {
  const config = readJson(mcpPath);
  if (!config['mcpServers']) config['mcpServers'] = {};
  (config['mcpServers'] as Record<string, unknown>)[serverKey] = MCP_SERVER_ENTRY;
  writeJson(mcpPath, config);
}

// ── Per-IDE installers ───────────────────────────────────────────────────────

function installClaudeCode(): string[] {
  const messages: string[] = [];

  // MCP server
  const mcpPath = join(homedir(), '.claude', 'claude_desktop_config.json');
  registerMcp(mcpPath);
  messages.push('MCP server registered in ~/.claude/claude_desktop_config.json');

  // Plugin hooks
  const settingsPath = join(homedir(), '.claude', 'settings.json');
  const settings = readJson(settingsPath);
  if (!settings['plugins']) settings['plugins'] = {};
  (settings['plugins'] as Record<string, unknown>)['fire-code'] = {
    enabled: true,
    hooksPath: join(PLUGIN_ROOT, 'plugin', 'hooks', 'hooks.json'),
  };
  writeJson(settingsPath, settings);
  messages.push('Plugin hooks registered in ~/.claude/settings.json');

  return messages;
}

function installCursor(): string[] {
  const mcpPath = join(homedir(), '.cursor', 'mcp.json');
  registerMcp(mcpPath);
  return ['MCP server registered in ~/.cursor/mcp.json'];
}

function installWindsurf(): string[] {
  // Windsurf stores MCP config in ~/.codeium/windsurf/mcp_config.json
  const mcpPath = join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
  registerMcp(mcpPath);
  return ['MCP server registered in ~/.codeium/windsurf/mcp_config.json'];
}

function installOpenCode(): string[] {
  // OpenCode uses ~/.config/opencode/config.json with mcp section
  const configPath = join(homedir(), '.config', 'opencode', 'config.json');
  const config = readJson(configPath);
  if (!config['mcp']) config['mcp'] = {};
  const mcp = config['mcp'] as Record<string, unknown>;
  if (!mcp['servers']) mcp['servers'] = {};
  (mcp['servers'] as Record<string, unknown>)['fire-code'] = MCP_SERVER_ENTRY;
  writeJson(configPath, config);
  return ['MCP server registered in ~/.config/opencode/config.json'];
}

function installCodex(): string[] {
  // Codex CLI uses ~/.codex/config.json
  const configPath = join(homedir(), '.codex', 'config.json');
  registerMcp(configPath);
  return ['MCP server registered in ~/.codex/config.json'];
}

function installGemini(): string[] {
  // Gemini CLI uses ~/.gemini/settings.json
  const settingsPath = join(homedir(), '.gemini', 'settings.json');
  const settings = readJson(settingsPath);
  if (!settings['mcpServers']) settings['mcpServers'] = {};
  (settings['mcpServers'] as Record<string, unknown>)['fire-code'] = MCP_SERVER_ENTRY;
  writeJson(settingsPath, settings);
  return ['MCP server registered in ~/.gemini/settings.json'];
}

function installGoose(): string[] {
  // Goose uses ~/.config/goose/config.yaml — write as JSON config fallback
  const configPath = join(homedir(), '.config', 'goose', 'mcp.json');
  registerMcp(configPath);
  return ['MCP server registered in ~/.config/goose/mcp.json'];
}

function installGeneric(): string[] {
  // Write a standalone mcp.json in the current directory for manual wiring
  const mcpPath = join(process.cwd(), '.firecode', 'mcp.json');
  const config: Record<string, unknown> = {
    mcpServers: { 'fire-code': MCP_SERVER_ENTRY },
  };
  if (!existsSync(join(process.cwd(), '.firecode'))) {
    mkdirSync(join(process.cwd(), '.firecode'), { recursive: true });
  }
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
  return [
    'MCP config written to .firecode/mcp.json',
    'Point your IDE\'s MCP setting to this file to complete setup',
  ];
}

// ── agents.md ────────────────────────────────────────────────────────────────

function writeAgentsMd(cwd: string): void {
  const dest = join(cwd, 'agents.md');
  if (existsSync(dest)) return;
  try {
    const src = join(PLUGIN_ROOT, 'plugin', 'agents.md');
    const content = existsSync(src) ? readFileSync(src, 'utf8') : defaultAgentsMd();
    writeFileSync(dest, content, 'utf8');
  } catch { /* best-effort */ }
}

function defaultAgentsMd(): string {
  return `# Fire Code — Agent Instructions

> This file is read automatically by your AI coding agent. Do not delete it.

You have Fire Code MCP tools available. **Use them without waiting to be asked.**

| Situation | Call |
|---|---|
| Before writing any code | \`firecode.smart_search({ query })\` then \`firecode.corpus_search({ query })\` |
| Before reading a file | \`firecode.smart_outline({ file_path })\` |
| Task touches > 2 files | \`firecode.get_context({ query: task })\` |
| Implement / fix / refactor | \`firecode.execute({ task, agent: "dev" })\` |
| Plan / design / coordinate | \`firecode.execute({ task, agent: "supervisor" })\` |
| Audit / review / inspect | \`firecode.execute({ task, agent: "review" })\` |
| Recall past work | \`firecode.observations({ query })\` |
`;
}

// ── Auto-detection ───────────────────────────────────────────────────────────

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

// ── Main command ─────────────────────────────────────────────────────────────

export async function installCommand(opts: InstallOptions = {}): Promise<void> {
  console.log(chalk.red('\n  🔥 Fire Code') + chalk.gray(' — install\n'));

  let ide = opts.ide as IdeTarget | undefined;

  if (!ide || ide === 'claude-code') {
    // Default: try auto-detect, fall back to claude-code
    const detected = detectIde();
    if (!ide) {
      ide = detected;
      if (ide !== 'claude-code') {
        console.log(chalk.gray(`  Auto-detected IDE: ${chalk.bold(ide)}\n`));
      }
    }
  }

  if (!SUPPORTED_IDES.includes(ide as IdeTarget)) {
    console.error(chalk.red(`  Unknown IDE: ${ide}`));
    console.error(chalk.gray(`  Supported: ${SUPPORTED_IDES.join(', ')}`));
    process.exit(1);
  }

  const spinner = ora({ text: `Installing for ${chalk.bold(ide)}...`, color: 'red' }).start();

  try {
    spinner.stop();
    let messages: string[];

    switch (ide as IdeTarget) {
      case 'claude-code': messages = installClaudeCode(); break;
      case 'cursor':      messages = installCursor(); break;
      case 'windsurf':    messages = installWindsurf(); break;
      case 'opencode':    messages = installOpenCode(); break;
      case 'codex':       messages = installCodex(); break;
      case 'gemini':      messages = installGemini(); break;
      case 'goose':       messages = installGoose(); break;
      case 'generic':     messages = installGeneric(); break;
      default:            messages = installGeneric();
    }

    for (const msg of messages) {
      console.log(chalk.green('  ✓') + ' ' + msg);
    }

    const projectCwd = opts.cwd ?? process.cwd();
    writeAgentsMd(projectCwd);
    console.log(chalk.green('  ✓') + ' agents.md written to project root');

    const hasHooks = ide === 'claude-code';
    console.log(chalk.green('\n  ✓ Fire Code installed successfully!\n'));
    console.log(chalk.gray('  Next steps:'));
    console.log(chalk.gray(`    1. Restart ${ide}`));
    console.log(chalk.gray('    2. Run: ') + chalk.white('fire-code index') + chalk.gray(' in your project'));
    if (hasHooks) {
      console.log(chalk.gray('    3. Hooks (SessionStart, PostToolUse) are active for auto re-indexing'));
    } else {
      console.log(chalk.gray('    3. MCP tools available: smart_search, get_context, search_code, get_graph, execute'));
    }
    console.log();
  } catch (err) {
    spinner.fail(chalk.red('Installation failed'));
    console.error(chalk.red('  Error:'), String(err));
    process.exit(1);
  }
}

// ── Uninstall helpers ────────────────────────────────────────────────────────

function removeMcpEntry(filePath: string, serverKey = 'fire-code'): boolean {
  if (!existsSync(filePath)) return false;
  const config = readJson(filePath);
  if (!config['mcpServers']) return false;
  if (!(config['mcpServers'] as Record<string, unknown>)[serverKey]) return false;
  delete (config['mcpServers'] as Record<string, unknown>)[serverKey];
  writeJson(filePath, config);
  return true;
}

function removeNestedEntry(
  filePath: string,
  ...keys: string[]
): boolean {
  if (!existsSync(filePath)) return false;
  const config = readJson(filePath);
  let node: Record<string, unknown> = config;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!node[keys[i]]) return false;
    node = node[keys[i]] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (!node[last]) return false;
  delete node[last];
  writeJson(filePath, config);
  return true;
}

export async function uninstallCommand(): Promise<void> {
  console.log(chalk.red('\n  🔥 Fire Code') + chalk.gray(' — uninstall\n'));

  const spinner = ora({ text: 'Removing Fire Code...', color: 'red' }).start();
  spinner.stop();

  try {
    const h = homedir();
    const removed: string[] = [];

    // Claude Code — MCP config
    if (removeMcpEntry(join(h, '.claude', 'claude_desktop_config.json')))
      removed.push('claude_desktop_config.json');

    // Claude Code — hooks
    if (removeNestedEntry(join(h, '.claude', 'settings.json'), 'plugins', 'fire-code'))
      removed.push('Claude settings.json (hooks)');

    // Cursor
    if (removeMcpEntry(join(h, '.cursor', 'mcp.json')))
      removed.push('.cursor/mcp.json');

    // Windsurf
    if (removeMcpEntry(join(h, '.codeium', 'windsurf', 'mcp_config.json')))
      removed.push('.codeium/windsurf/mcp_config.json');

    // OpenCode
    if (removeNestedEntry(join(h, '.config', 'opencode', 'config.json'), 'mcp', 'servers', 'fire-code'))
      removed.push('.config/opencode/config.json');

    // Codex CLI
    if (removeMcpEntry(join(h, '.codex', 'config.json')))
      removed.push('.codex/config.json');

    // Gemini CLI
    if (removeNestedEntry(join(h, '.gemini', 'settings.json'), 'mcpServers', 'fire-code'))
      removed.push('.gemini/settings.json');

    // Goose
    if (removeMcpEntry(join(h, '.config', 'goose', 'mcp.json')))
      removed.push('.config/goose/mcp.json');

    if (removed.length === 0) {
      console.log(chalk.yellow('  No Fire Code installations found.\n'));
      return;
    }

    for (const f of removed) {
      console.log(chalk.green('  ✓') + ` Removed from ${f}`);
    }

    console.log(chalk.green('\n  ✓ Fire Code uninstalled'));
    console.log(chalk.gray('\n  Restart your IDE to apply changes.\n'));
  } catch (err) {
    spinner.fail(chalk.red('Uninstall failed'));
    console.error(chalk.red('  Error:'), String(err));
    process.exit(1);
  }
}
