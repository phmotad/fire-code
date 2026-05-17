import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../../config/loader.js';
import { indexProject } from '../../indexing/Indexer.js';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { getFireCodeDir } from '../../utils/paths.js';
import { ensureModel, type DownloadProgress } from '../../utils/modelManager.js';
import { basename } from 'path';

export interface IndexCommandOptions {
  mode?: 'full' | 'lazy';
  cwd?: string;
  skipEmbeddings?: boolean;
}

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(require('fs').readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderBar(progress: number, width = 24): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
}

async function downloadModelWithProgress(): Promise<boolean> {
  // Track if we saw real HTTP download traffic (not just cache reads)
  let isDownloading = false;
  let headerPrinted = false;
  let lastFile = '';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spinner: any = ora({ text: chalk.gray('Carregando modelo de embeddings...'), indent: 3 }).start();

  const onProgress = (info: DownloadProgress) => {
    const fileName = info.file.split('/').pop() ?? info.file;

    if (info.status === 'ready') {
      return; // handled after ensureModel()
    }

    // A progress event with pct < 100 means we're actually downloading (not reading from cache)
    if (info.status === 'progress' && info.progress < 100 && !isDownloading) {
      isDownloading = true;
      if (!headerPrinted) {
        spinner.stop();
        console.log(chalk.bold('\n   Modelo de embeddings — Xenova/all-MiniLM-L6-v2'));
        console.log(chalk.gray('   Fazendo download (~23 MB)...\n'));
        spinner = ora({ text: 'Iniciando...', indent: 3 }).start();
        headerPrinted = true;
      }
    }

    if (info.status === 'progress' && isDownloading) {
      lastFile = fileName;
      const pct = Math.round(info.progress);
      const bar = renderBar(pct);
      const loaded = info.total > 0 ? `${formatBytes(info.loaded)} / ${formatBytes(info.total)}` : '';
      spinner.text = `${chalk.cyan(fileName.padEnd(30))} [${bar}] ${String(pct).padStart(3)}%  ${chalk.gray(loaded)}`;
    }

    if (info.status === 'done' && isDownloading && fileName) {
      spinner.text = `${chalk.cyan(fileName.padEnd(30))} [${renderBar(100)}] 100% ✅`;
    }

    if (info.status === 'loading' && isDownloading) {
      spinner.text = chalk.yellow(`Carregando ${lastFile || 'modelo'}...`);
    }
  };

  const pipe = await ensureModel(onProgress);

  if (!pipe) {
    spinner.warn(chalk.yellow('Modelo não disponível — usando similaridade de texto como fallback'));
    return false;
  }

  if (isDownloading) {
    spinner.succeed(chalk.green('Download concluído! Modelo pronto ✅'));
  } else {
    spinner.succeed(chalk.gray('Modelo de embeddings: ') + chalk.green('cache ✅'));
  }

  return true;
}

export async function indexCommand(opts: IndexCommandOptions = {}): Promise<void> {
  const cwd = opts.cwd ?? process.cwd();
  const config = await loadConfig(cwd);

  if (opts.mode) config.indexing.mode = opts.mode;

  console.log(chalk.red.bold('\n🔥 Fire Code — Indexer\n'));
  console.log(chalk.gray(`   Mode: ${config.indexing.mode}`));
  console.log(chalk.gray(`   Working dir: ${cwd}\n`));

  // Step 1: Ensure embedding model is downloaded
  if (!opts.skipEmbeddings) {
    await downloadModelWithProgress();
    console.log();
  }

  // Step 2: Index the project
  const spinner = ora({ text: 'Scanning files...', indent: 3 }).start();

  const project = getProjectName(cwd);
  const db = DatabaseManager.getInstance(getFireCodeDir(cwd));
  const graphStore = db.getGraphStore(project);
  const vectorStore = db.getVectorStore(project);

  try {
    spinner.text = 'Indexando arquivos e gerando embeddings...';
    const result = await indexProject(cwd, config, graphStore, vectorStore);
    spinner.succeed(chalk.green('Indexação completa!'));

    console.log('\n' + chalk.bold('   Resultados:'));
    console.log(chalk.gray(`   Files indexed:      `) + chalk.white(result.filesIndexed));
    console.log(chalk.gray(`   Functions found:    `) + chalk.white(result.functionsFound));
    console.log(chalk.gray(`   Graph nodes:        `) + chalk.white(result.nodesCreated));
    console.log(chalk.gray(`   Graph edges:        `) + chalk.white(result.edgesCreated));
    console.log(chalk.gray(`   Commits indexed:    `) + chalk.white(result.commitsIndexed));
    console.log(chalk.gray(`   Embeddings:         `) + chalk.white(result.embeddingsGenerated));
    console.log(chalk.gray(`   Duration:           `) + chalk.white(`${result.durationMs}ms`));
    console.log(chalk.gray(`\n   Saved to:           `) + chalk.dim('.firecode/'));
    console.log();
  } catch (err) {
    spinner.fail(chalk.red('Indexação falhou'));
    console.error(chalk.red(String(err)));
    process.exit(1);
  }
}
