import { z } from 'zod';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { FallbackMemory } from '../../memory/FallbackMemory.js';
import { toFireCodeError } from '../../utils/errors.js';
import { existsSync } from 'fs';
import { getFireCodeDir } from '../../utils/paths.js';
import { basename } from 'path';
import { readFileSync } from 'fs';

export const SearchCodeInputSchema = z.object({
  query: z.string().min(1).describe('Semantic search query for code'),
  k: z.number().int().positive().optional().default(5).describe('Number of results'),
});

export type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>;

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

export async function searchCodeTool(input: SearchCodeInput, cwd: string): Promise<string> {
  try {
    const firedotDir = getFireCodeDir(cwd);

    if (!existsSync(firedotDir)) {
      const fallback = new FallbackMemory(cwd);
      const ctx = await fallback.retrieve(input.query, input.k);
      return ctx.combined;
    }

    const project = getProjectName(cwd);
    const db = DatabaseManager.getInstance(firedotDir);
    const vectorStore = db.getVectorStore(project);

    if (vectorStore.size() === 0) {
      const fallback = new FallbackMemory(cwd);
      const ctx = await fallback.retrieve(input.query, input.k);
      return ctx.combined;
    }

    const results = await vectorStore.search(input.query, input.k);

    if (results.length === 0) return 'No results found.';

    const lines = results.map((r, i) => {
      const path = r.document.metadata.relativePath ?? r.document.metadata.path ?? 'unknown';
      return `## Result ${i + 1}: ${path} (score: ${r.score.toFixed(3)})\n\`\`\`\n${r.document.text.slice(0, 500)}\n\`\`\``;
    });

    return lines.join('\n\n');
  } catch (err) {
    const e = toFireCodeError(err);
    return `Error searching code: ${e.message}`;
  }
}
