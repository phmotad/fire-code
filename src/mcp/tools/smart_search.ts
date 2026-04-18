import { z } from 'zod';
import { resolve } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, extname, relative } from 'path';

export const SmartSearchInputSchema = z.object({
  query: z.string().describe('Search term — matches symbol names, file names, and content'),
  path: z.string().optional().describe('Root directory to search (default: cwd)'),
  max_results: z.number().optional().default(20).describe('Maximum results to return'),
  file_pattern: z.string().optional().describe('Filter by file path substring (e.g. ".ts", "src/services")'),
});

export type SmartSearchInput = z.infer<typeof SmartSearchInputSchema>;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.firecode', 'coverage', '.next']);
const CODE_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.py', '.go', '.rs', '.java', '.cs', '.rb', '.php', '.swift', '.kt', '.md']);

interface SearchResult {
  file: string;
  line: number;
  kind: 'symbol' | 'content';
  match: string;
  context: string;
}

function walkFiles(dir: string, filePattern?: string): string[] {
  const files: string[] = [];

  function walk(current: string) {
    let entries: string[];
    try { entries = readdirSync(current); } catch { return; }

    for (const entry of entries) {
      if (SKIP_DIRS.has(entry)) continue;
      const full = join(current, entry);
      let stat: ReturnType<typeof statSync>;
      try { stat = statSync(full); } catch { continue; }

      if (stat.isDirectory()) {
        walk(full);
      } else if (CODE_EXTS.has(extname(entry))) {
        if (!filePattern || full.includes(filePattern)) {
          files.push(full);
        }
      }
    }
  }

  walk(dir);
  return files;
}

function scoreMatch(line: string, query: string): number {
  const lq = query.toLowerCase();
  const ll = line.toLowerCase();

  // Exact symbol match (function name, class name)
  const symMatch = line.match(/(?:function|class|interface|type|const|let|var)\s+(\w+)/);
  if (symMatch && symMatch[1].toLowerCase().includes(lq)) return 100;

  // Export match
  if (line.includes('export') && ll.includes(lq)) return 80;

  // Import match
  if (line.includes('import') && ll.includes(lq)) return 60;

  // General content
  if (ll.includes(lq)) return 40;

  return 0;
}

export async function smartSearchTool(input: SmartSearchInput, cwd: string): Promise<string> {
  const rootDir = resolve(input.path ?? cwd);

  if (!existsSync(rootDir)) {
    return JSON.stringify({ error: `Directory not found: ${rootDir}` });
  }

  const files = walkFiles(rootDir, input.file_pattern);
  const results: SearchResult[] = [];
  const query = input.query.toLowerCase();
  const maxResults = input.max_results ?? 20;

  for (const filePath of files) {
    if (results.length >= maxResults * 3) break;

    let content: string;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }

    const relPath = relative(rootDir, filePath);

    // File name match
    if (relPath.toLowerCase().includes(query)) {
      results.push({ file: relPath, line: 0, kind: 'symbol', match: relPath, context: `file: ${relPath}` });
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const score = scoreMatch(lines[i], query);
      if (score > 0) {
        const ctx = lines.slice(Math.max(0, i - 1), i + 2).join('\n');
        results.push({
          file: relPath,
          line: i + 1,
          kind: score >= 80 ? 'symbol' : 'content',
          match: lines[i].trim().slice(0, 120),
          context: ctx,
        });
      }
    }
  }

  // Sort: symbols first, then by file name
  results.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'symbol' ? -1 : 1;
    return a.file.localeCompare(b.file);
  });

  const top = results.slice(0, maxResults);

  if (top.length === 0) {
    return `No results for "${input.query}" in ${rootDir}`;
  }

  const lines = [`# Search: "${input.query}" — ${top.length} results (${files.length} files scanned)\n`];
  let lastFile = '';

  for (const r of top) {
    if (r.file !== lastFile) {
      lines.push(`\n## ${r.file}`);
      lastFile = r.file;
    }
    if (r.line > 0) {
      lines.push(`  L${r.line}  [${r.kind}]  ${r.match}`);
    }
  }

  return lines.join('\n');
}
