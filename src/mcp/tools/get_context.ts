import { z } from 'zod';
import { basename } from 'path';
import { HybridMemory } from '../../memory/HybridMemory.js';
import { FallbackMemory } from '../../memory/FallbackMemory.js';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { GitManager } from '../../git/GitManager.js';
import { toFireCodeError } from '../../utils/errors.js';
import { existsSync, readFileSync } from 'fs';
import { getFireCodeDir } from '../../utils/paths.js';
import { getDefaults } from '../../config/defaults.js';

export const GetContextInputSchema = z.object({
  query: z.string().min(1).describe('Query to retrieve relevant context for'),
  k: z.number().int().positive().optional().default(5).describe('Number of results to return'),
  includeGraph: z.boolean().optional().default(true).describe('Include structural graph context'),
  includeGitDiff: z.boolean().optional().describe('Include uncommitted git diff in context (default: true)'),
});

export type GetContextInput = z.infer<typeof GetContextInputSchema>;

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

async function getWorkingDiff(cwd: string): Promise<string> {
  try {
    const defaults = getDefaults();
    const git = new GitManager(cwd, defaults.git);
    if (!(await git.isRepo())) return '';
    return await git.getWorkingDiff(2000);
  } catch {
    return '';
  }
}

async function buildStaleWarning(cwd: string, db: DatabaseManager, project: string): Promise<string> {
  try {
    const defaults = getDefaults();
    const git = new GitManager(cwd, defaults.git);
    if (!(await git.isRepo())) return '';
    const [currentHead, indexedHead] = await Promise.all([
      git.getHeadHash(),
      Promise.resolve(db.getProjectMeta(project, 'indexed_at_hash')),
    ]);
    if (currentHead && indexedHead && currentHead !== indexedHead) {
      return `> **Warning:** Index is stale. Indexed at \`${indexedHead.slice(0, 8)}\`, current HEAD is \`${currentHead.slice(0, 8)}\`. Run \`npx firecode index\` for accurate context.\n\n`;
    }
    return '';
  } catch {
    return '';
  }
}

export async function getContextTool(input: GetContextInput, cwd: string): Promise<string> {
  try {
    const firedotDir = getFireCodeDir(cwd);
    const diffPromise = input.includeGitDiff !== false ? getWorkingDiff(cwd) : Promise.resolve('');

    if (!existsSync(firedotDir)) {
      const fallback = new FallbackMemory(cwd);
      const [ctx, diff] = await Promise.all([
        fallback.retrieve(input.query, input.k),
        diffPromise,
      ]);
      if (diff) return ctx.combined + `\n## Uncommitted Changes\n\`\`\`diff\n${diff}\n\`\`\`\n`;
      return ctx.combined;
    }

    const project = getProjectName(cwd);
    const db = DatabaseManager.getInstance(firedotDir);
    const graphStore = db.getGraphStore(project);
    const vectorStore = db.getVectorStore(project);

    if (vectorStore.size() === 0) {
      const fallback = new FallbackMemory(cwd);
      const [ctx, diff] = await Promise.all([
        fallback.retrieve(input.query, input.k),
        diffPromise,
      ]);
      if (diff) return ctx.combined + `\n## Uncommitted Changes\n\`\`\`diff\n${diff}\n\`\`\`\n`;
      return ctx.combined;
    }

    const memory = new HybridMemory(vectorStore, graphStore);

    const [ctx, workingDiff, staleWarning] = await Promise.all([
      memory.retrieve(input.query, { k: input.k, includeGraph: input.includeGraph }),
      diffPromise,
      buildStaleWarning(cwd, db, project),
    ]);

    // Re-retrieve with working diff if there's something uncommitted
    if (workingDiff) {
      const ctxWithDiff = await memory.retrieve(input.query, {
        k: input.k,
        includeGraph: input.includeGraph,
        workingDiff,
      });
      return staleWarning + ctxWithDiff.combined;
    }

    return staleWarning + ctx.combined;
  } catch (err) {
    const e = toFireCodeError(err);
    return `Error retrieving context: ${e.message}`;
  }
}
