import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { glob } from 'glob';
import type { RetrievedContext } from './HybridMemory.js';
import { logger } from '../utils/logger.js';

export class FallbackMemory {
  constructor(private readonly cwd: string) {}

  async retrieve(query: string, k = 5): Promise<RetrievedContext> {
    logger.debug({ query: query.slice(0, 80) }, 'Using fallback memory (text search)');

    const results = await this.textSearch(query, k);

    return {
      vectorResults: results,
      graphResults: [],
      combined: this.buildContext(query, results),
    };
  }

  private async textSearch(query: string, k: number) {
    const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    if (terms.length === 0) return [];

    const files = await glob(['**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx'], {
      cwd: this.cwd,
      ignore: ['node_modules/**', 'dist/**', '.firecode/**'],
      absolute: false,
    });

    const scored: Array<{ path: string; score: number; snippet: string }> = [];

    for (const relPath of files.slice(0, 100)) {
      const absPath = join(this.cwd, relPath);
      if (!existsSync(absPath)) continue;
      try {
        const content = readFileSync(absPath, 'utf8').toLowerCase();
        const matches = terms.filter((t) => content.includes(t)).length;
        if (matches > 0) {
          const idx = content.indexOf(terms[0]);
          const snippet = readFileSync(absPath, 'utf8').slice(Math.max(0, idx - 50), idx + 300);
          scored.push({ path: relPath, score: matches / terms.length, snippet });
        }
      } catch {
        // skip
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((s) => ({
        document: {
          id: `fallback:${s.path}`,
          text: s.snippet,
          metadata: { relativePath: s.path, path: s.path, type: 'file' as const },
        },
        score: s.score,
      }));
  }

  private buildContext(query: string, results: Array<{ document: { text: string; metadata: Record<string, unknown> }; score: number }>): string {
    const parts = [`# Fallback Context for: "${query}"\n`];
    for (const r of results) {
      parts.push(`## ${r.document.metadata.relativePath}\n\`\`\`\n${r.document.text.slice(0, 400)}\n\`\`\`\n`);
    }
    return parts.join('\n');
  }
}
