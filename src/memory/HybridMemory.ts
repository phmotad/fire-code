import type { VectorStore, ScoredDocument } from '../vector/VectorStore.js';
import type { GraphStore, GraphNode } from '../graph/GraphStore.js';
import { logger } from '../utils/logger.js';

export interface RetrievedContext {
  vectorResults: ScoredDocument[];
  graphResults: GraphNode[];
  combined: string;
}

export interface RetrieveOptions {
  k?: number;
  includeGraph?: boolean;
  graphDepth?: number;
}

export class HybridMemory {
  constructor(
    private readonly vectorStore: VectorStore,
    private readonly graphStore: GraphStore,
  ) {}

  async retrieve(query: string, opts: RetrieveOptions = {}): Promise<RetrievedContext> {
    const k = opts.k ?? 5;
    const includeGraph = opts.includeGraph ?? true;

    logger.debug({ query: query.slice(0, 80), k, includeGraph }, 'Retrieving context');

    const vectorResults = await this.vectorStore.search(query, k);

    let graphResults: GraphNode[] = [];
    if (includeGraph) {
      // Use vector result paths to seed graph traversal
      const paths = new Set<string>();
      for (const r of vectorResults) {
        const relPath = r.document.metadata.relativePath as string | undefined;
        if (relPath) paths.add(relPath);
      }

      for (const path of paths) {
        const fileNode = this.graphStore.getNode(`file:${path}`);
        if (fileNode) {
          graphResults.push(fileNode);
          const neighbors = this.graphStore.getNeighbors(fileNode.id);
          graphResults.push(...neighbors.slice(0, 3));
        }
      }

      // Also query graph by keyword
      const graphKeywords = this.graphStore.query({ label: query.split(' ')[0] }).slice(0, 3);
      graphResults.push(...graphKeywords);

      // Deduplicate
      const seen = new Set<string>();
      graphResults = graphResults.filter((n) => {
        if (seen.has(n.id)) return false;
        seen.add(n.id);
        return true;
      });
    }

    const combined = this.buildContextString(query, vectorResults, graphResults);

    return { vectorResults, graphResults, combined };
  }

  private buildContextString(
    query: string,
    vectorResults: ScoredDocument[],
    graphResults: GraphNode[],
  ): string {
    const parts: string[] = [`# Context for: "${query}"\n`];

    if (vectorResults.length > 0) {
      parts.push('## Relevant Code Snippets\n');
      for (const r of vectorResults) {
        const path = r.document.metadata.relativePath ?? r.document.metadata.path ?? 'unknown';
        parts.push(`### ${path} (score: ${r.score.toFixed(3)})\n\`\`\`\n${r.document.text.slice(0, 400)}\n\`\`\`\n`);
      }
    }

    if (graphResults.length > 0) {
      parts.push('## Structural Context\n');
      for (const node of graphResults) {
        if (node.type === 'file') {
          parts.push(`- File: \`${node.path}\` (exports: ${node.exports.slice(0, 5).join(', ')})`);
        } else if (node.type === 'function') {
          parts.push(`- Function: \`${node.label}\` in \`${node.filePath}\`:${node.line}`);
        }
      }
      parts.push('');
    }

    return parts.join('\n');
  }
}
