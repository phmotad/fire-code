import { z } from 'zod';
import { basename } from 'path';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { toFireCodeError } from '../../utils/errors.js';
import { existsSync, readFileSync } from 'fs';
import { getFireCodeDir } from '../../utils/paths.js';

export const GetGraphInputSchema = z.object({
  type: z.enum(['file', 'function', 'commit']).optional().describe('Filter by node type'),
  label: z.string().optional().describe('Filter by label (partial match)'),
  path: z.string().optional().describe('Filter by file path (partial match)'),
  neighbors: z.string().optional().describe('Node ID — return BFS neighbors up to depth 3'),
  dependants: z.string().optional().describe('Node ID — return nodes that depend on it'),
  limit: z.number().int().positive().optional().default(20).describe('Max nodes to return'),
});

export type GetGraphInput = z.infer<typeof GetGraphInputSchema>;

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

export async function getGraphTool(input: GetGraphInput, cwd: string): Promise<string> {
  try {
    const firedotDir = getFireCodeDir(cwd);

    if (!existsSync(firedotDir)) {
      return 'No graph data available. Run `fire-code index` first.';
    }

    const project = getProjectName(cwd);
    const db = DatabaseManager.getInstance(firedotDir);
    const graphStore = db.getGraphStore(project);
    const stats = graphStore.getStats();

    // Graphology-powered traversal queries
    if (input.neighbors) {
      const reachable = graphStore.reachableFrom(input.neighbors, 3).slice(0, input.limit);
      return JSON.stringify({ stats, query: 'reachableFrom', root: input.neighbors, nodes: reachable }, null, 2);
    }

    if (input.dependants) {
      const deps = graphStore.dependantsOf(input.dependants).slice(0, input.limit);
      return JSON.stringify({ stats, query: 'dependantsOf', target: input.dependants, nodes: deps }, null, 2);
    }

    const nodes = graphStore.query({
      type: input.type,
      label: input.label,
      path: input.path,
    }).slice(0, input.limit);

    return JSON.stringify({
      stats,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        ...(n.type === 'file' ? { path: n.path, exports: n.exports.slice(0, 5) } : {}),
        ...(n.type === 'function' ? { filePath: n.filePath, line: n.line, isExported: n.isExported } : {}),
      })),
    }, null, 2);
  } catch (err) {
    const e = toFireCodeError(err);
    return `Error retrieving graph: ${e.message}`;
  }
}
