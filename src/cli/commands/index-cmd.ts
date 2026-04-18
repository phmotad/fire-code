import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { indexProject } from '../../indexing/Indexer.js';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { MemoryVectorStore } from '../../vector/MemoryVectorStore.js';
import { getFireCodeDir } from '../../utils/paths.js';
import { basename } from 'path';

export interface IndexCommandOptions {
  mode?: 'full' | 'lazy';
  cwd?: string;
}

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(require('fs').readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

export async function indexCommand(opts: IndexCommandOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  if (opts.mode) config.indexing.mode = opts.mode;

  console.log(chalk.red.bold('\n🔥 Fire Code — Indexer\n'));
  console.log(chalk.gray(`   Mode: ${config.indexing.mode}`));
  console.log(chalk.gray(`   Working dir: ${cwd}\n`));

  const spinner = ora('Scanning files...').start();

  const project = getProjectName(cwd);
  const db = DatabaseManager.getInstance(getFireCodeDir(cwd));
  const graphStore = db.getGraphStore(project);
  const vectorStore = new MemoryVectorStore();

  try {
    spinner.text = 'Scanning files...';
    const result = await indexProject(cwd, config, graphStore, vectorStore);
    spinner.succeed(chalk.green('Indexing complete!'));

    console.log('\n' + chalk.bold('Results:'));
    console.log(chalk.gray(`  Files indexed:      `) + chalk.white(result.filesIndexed));
    console.log(chalk.gray(`  Functions found:    `) + chalk.white(result.functionsFound));
    console.log(chalk.gray(`  Graph nodes:        `) + chalk.white(result.nodesCreated));
    console.log(chalk.gray(`  Graph edges:        `) + chalk.white(result.edgesCreated));
    console.log(chalk.gray(`  Embeddings:         `) + chalk.white(result.embeddingsGenerated));
    console.log(chalk.gray(`  Duration:           `) + chalk.white(`${result.durationMs}ms`));
    console.log(chalk.gray(`\n  Saved to:           `) + chalk.dim('.firecode/'));
    console.log();
  } catch (err) {
    spinner.fail(chalk.red('Indexing failed'));
    console.error(chalk.red(String(err)));
    process.exit(1);
  }
}
