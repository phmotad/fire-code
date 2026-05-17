import { appendFileSync } from 'fs';
import type { FireCodeConfig } from '../config/types.js';
import { scanFiles } from './FileScanner.js';
import { parseFiles } from './ASTParser.js';
import { buildGraphFromParsed } from './GraphBuilder.js';
import { indexGitHistory } from './GitIndexer.js';
import { buildDocumentsFromFiles, generateEmbeddings } from './EmbeddingGenerator.js';
import { SQLiteGraphStore } from '../graph/SQLiteGraphStore.js';
import type { VectorStore } from '../vector/VectorStore.js';
import { ensureFireCodeDir, getBootstrapLogPath, getFireCodeDir } from '../utils/paths.js';
import { IndexError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { basename } from 'path';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { GitManager } from '../git/GitManager.js';

export interface IndexResult {
  filesIndexed: number;
  functionsFound: number;
  nodesCreated: number;
  edgesCreated: number;
  embeddingsGenerated: number;
  commitsIndexed: number;
  durationMs: number;
}

function getProjectName(cwd: string): string {
  try {
    const { readFileSync } = require('fs');
    const pkg = JSON.parse(readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

export async function indexProject(
  cwd: string,
  config: FireCodeConfig,
  graphStore: SQLiteGraphStore,
  vectorStore: VectorStore,
): Promise<IndexResult> {
  const start = Date.now();

  try {
    ensureFireCodeDir(cwd);
    logger.info({ mode: config.indexing.mode }, 'Starting project indexing');

    // 1. Scan files
    const files = await scanFiles(cwd, config.indexing);
    logger.info({ count: files.length }, 'Files scanned');

    // 2. Parse AST
    const parsed = parseFiles(files);
    const functionsFound = parsed.reduce((acc, f) =>
      acc + f.functions.length + f.classes.reduce((s, cls) => s + cls.methods.length, 0), 0);
    logger.info({ files: parsed.length, functions: functionsFound }, 'AST parsed');

    // 3. Build graph — wrapped in one transaction so we flush only once
    graphStore.runBatch(() => {
      graphStore.clear();
      buildGraphFromParsed(parsed, graphStore);
    });

    // 4. Index git history (CommitNodes + commit→file edges)
    const commitsIndexed = await indexGitHistory(cwd, config.git, graphStore);
    if (commitsIndexed > 0) {
      logger.info({ commits: commitsIndexed }, 'Git history indexed');
    }

    const stats = graphStore.getStats();
    logger.info(stats, 'Graph built');

    // 5. Build embeddings
    const docs = buildDocumentsFromFiles(files);
    const withEmbeddings = await generateEmbeddings(docs);
    await vectorStore.add(withEmbeddings);
    logger.info({ count: withEmbeddings.length }, 'Embeddings generated');

    const durationMs = Date.now() - start;
    const result: IndexResult = {
      filesIndexed: files.length,
      functionsFound,
      nodesCreated: stats.nodes,
      edgesCreated: stats.edges,
      embeddingsGenerated: withEmbeddings.length,
      commitsIndexed,
      durationMs,
    };

    // 7. Persist HEAD hash so get_context can detect stale index
    try {
      const db = DatabaseManager.getInstance(getFireCodeDir(cwd));
      const project = getProjectName(cwd);
      const git = new GitManager(cwd, config.git);
      const headHash = await git.getHeadHash();
      if (headHash) {
        db.setProjectMeta(project, 'indexed_at_hash', headHash);
        db.setProjectMeta(project, 'indexed_at', Date.now().toString());
      }
      db.flush(); // persist all accumulated writes (metadata + any non-transacted ops)
    } catch { /* non-fatal */ }

    // 8. Bootstrap log
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const logLine = `${ts} | ${files.length}f ${functionsFound}fn ${commitsIndexed}commits ${withEmbeddings.length}emb | ${(durationMs / 1000).toFixed(1)}s\n`;
    appendFileSync(getBootstrapLogPath(cwd), logLine);

    logger.info(result, 'Indexing complete');
    return result;
  } catch (err) {
    if (err instanceof IndexError) throw err;
    throw new IndexError('Indexing failed', { cause: String(err) });
  }
}
