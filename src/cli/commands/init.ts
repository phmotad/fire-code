import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { ensureFireCodeDir } from '../../utils/paths.js';

const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

function writeAgentsMd(cwd: string): void {
  const dest = join(cwd, 'agents.md');
  if (existsSync(dest)) return; // never overwrite user edits
  try {
    const src = join(PLUGIN_ROOT, 'plugin', 'agents.md');
    const content = existsSync(src)
      ? readFileSync(src, 'utf8')
      : generateAgentMd();
    writeFileSync(dest, content, 'utf8');
  } catch { /* best-effort */ }
}

function generateAgentMd(): string {
  return `# Fire Code — Agent Instructions

> Read automatically by Claude Code. Do not delete.

You have Fire Code MCP tools. **Use them without waiting to be asked.**

## Autonomous Triggers

| Situation | Call |
|---|---|
| Before writing any code | \`firecode.smart_search({ query })\` then \`firecode.corpus_search({ query })\` |
| Before reading a file | \`firecode.smart_outline({ file_path })\` |
| Task touches > 2 files | \`firecode.get_context({ query: task })\` |
| Implement / fix / refactor | \`firecode.execute({ task, agent: "dev" })\` |
| Plan / design / coordinate | \`firecode.execute({ task, agent: "supervisor" })\` |
| Audit / review / inspect | \`firecode.execute({ task, agent: "review" })\` |
| Recall past work | \`firecode.observations({ query })\` |

## Do NOT
- Read entire files when \`smart_outline\` suffices
- Write code directly when \`firecode.execute\` can do it with Git traceability
- Use grep/glob for symbols — use \`firecode.smart_search\`
- Implement without searching first — duplication is the main cost
`;
}

interface InitAnswers {
  projectName: string;
  mode: 'standard' | 'legacy';
  llmProvider: 'openrouter' | 'anthropic' | 'openai' | 'ollama';
  apiKey: string;
  model: string;
  gitEnabled: boolean;
  branchStrategy: 'reuse' | 'increment' | 'fail';
  workingTree: 'stash' | 'commit' | 'fail' | 'ignore';
  indexingMode: 'lazy' | 'full';
}

const DEFAULT_MODELS: Record<string, string> = {
  openrouter: 'deepseek/deepseek-coder',
  anthropic: 'claude-sonnet-4-6',
  openai: 'gpt-4o',
  ollama: 'llama3',
};

export async function initCommand(cwd: string = process.cwd()): Promise<void> {
  console.log(chalk.red.bold('\n🔥 Fire Code — Init\n'));

  const hasExistingCode = existsSync(join(cwd, 'package.json')) || existsSync(join(cwd, 'src'));
  if (hasExistingCode) {
    console.log(chalk.yellow('  Existing project detected — legacy mode available.\n'));
  }

  const answers = await inquirer.prompt<InitAnswers>([
    {
      type: 'input',
      name: 'projectName',
      message: 'Project name:',
      default: cwd.split('/').pop() ?? 'my-project',
    },
    {
      type: 'list',
      name: 'mode',
      message: 'Project mode:',
      choices: [
        { name: 'standard — clean project, enforce patterns from start', value: 'standard' },
        { name: 'legacy  — existing messy project, adapt gradually', value: 'legacy' },
      ],
      default: hasExistingCode ? 'legacy' : 'standard',
    },
    {
      type: 'list',
      name: 'llmProvider',
      message: 'LLM Provider:',
      choices: ['openrouter', 'anthropic', 'openai', 'ollama'],
      default: 'openrouter',
    },
    {
      type: 'input',
      name: 'model',
      message: 'Model:',
      default: (ans: Partial<InitAnswers>) => DEFAULT_MODELS[ans.llmProvider ?? 'openrouter'],
    },
    {
      type: 'password',
      name: 'apiKey',
      message: 'API Key (leave blank if using env var):',
      when: (ans: Partial<InitAnswers>) => ans.llmProvider !== 'ollama',
    },
    {
      type: 'confirm',
      name: 'gitEnabled',
      message: 'Enable Git integration (branch + commit)?',
      default: true,
    },
    {
      type: 'list',
      name: 'branchStrategy',
      message: 'Branch conflict strategy:',
      choices: [
        { name: 'reuse     — checkout existing branch', value: 'reuse' },
        { name: 'increment — create branch-2, branch-3...', value: 'increment' },
        { name: 'fail      — error if branch exists', value: 'fail' },
      ],
      default: 'reuse',
      when: (ans: Partial<InitAnswers>) => ans.gitEnabled,
    },
    {
      type: 'list',
      name: 'workingTree',
      message: 'Dirty working tree strategy:',
      choices: [
        { name: 'stash  — auto-stash and continue (recommended)', value: 'stash' },
        { name: 'commit — auto-commit dirty files', value: 'commit' },
        { name: 'fail   — block execution', value: 'fail' },
        { name: 'ignore — proceed anyway', value: 'ignore' },
      ],
      default: 'stash',
      when: (ans: Partial<InitAnswers>) => ans.gitEnabled,
    },
    {
      type: 'list',
      name: 'indexingMode',
      message: 'Indexing mode:',
      choices: [
        { name: 'lazy — index on-demand (recommended for large projects)', value: 'lazy' },
        { name: 'full — index everything upfront', value: 'full' },
      ],
      default: 'lazy',
    },
  ]);

  const apiKeyLine = answers.apiKey
    ? `\n    apiKey: process.env.${answers.llmProvider.toUpperCase()}_API_KEY ?? ${JSON.stringify(answers.apiKey)},`
    : `\n    apiKey: process.env.${answers.llmProvider.toUpperCase()}_API_KEY,`;

  const config = `import type { FireCodeConfig } from 'fire-code';

const config: FireCodeConfig = {
  project: {
    name: ${JSON.stringify(answers.projectName)},
    mode: ${JSON.stringify(answers.mode)},
  },

  llm: {
    provider: ${JSON.stringify(answers.llmProvider)},
    model: ${JSON.stringify(answers.model)},${apiKeyLine}
  },

  embeddings: {
    provider: 'local',
  },

  vectorStore: {
    provider: 'memory',
  },

  graphStore: {
    provider: 'memory',
  },

  memory: {
    strategy: 'auto',
  },

  git: {
    enabled: ${answers.gitEnabled},
    autoBranch: ${answers.gitEnabled},
    branchPrefix: 'firecode/',
    branchStrategy: ${JSON.stringify(answers.branchStrategy ?? 'reuse')},
    autoCommit: ${answers.gitEnabled},
    commitFormat: 'conventional',
    includeMetadata: true,
    workingTree: ${JSON.stringify(answers.workingTree ?? 'stash')},
    enforcePattern: false,
  },

  execution: {
    mode: 'safe',
    dryRun: false,
    conflictStrategy: 'fail',
    validateSyntax: true,
  },

  indexing: {
    mode: ${JSON.stringify(answers.indexingMode)},
    include: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    exclude: ['node_modules/**', 'dist/**', '.firecode/**'],
  },
};

export default config;
`;

  const configPath = join(cwd, 'firecode.config.ts');
  writeFileSync(configPath, config);
  ensureFireCodeDir(cwd);
  writeAgentsMd(cwd);

  console.log('\n' + chalk.green('✓ Created firecode.config.ts'));
  console.log(chalk.green('✓ Created .firecode/'));
  console.log(chalk.green('✓ Created agents.md') + chalk.gray(' — agent autonomous trigger rules'));
  console.log('\n' + chalk.bold('Next steps:'));
  console.log(chalk.gray('  1. ') + chalk.white('fire-code index') + chalk.gray('   — index your project'));
  console.log(chalk.gray('  2. ') + chalk.white('fire-code dev') + chalk.gray('     — start MCP server'));
  console.log(chalk.gray('  3. ') + chalk.white('Add to claude_desktop_config.json as MCP server'));
  console.log();
}
