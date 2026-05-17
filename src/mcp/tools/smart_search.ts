import { z } from 'zod';
import { resolve, relative, join, extname, basename } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { getFireCodeDir } from '../../utils/paths.js';
import type { FunctionNode, FileNode } from '../../graph/GraphStore.js';

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
  kind: 'graph' | 'symbol' | 'content';
  match: string;
  context: string;
}

function getProjectName(rootDir: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(rootDir);
  } catch { return basename(rootDir); }
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

function scoreMatch(line: string, queryToken: string): number {
  const lq = queryToken.toLowerCase();
  const ll = line.toLowerCase();

  // Exact symbol declaration
  const symMatch = line.match(/(?:function|class|interface|type|const|let|var)\s+(\w+)/);
  if (symMatch && symMatch[1].toLowerCase() === lq) return 100;
  if (symMatch && symMatch[1].toLowerCase().includes(lq)) return 80;

  // Method declaration (handles class methods: `  methodName(`)
  const methodMatch = line.match(/^\s+(?:async\s+|static\s+|private\s+|public\s+|protected\s+)*(\w+)\s*\(/);
  if (methodMatch && methodMatch[1].toLowerCase() === lq) return 90;

  // Export match
  if (line.includes('export') && ll.includes(lq)) return 70;

  // Import match
  if (line.includes('import') && ll.includes(lq)) return 50;

  // General content
  if (ll.includes(lq)) return 30;

  return 0;
}

/** Query the indexed graph for exact symbol matches (fast, precise). */
function graphSymbolSearch(tokens: string[], rootDir: string): SearchResult[] {
  const firedotDir = getFireCodeDir(rootDir);
  if (!existsSync(firedotDir)) return [];

  try {
    const project = getProjectName(rootDir);
    const db = DatabaseManager.getInstance(firedotDir);
    const graphStore = db.getGraphStore(project);
    const results: SearchResult[] = [];

    for (const token of tokens) {
      if (token.length < 2) continue;

      // Exact function/method match
      const fnNodes = graphStore.query({ type: 'function', label: token, exact: true }) as FunctionNode[];
      for (const node of fnNodes) {
        const filePath = node.filePath.replace(/\\/g, '/');
        const label = node.parentClass ? `${node.parentClass}.${node.label}` : node.label;
        results.push({
          file: filePath,
          line: node.line,
          kind: 'graph',
          match: `${label}(${node.parameters.join(', ')})${node.returnType ? ': ' + node.returnType : ''}`,
          context: `defined at L${node.line}${node.parentClass ? ` [class: ${node.parentClass}]` : ''}`,
        });
      }

      // Exact file name match
      const fileNodes = graphStore.query({ type: 'file', label: token, exact: true }) as FileNode[];
      for (const node of fileNodes) {
        results.push({
          file: (node.path ?? node.label).replace(/\\/g, '/'),
          line: 0,
          kind: 'graph',
          match: node.label,
          context: `file (exports: ${node.exports.slice(0, 4).join(', ')})`,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

export async function smartSearchTool(input: SmartSearchInput, cwd: string): Promise<string> {
  const rootDir = resolve(input.path ?? cwd);

  if (!existsSync(rootDir)) {
    return JSON.stringify({ error: `Directory not found: ${rootDir}` });
  }

  // Split query into individual tokens for multi-symbol queries
  const tokens = input.query.split(/[\s,]+/).filter(t => t.length > 1);
  const maxResults = input.max_results ?? 20;

  // ── 1. Graph-based symbol lookup (highest precision) ─────────────────────
  const graphResults = graphSymbolSearch(tokens, rootDir);

  // ── 2. File scan (catches anything not yet indexed) ───────────────────────
  const files = walkFiles(rootDir, input.file_pattern);
  const fileResults: SearchResult[] = [];

  for (const filePath of files) {
    if (fileResults.length >= maxResults * 4) break;

    let content: string;
    try { content = readFileSync(filePath, 'utf8'); } catch { continue; }

    const relPath = relative(rootDir, filePath).replace(/\\/g, '/');

    // File name match against any token
    const fileNameLower = relPath.toLowerCase();
    if (tokens.some(t => fileNameLower.includes(t.toLowerCase()))) {
      fileResults.push({ file: relPath, line: 0, kind: 'symbol', match: relPath, context: `file: ${relPath}` });
    }

    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      // Score against each token, take highest
      let bestScore = 0;
      for (const token of tokens) {
        const s = scoreMatch(lines[i], token);
        if (s > bestScore) bestScore = s;
      }
      if (bestScore > 0) {
        const ctx = lines.slice(Math.max(0, i - 1), i + 2).join('\n');
        fileResults.push({
          file: relPath,
          line: i + 1,
          kind: bestScore >= 70 ? 'symbol' : 'content',
          match: lines[i].trim().slice(0, 120),
          context: ctx,
        });
      }
    }
  }

  // Sort file results: symbols first, then by file name
  fileResults.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'symbol' ? -1 : 1;
    return a.file.localeCompare(b.file);
  });

  // ── 3. Merge: graph results first (deduplicated by file+line) ────────────
  const seen = new Set<string>();
  const merged: SearchResult[] = [];

  for (const r of graphResults) {
    const key = `${r.file}:${r.line}`;
    if (!seen.has(key)) { seen.add(key); merged.push(r); }
  }
  for (const r of fileResults) {
    const key = `${r.file}:${r.line}`;
    if (!seen.has(key)) { seen.add(key); merged.push(r); }
  }

  const top = merged.slice(0, maxResults);

  if (top.length === 0) {
    return `No results for "${input.query}" in ${rootDir}`;
  }

  const outputLines = [
    `# Search: "${input.query}" — ${top.length} results (${graphResults.length} from index, ${files.length} files scanned)\n`,
  ];
  let lastFile = '';

  for (const r of top) {
    if (r.file !== lastFile) {
      outputLines.push(`\n## ${r.file}`);
      lastFile = r.file;
    }
    if (r.line > 0) {
      outputLines.push(`  L${r.line}  [${r.kind}]  ${r.match}`);
    } else if (r.kind === 'graph') {
      outputLines.push(`  [${r.kind}]  ${r.match}  — ${r.context}`);
    }
  }

  return outputLines.join('\n');
}
