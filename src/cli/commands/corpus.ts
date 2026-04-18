import chalk from 'chalk';
import ora from 'ora';
import { CorpusService } from '../../services/CorpusService.js';
import { getFireCodeDir } from '../../utils/paths.js';
import { existsSync } from 'fs';

interface CorpusBuildOptions { cwd: string; includeCode?: boolean }
interface CorpusQueryOptions { cwd: string; limit?: number }
interface CorpusPrimeOptions { cwd: string; title: string; content: string; tags?: string[]; private?: boolean }

export async function corpusBuildCommand(opts: CorpusBuildOptions): Promise<void> {
  const firedotDir = getFireCodeDir(opts.cwd);
  if (!existsSync(firedotDir)) {
    console.error(chalk.red('No Fire Code index found. Run: fire-code index'));
    process.exit(1);
  }

  const spinner = ora('Building knowledge corpus…').start();
  const svc = new CorpusService(opts.cwd);

  try {
    const { added, skipped } = await svc.build({ includeCode: opts.includeCode });
    spinner.succeed(chalk.green(`Corpus built: ${added} chunks added, ${skipped} files skipped`));
  } catch (err) {
    spinner.fail(chalk.red(`Failed: ${String(err)}`));
    process.exit(1);
  }
}

export async function corpusQueryCommand(query: string, opts: CorpusQueryOptions): Promise<void> {
  const firedotDir = getFireCodeDir(opts.cwd);
  if (!existsSync(firedotDir)) {
    console.error(chalk.red('No corpus. Run: fire-code corpus build'));
    process.exit(1);
  }

  const svc = new CorpusService(opts.cwd);
  const results = svc.query(query, opts.limit ?? 5);

  if (results.length === 0) {
    console.log(chalk.yellow(`No results for: "${query}"`));
    return;
  }

  for (const r of results) {
    console.log(chalk.bold.blue(`\n## ${r.title}`));
    if (r.source) console.log(chalk.gray(`source: ${r.source}`));
    console.log(r.content.slice(0, 400));
  }
}

export async function corpusPrimeCommand(opts: CorpusPrimeOptions): Promise<void> {
  const firedotDir = getFireCodeDir(opts.cwd);
  if (!existsSync(firedotDir)) {
    console.error(chalk.red('No Fire Code index. Run: fire-code index'));
    process.exit(1);
  }

  const svc = new CorpusService(opts.cwd);
  svc.prime(opts.title, opts.content, opts.tags, opts.private ?? false);
  console.log(chalk.green(`✓ Corpus item "${opts.title}" added`));
}
