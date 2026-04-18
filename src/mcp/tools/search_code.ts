import { z } from 'zod';
import { MemoryVectorStore } from '../../vector/MemoryVectorStore.js';
import { FallbackMemory } from '../../memory/FallbackMemory.js';
import { toFireCodeError } from '../../utils/errors.js';
import { existsSync, readFileSync } from 'fs';
import { getVectorsPath } from '../../utils/paths.js';

export const SearchCodeInputSchema = z.object({
  query: z.string().min(1).describe('Semantic search query for code'),
  k: z.number().int().positive().optional().default(5).describe('Number of results'),
});

export type SearchCodeInput = z.infer<typeof SearchCodeInputSchema>;

export async function searchCodeTool(input: SearchCodeInput, cwd: string): Promise<string> {
  try {
    const vectorsPath = getVectorsPath(cwd);

    if (!existsSync(vectorsPath)) {
      const fallback = new FallbackMemory(cwd);
      const ctx = await fallback.retrieve(input.query, input.k);
      return ctx.combined;
    }

    const vectorStore = MemoryVectorStore.deserialize(readFileSync(vectorsPath, 'utf8'));
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
