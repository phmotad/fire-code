import { z } from 'zod';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { getFireCodeDir } from '../../utils/paths.js';
import { existsSync } from 'fs';

export const CorpusSearchInputSchema = z.object({
  query: z.string().describe('Search query against the knowledge corpus'),
  limit: z.number().optional().default(5).describe('Max results (default 5)'),
});

export type CorpusSearchInput = z.infer<typeof CorpusSearchInputSchema>;

export async function corpusSearchTool(input: CorpusSearchInput, cwd: string): Promise<string> {
  const firedotDir = getFireCodeDir(cwd);
  if (!existsSync(firedotDir)) {
    return 'No Fire Code index. Run: fire-code corpus build';
  }

  const db = DatabaseManager.getInstance(firedotDir);
  const results = db.getCorpus({ query: input.query, limit: input.limit });

  if (results.length === 0) {
    return `No corpus items matching "${input.query}". Run fire-code corpus build to index docs.`;
  }

  const lines = [`# Corpus: "${input.query}" (${results.length} results)\n`];
  for (const r of results) {
    lines.push(`## ${r.title}`);
    if (r.source) lines.push(`_source: ${r.source}_`);
    lines.push(r.content.slice(0, 600));
    lines.push('');
  }
  return lines.join('\n');
}
