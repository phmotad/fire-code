import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';
import { basename } from 'path';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { toFireCodeError } from '../../utils/errors.js';
import { getFireCodeDir } from '../../utils/paths.js';
import type { FunctionNode } from '../../graph/GraphStore.js';

export const FindSimilarInputSchema = z.object({
  description: z.string().min(1).describe(
    'Describe what you want to implement — in natural language or as a symbol name'
  ),
  type: z.enum(['function', 'class', 'any']).optional().default('any').describe(
    'Restrict to a specific symbol type'
  ),
  k: z.number().int().positive().optional().default(5).describe('Max results to return'),
});

export type FindSimilarInput = z.infer<typeof FindSimilarInputSchema>;

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(readFileSync(require('path').join(cwd, 'package.json'), 'utf8')) as { name?: string };
    return pkg.name ?? basename(cwd);
  } catch { return basename(cwd); }
}

export async function findSimilarTool(input: FindSimilarInput, cwd: string): Promise<string> {
  try {
    const firedotDir = getFireCodeDir(cwd);

    if (!existsSync(firedotDir)) {
      return 'Projeto não indexado. Execute `fire-code index` primeiro.';
    }

    const project = getProjectName(cwd);
    const db = DatabaseManager.getInstance(firedotDir);
    const vectorStore = db.getVectorStore(project);
    const graphStore = db.getGraphStore(project);

    // 1. Symbol lookup in graph — extract keywords and search by name
    const keywords = input.description
      .split(/\W+/)
      .filter(w => w.length > 2)
      .slice(0, 5);

    const graphMatches: FunctionNode[] = [];
    const seen = new Set<string>();

    for (const keyword of keywords) {
      const nodeType = input.type === 'class' ? 'function' : 'function';
      const nodes = graphStore.query({ type: nodeType, label: keyword });
      for (const node of nodes) {
        if (node.type === 'function' && !seen.has(node.id)) {
          seen.add(node.id);
          graphMatches.push(node);
        }
      }
    }

    // 2. Vector/text search for semantically similar code chunks
    const vectorResults = vectorStore.size() > 0
      ? await vectorStore.search(input.description, input.k)
      : [];

    const lines: string[] = [
      '# Código Similar Encontrado\n',
      '> Verifique se estas implementações já atendem sua necessidade antes de criar algo novo.\n',
    ];

    let found = false;

    if (graphMatches.length > 0) {
      found = true;
      lines.push('## Símbolos por Nome (grafo)\n');
      for (const fn of graphMatches.slice(0, input.k)) {
        const params = fn.parameters.join(', ');
        const ret = fn.returnType ? `: ${fn.returnType}` : '';
        const cls = fn.parentClass ? ` ← \`${fn.parentClass}\`` : '';
        const relPath = fn.filePath.replace(/\\/g, '/');
        lines.push(`### \`${fn.label}(${params})${ret}\`${cls}`);
        lines.push(`📍 ${relPath}:${fn.line}  ${fn.isExported ? '(exportado)' : '(interno)'}\n`);
      }
    }

    const relevantVec = vectorResults.filter(r => r.score > 0.05);
    if (relevantVec.length > 0) {
      found = true;
      lines.push('## Código Similar por Conteúdo (busca semântica)\n');
      for (const r of relevantVec) {
        const path = String(r.document.metadata.relativePath ?? r.document.metadata.path ?? 'unknown');
        lines.push(`### ${path} (relevância: ${(r.score * 100).toFixed(0)}%)`);
        lines.push('```');
        lines.push(r.document.text.slice(0, 400).trimEnd());
        lines.push('```\n');
      }
    }

    if (!found) {
      lines.push('✅ Nenhum código similar encontrado — pode implementar com segurança.');
    }

    return lines.join('\n');
  } catch (err) {
    const e = toFireCodeError(err);
    return `Erro em find_similar: ${e.message}`;
  }
}
