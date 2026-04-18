import { z } from 'zod';
import { DatabaseManager } from '../../db/DatabaseManager.js';
import { getFireCodeDir } from '../../utils/paths.js';
import { existsSync } from 'fs';

export const ObservationsInputSchema = z.object({
  query: z.string().optional().describe('Full-text search query'),
  type: z.enum(['change', 'bugfix', 'feature', 'refactor', 'decision', 'discovery']).optional(),
  file: z.string().optional().describe('Filter by file path substring'),
  limit: z.number().optional().default(20).describe('Max results (default 20)'),
  ids: z.array(z.number()).optional().describe('Fetch specific observation IDs'),
});

export type ObservationsInput = z.infer<typeof ObservationsInputSchema>;

export async function observationsTool(input: ObservationsInput, cwd: string): Promise<string> {
  const firedotDir = getFireCodeDir(cwd);

  if (!existsSync(firedotDir)) {
    return 'No Fire Code index found. Run: fire-code index';
  }

  const db = DatabaseManager.getInstance(firedotDir);

  // Fetch by IDs (step 3 of progressive disclosure)
  if (input.ids && input.ids.length > 0) {
    const obs = db.getObservationsByIds(input.ids);
    if (obs.length === 0) return `No observations found for IDs: ${input.ids.join(', ')}`;
    return formatObservationsFull(obs);
  }

  // Search / filter
  const obs = db.getObservations({
    query: input.query,
    type: input.type,
    file_path: input.file,
    limit: input.limit ?? 20,
  });

  if (obs.length === 0) {
    const hint = input.query ? `No observations matching "${input.query}"` : 'No observations yet';
    return `${hint}. Use PostToolUse hooks or run fire-code index to build history.`;
  }

  return formatObservationsIndex(obs);
}

function formatObservationsIndex(obs: { id: number; type: string; file_path: string | null; summary: string; created_at: number }[]): string {
  const lines = [`# Observations (${obs.length} results)\n`];
  lines.push('ID    Type        File                         Summary');
  lines.push('─'.repeat(80));

  for (const o of obs) {
    const date = new Date(o.created_at).toLocaleDateString();
    const file = (o.file_path ?? '').slice(-28).padEnd(28);
    const type = o.type.padEnd(10);
    lines.push(`#${String(o.id).padEnd(5)} ${type} ${file} ${o.summary.slice(0, 50)}`);
  }

  lines.push('\n→ Use firecode.observations({ ids: [...] }) to fetch full details for specific entries.');
  return lines.join('\n');
}

function formatObservationsFull(obs: { id: number; type: string; file_path: string | null; summary: string; detail: string | null; created_at: number; tool: string | null }[]): string {
  const lines: string[] = [];
  for (const o of obs) {
    const date = new Date(o.created_at).toLocaleString();
    const icon = { change: '✏️', bugfix: '🐛', feature: '✨', refactor: '♻️', decision: '🧭', discovery: '🔍' }[o.type] ?? '•';
    lines.push(`${icon} #${o.id} [${o.type}] — ${date}`);
    if (o.file_path) lines.push(`   File: ${o.file_path}`);
    if (o.tool) lines.push(`   Tool: ${o.tool}`);
    lines.push(`   ${o.summary}`);
    if (o.detail) lines.push(`   Detail: ${o.detail.slice(0, 200)}`);
    lines.push('');
  }
  return lines.join('\n');
}
