import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, extname, relative } from 'path';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { getFireCodeDir } from '../utils/paths.js';
import { sanitizeForLLM, isPrivateFile } from '../utils/privacy.js';
import { logger } from '../utils/logger.js';

const TEXT_EXTENSIONS = new Set(['.md', '.txt', '.rst', '.mdx', '.mdc']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.firecode', 'coverage', '.next', 'build']);
const MAX_FILE_BYTES = 100_000;

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? require('path').basename(cwd);
  } catch { return require('path').basename(cwd); }
}

// Walk directory, collecting text-heavy files
function walkDocs(dir: string, cwd: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return results; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const fullPath = join(dir, entry);
    let stat;
    try { stat = statSync(fullPath); } catch { continue; }

    if (stat.isDirectory()) {
      results.push(...walkDocs(fullPath, cwd));
    } else if (stat.isFile() && TEXT_EXTENSIONS.has(extname(entry).toLowerCase())) {
      if (stat.size <= MAX_FILE_BYTES) results.push(fullPath);
    }
  }
  return results;
}

// Split document into manageable chunks by heading or paragraph
function chunkDocument(content: string, maxChunk = 1_500): string[] {
  // Split on markdown headings first
  const sections = content.split(/(?=\n#{1,3} )/);
  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= maxChunk) {
      chunks.push(section.trim());
    } else {
      // Split long sections by paragraph
      const paragraphs = section.split(/\n\n+/);
      let current = '';
      for (const para of paragraphs) {
        if (current.length + para.length > maxChunk && current) {
          chunks.push(current.trim());
          current = para;
        } else {
          current += '\n\n' + para;
        }
      }
      if (current.trim()) chunks.push(current.trim());
    }
  }
  return chunks.filter(c => c.length > 50);
}

export class CorpusService {
  private db: DatabaseManager;
  private project: string;

  constructor(private cwd: string) {
    this.db = DatabaseManager.getInstance(getFireCodeDir(cwd));
    this.project = getProjectName(cwd);
  }

  /** Index all documentation files in the project */
  async build(opts: { includeCode?: boolean } = {}): Promise<{ added: number; skipped: number }> {
    const files = walkDocs(this.cwd, this.cwd);
    let added = 0;
    let skipped = 0;

    for (const filePath of files) {
      if (isPrivateFile(filePath)) { skipped++; continue; }

      let raw: string;
      try { raw = readFileSync(filePath, 'utf8'); } catch { skipped++; continue; }

      const content = sanitizeForLLM(raw, filePath);
      const relPath = relative(this.cwd, filePath);
      const chunks = chunkDocument(content);

      for (let i = 0; i < chunks.length; i++) {
        const title = chunks.length === 1 ? relPath : `${relPath}#${i + 1}`;
        this.db.upsertCorpus(this.project, title, chunks[i], relPath, [], false);
        added++;
      }
    }

    logger.info({ added, skipped }, 'Corpus build complete');
    return { added, skipped };
  }

  /** Search the corpus */
  query(query: string, limit = 5): { title: string; content: string; source: string | null }[] {
    return this.db.getCorpus({ project: this.project, query, limit });
  }

  /** Add a single item manually */
  prime(title: string, content: string, tags?: string[], isPrivate = false): void {
    const sanitized = isPrivate ? content : sanitizeForLLM(content);
    this.db.upsertCorpus(this.project, title, sanitized, undefined, tags, isPrivate);
    logger.debug({ title }, 'Corpus item primed');
  }

  /** Format corpus results as context string for LLM */
  formatAsContext(results: { title: string; content: string }[]): string {
    if (results.length === 0) return '';
    const lines = ['## Knowledge Corpus\n'];
    for (const r of results) {
      lines.push(`### ${r.title}\n${r.content}\n`);
    }
    return lines.join('\n');
  }
}
