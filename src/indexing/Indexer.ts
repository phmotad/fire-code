import { writeFileSync, appendFileSync } from 'fs';
import type { FireCodeConfig } from '../config/types.js';
import { scanFiles } from './FileScanner.js';
import { parseFiles } from './ASTParser.js';
import { buildGraphFromParsed } from './GraphBuilder.js';
import { buildDocumentsFromFiles, generateEmbeddings } from './EmbeddingGenerator.js';
import { SQLiteGraphStore } from '../graph/SQLiteGraphStore.js';
import { MemoryVectorStore } from '../vector/MemoryVectorStore.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { ensureFireCodeDir, getFireCodeDir, getVectorsPath, getBootstrapLogPath } from '../utils/paths.js';
import { IndexError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { basename } from 'path';

export interface IndexResult {
  filesIndexed: number;
  functionsFound: number;
  nodesCreated: number;
  edgesCreated: number;
  embeddingsGenerated: number;
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
  vectorStore: MemoryVectorStore,
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
    const functionsFound = parsed.reduce((acc, f) => acc + f.functions.length, 0);
    logger.info({ files: parsed.length, functions: functionsFound }, 'AST parsed');

    // 3. Build graph (clears previous data for this project, then re-inserts)
    graphStore.clear();
    buildGraphFromParsed(parsed, graphStore);
    const stats = graphStore.getStats();
    logger.info(stats, 'Graph built');

    // 4. Build embeddings
    const docs = buildDocumentsFromFiles(files);
    const withEmbeddings = await generateEmbeddings(docs);
    await vectorStore.add(withEmbeddings);
    logger.info({ count: withEmbeddings.length }, 'Embeddings generated');

    // 5. Persist vectors (graph already persisted in SQLite)
    writeFileSync(getVectorsPath(cwd), vectorStore.serialize());

    const durationMs = Date.now() - start;
    const result: IndexResult = {
      filesIndexed: files.length,
      functionsFound,
      nodesCreated: stats.nodes,
      edgesCreated: stats.edges,
      embeddingsGenerated: withEmbeddings.length,
      durationMs,
    };

    // 6. Bootstrap log
    const logLine = `[${new Date().toISOString()}] Indexed: ${files.length} files, ${functionsFound} functions, ${withEmbeddings.length} embeddings (${durationMs}ms)\n`;
    appendFileSync(getBootstrapLogPath(cwd), logLine);

    logger.info(result, 'Indexing complete');
    return result;
  } catch (err) {
    if (err instanceof IndexError) throw err;
    throw new IndexError('Indexing failed', { cause: String(err) });
  }
}
