#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../package.json') as { version: string };
import { initCommand } from './commands/init.js';
import { devCommand } from './commands/dev.js';
import { indexCommand } from './commands/index-cmd.js';
import { installCommand, uninstallCommand } from './commands/install.js';
import { observeCommand, contextCommand, sessionCommand } from './commands/observe.js';
import { daemonStartCommand, daemonStopCommand, daemonStatusCommand, daemonRunCommand } from './commands/daemon.js';
import { corpusBuildCommand, corpusQueryCommand, corpusPrimeCommand } from './commands/corpus.js';

const program = new Command();

program
  .name('fire-code')
  .description(chalk.red('🔥 Fire Code') + ' — Intelligent MCP execution engine for AI coding agents')
  .version(version);

program
  .command('init')
  .description('Initialize Fire Code in the current project')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => {
    await initCommand(opts.cwd);
  });

program
  .command('dev')
  .description('Start the MCP server (stdio mode)')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => {
    await devCommand(opts.cwd);
  });

program
  .command('index')
  .description('Index the project (build graph + embeddings)')
  .option('--mode <mode>', 'Indexing mode: full | lazy', 'lazy')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { mode: 'full' | 'lazy'; cwd: string }) => {
    await indexCommand({ mode: opts.mode, cwd: opts.cwd });
  });

program
  .command('install')
  .description('Install Fire Code plugin (auto-detects IDE, or pass --ide)')
  .option('--ide <ide>', 'Target IDE: claude-code | cursor | windsurf | opencode | codex | gemini | goose | generic')
  .action(async (opts: { ide?: string }) => {
    await installCommand({ ide: opts.ide });
  });

program
  .command('uninstall')
  .description('Remove Fire Code plugin from IDE configs')
  .action(async () => {
    await uninstallCommand();
  });

program
  .command('observe')
  .description('Capture a tool call as an observation (used by hooks)')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--data <json>', 'JSON payload with tool/input/result/sessionId/project')
  .action(async (opts: { cwd: string; data?: string }) => {
    await observeCommand(opts);
  });

program
  .command('context')
  .description('Print rich memory context for the current project')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--limit <n>', 'Number of observations to include', '10')
  .option('--file <path>', 'Filter by file path')
  .action(async (opts: { cwd: string; limit: string; file?: string }) => {
    await contextCommand({ cwd: opts.cwd, limit: parseInt(opts.limit, 10), file: opts.file });
  });

program
  .command('session')
  .description('Manage session lifecycle (start | end | summarize)')
  .argument('<subcommand>', 'start | end | summarize')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--id <id>', 'Session ID')
  .action(async (subcommand: string, opts: { cwd: string; id?: string }) => {
    if (!['start', 'end', 'summarize'].includes(subcommand)) {
      console.error(chalk.red(`Unknown session subcommand: ${subcommand}`));
      process.exit(1);
    }
    await sessionCommand({ cwd: opts.cwd, id: opts.id, subcommand: subcommand as 'start' | 'end' | 'summarize' });
  });

// ── Daemon ─────────────────────────────────────────────────────────────────

const daemon = program.command('daemon').description('Manage the persistent Fire Code daemon');

daemon
  .command('start')
  .description('Start the daemon (background HTTP server on port 37778)')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => { await daemonStartCommand(opts.cwd); });

daemon
  .command('stop')
  .description('Stop the daemon')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => { await daemonStopCommand(opts.cwd); });

daemon
  .command('status')
  .description('Show daemon status')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => { await daemonStatusCommand(opts.cwd); });

daemon
  .command('_run')
  .description('Internal: run daemon in-process (do not call directly)')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => { await daemonRunCommand(opts.cwd); });

// ── Corpus ─────────────────────────────────────────────────────────────────

const corpus = program.command('corpus').description('Manage the knowledge corpus');

corpus
  .command('build')
  .description('Index documentation and text files into the corpus')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--include-code', 'Also include source code files')
  .action(async (opts: { cwd: string; includeCode?: boolean }) => {
    await corpusBuildCommand(opts);
  });

corpus
  .command('query <text>')
  .description('Search the knowledge corpus')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--limit <n>', 'Max results', '5')
  .action(async (text: string, opts: { cwd: string; limit: string }) => {
    await corpusQueryCommand(text, { cwd: opts.cwd, limit: parseInt(opts.limit, 10) });
  });

corpus
  .command('prime')
  .description('Add a single item to the corpus')
  .option('--cwd <path>', 'Working directory', process.cwd())
  .option('--title <title>', 'Title for the corpus entry')
  .option('--content <text>', 'Content to store')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--private', 'Mark as private (never sent to LLM)')
  .action(async (opts: { cwd: string; title?: string; content?: string; tags?: string; private?: boolean }) => {
    if (!opts.title || !opts.content) {
      console.error(chalk.red('--title and --content are required'));
      process.exit(1);
    }
    const tags = opts.tags ? opts.tags.split(',').map(t => t.trim()) : [];
    await corpusPrimeCommand({ cwd: opts.cwd, title: opts.title, content: opts.content, tags, private: opts.private });
  });

// ── Update ─────────────────────────────────────────────────────────────────

program
  .command('update')
  .description('Update Fire Code to the latest version')
  .action(async () => {
    const { execSync } = await import('child_process');
    console.log(chalk.blue('Updating fire-code…'));
    try {
      execSync('npm install -g fire-code@latest', { stdio: 'inherit' });
      console.log(chalk.green('✓ fire-code updated successfully'));
    } catch {
      console.error(chalk.red('Update failed. Try: npm install -g fire-code@latest'));
      process.exit(1);
    }
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(chalk.red('Error:'), String(err));
  process.exit(1);
});
