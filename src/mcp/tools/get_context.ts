import { z } from 'zod';
import { basename } from 'path';
import { HybridMemory } from '../../memory/HybridMemory.js';
import { FallbackMemory } from '../../memory/FallbackMemory.js';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { MemoryVectorStore } from '../../vector/MemoryVectorStore.js';
import { toFireCodeError } from '../../utils/errors.js';
import { existsSync, readFileSync } from 'fs';
import { getFireCodeDir, getVectorsPath } from '../../utils/paths.js';

export const GetContextInputSchema = z.object({
  query: z.string().min(1).describe('Query to retrieve relevant context for'),
  k: z.number().int().positive().optional().default(5).describe('Number of results to return'),
  includeGraph: z.boolean().optional().default(true).describe('Include structural graph context'),
});

export type GetContextInput = z.infer<typeof GetContextInputSchema>;

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

export async function getContextTool(input: GetContextInput, cwd: string): Promise<string> {
  try {
    const firedotDir = getFireCodeDir(cwd);
    const vectorsPath = getVectorsPath(cwd);

    if (!existsSync(firedotDir) || !existsSync(vectorsPath)) {
      const fallback = new FallbackMemory(cwd);
      const ctx = await fallback.retrieve(input.query, input.k);
      return ctx.combined;
    }

    const project = getProjectName(cwd);
    const db = DatabaseManager.getInstance(firedotDir);
    const graphStore = db.getGraphStore(project);
    const vectorStore = MemoryVectorStore.deserialize(readFileSync(vectorsPath, 'utf8'));
    const memory = new HybridMemory(vectorStore, graphStore);

    const ctx = await memory.retrieve(input.query, { k: input.k, includeGraph: input.includeGraph });
    return ctx.combined;
  } catch (err) {
    const e = toFireCodeError(err);
    return `Error retrieving context: ${e.message}`;
  }
}
