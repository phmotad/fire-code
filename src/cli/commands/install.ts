import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';
import chalk from 'chalk';
import ora from 'ora';

// __dirname is CJS-native; resolves to dist/cli/commands → 3 levels up = package root
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

interface InstallOptions {
  ide?: string;
  cwd?: string;
}

type IdeTarget = 'claude-code' | 'cursor' | 'windsurf';

const SUPPORTED_IDES: IdeTarget[] = ['claude-code', 'cursor', 'windsurf'];

function claudeSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function claudeMcpConfigPath(): string {
  return join(homedir(), '.claude', 'claude_desktop_config.json');
}

function readJson(filePath: string): Record<string, unknown> {
  try {
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: Record<string, unknown>): void {
  const dir = filePath.substring(0, filePath.lastIndexOf('/'));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function installClaudeCode(): void {
  // Register MCP server in Claude settings
  const mcpPath = claudeMcpConfigPath();
  const config = readJson(mcpPath);

  if (!config['mcpServers']) config['mcpServers'] = {};
  const servers = config['mcpServers'] as Record<string, unknown>;

  servers['fire-code'] = {
    command: 'npx',
    args: ['fire-code', 'dev'],
    description: 'Fire Code — intelligent MCP execution engine',
  };

  writeJson(mcpPath, config);
  console.log(chalk.green('  ✓') + ' MCP server registered in Claude config');

  // Register plugin hooks in Claude settings
  const settingsPath = claudeSettingsPath();
  const settings = readJson(settingsPath);

  if (!settings['plugins']) settings['plugins'] = {};
  const plugins = settings['plugins'] as Record<string, unknown>;

  plugins['fire-code'] = {
    enabled: true,
    hooksPath: join(PLUGIN_ROOT, 'plugin', 'hooks', 'hooks.json'),
  };

  writeJson(settingsPath, settings);
  console.log(chalk.green('  ✓') + ' Plugin hooks registered in Claude settings');
}

function installCursor(): void {
  const cursorDir = join(homedir(), '.cursor');
  const mcpPath = join(cursorDir, 'mcp.json');
  const config = readJson(mcpPath);

  if (!config['mcpServers']) config['mcpServers'] = {};
  (config['mcpServers'] as Record<string, unknown>)['fire-code'] = {
    command: 'npx',
    args: ['fire-code', 'dev'],
  };

  writeJson(mcpPath, config);
  console.log(chalk.green('  ✓') + ' MCP server registered in Cursor config');
}

function installWindsurf(): void {
  const windsurfDir = join(homedir(), '.windsurf');
  const mcpPath = join(windsurfDir, 'mcp.json');
  const config = readJson(mcpPath);

  if (!config['mcpServers']) config['mcpServers'] = {};
  (config['mcpServers'] as Record<string, unknown>)['fire-code'] = {
    command: 'npx',
    args: ['fire-code', 'dev'],
  };

  writeJson(mcpPath, config);
  console.log(chalk.green('  ✓') + ' MCP server registered in Windsurf config');
}

export async function installCommand(opts: InstallOptions = {}): Promise<void> {
  const ide = (opts.ide ?? 'claude-code') as IdeTarget;

  console.log(chalk.red('\n  🔥 Fire Code') + chalk.gray(' — install\n'));

  if (!SUPPORTED_IDES.includes(ide)) {
    console.error(chalk.red(`  Unknown IDE: ${ide}`));
    console.error(chalk.gray(`  Supported: ${SUPPORTED_IDES.join(', ')}`));
    process.exit(1);
  }

  const spinner = ora({ text: `Installing for ${chalk.bold(ide)}...`, color: 'red' }).start();

  try {
    switch (ide) {
      case 'claude-code':
        spinner.stop();
        installClaudeCode();
        break;
      case 'cursor':
        spinner.stop();
        installCursor();
        break;
      case 'windsurf':
        spinner.stop();
        installWindsurf();
        break;
    }

    console.log(chalk.green('\n  ✓ Fire Code installed successfully!\n'));
    console.log(chalk.gray('  Next steps:'));
    console.log(chalk.gray('    1. Restart ' + ide));
    console.log(chalk.gray('    2. Run: ') + chalk.white('fire-code index') + chalk.gray(' in your project'));
    console.log(chalk.gray('    3. The MCP tools (get_context, search_code, get_graph, execute) are now available\n'));
  } catch (err) {
    spinner.fail(chalk.red('Installation failed'));
    console.error(chalk.red('  Error:'), String(err));
    process.exit(1);
  }
}

export async function uninstallCommand(): Promise<void> {
  console.log(chalk.red('\n  🔥 Fire Code') + chalk.gray(' — uninstall\n'));

  const spinner = ora({ text: 'Removing Fire Code...', color: 'red' }).start();

  try {
    // Remove from Claude MCP config
    const mcpPath = claudeMcpConfigPath();
    const config = readJson(mcpPath);
    if (config['mcpServers']) {
      delete (config['mcpServers'] as Record<string, unknown>)['fire-code'];
      writeJson(mcpPath, config);
    }

    // Remove plugin hooks from Claude settings
    const settingsPath = claudeSettingsPath();
    const settings = readJson(settingsPath);
    if (settings['plugins']) {
      delete (settings['plugins'] as Record<string, unknown>)['fire-code'];
      writeJson(settingsPath, settings);
    }

    spinner.succeed(chalk.green('Fire Code uninstalled'));
    console.log(chalk.gray('\n  Restart Claude Code to apply changes.\n'));
  } catch (err) {
    spinner.fail(chalk.red('Uninstall failed'));
    console.error(chalk.red('  Error:'), String(err));
    process.exit(1);
  }
}
