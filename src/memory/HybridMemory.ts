import type { VectorStore, ScoredDocument } from '../vector/VectorStore.js';
import type { GraphStore, GraphNode, FunctionNode, FileNode, CommitNode } from '../graph/GraphStore.js';
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
  workingDiff?: string;
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
      graphResults = this.retrieveGraphContext(query, vectorResults);
    }

    const combined = this.buildContextString(query, vectorResults, graphResults, opts.workingDiff);
    return { vectorResults, graphResults, combined };
  }

  private retrieveGraphContext(query: string, vectorResults: ScoredDocument[]): GraphNode[] {
    const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'has', 'have', 'not', 'but', 'can', 'when']);
    const tokens = query
      .toLowerCase()
      .split(/[\s\W]+/)
      .filter(t => t.length > 2 && !stopWords.has(t));

    const results: GraphNode[] = [];
    const seen = new Set<string>();

    const add = (node: GraphNode) => {
      if (!seen.has(node.id)) { seen.add(node.id); results.push(node); }
    };

    // 1. Exact symbol matches — query each token
    for (const token of tokens) {
      const fnNodes = this.graphStore.query({ type: 'function', label: token, exact: true });
      fnNodes.forEach(add);
    }

    // 2. Seed graph traversal from vector search results
    const paths = new Set<string>();
    for (const r of vectorResults) {
      const relPath = r.document.metadata.relativePath as string | undefined;
      if (relPath) paths.add(relPath);
    }

    for (const path of paths) {
      const fileNode = this.graphStore.getNode(`file:${path}`);
      if (fileNode) {
        add(fileNode);
        const neighbors = this.graphStore.getNeighbors(fileNode.id);
        neighbors.slice(0, 5).forEach(add);
      }
    }

    // 3. Substring keyword matches
    for (const token of tokens.slice(0, 3)) {
      const partial = this.graphStore.query({ label: token }).slice(0, 5);
      partial.forEach(add);
    }

    // 4. Sort: exact matches first
    const tokenSet = new Set(tokens);
    results.sort((a, b) => {
      const score = (n: GraphNode): number => {
        const label = n.label.toLowerCase();
        if (tokenSet.has(label)) return 100;
        if (tokens.some(t => label.includes(t) || t.includes(label))) return 50;
        return 0;
      };
      return score(b) - score(a);
    });

    return results;
  }

  /** Find commits (from graph) that changed any of the given file paths. */
  private getCommitsForFiles(filePaths: string[]): CommitNode[] {
    const commits: CommitNode[] = [];
    const seen = new Set<string>();

    for (const path of filePaths) {
      const normalizedPath = path.replace(/\\/g, '/');
      // dependantsOf returns nodes with edges pointing TO fileNode — i.e., commits that changed it
      const dependants = this.graphStore.dependantsOf(`file:${normalizedPath}`);
      for (const node of dependants) {
        if (node.type === 'commit' && !seen.has(node.id)) {
          seen.add(node.id);
          commits.push(node as CommitNode);
        }
      }
    }

    // Sort by timestamp descending (most recent first)
    commits.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return commits.slice(0, 8);
  }

  private buildContextString(
    query: string,
    vectorResults: ScoredDocument[],
    graphResults: GraphNode[],
    workingDiff?: string,
  ): string {
    const parts: string[] = [`# Context for: "${query}"\n`];

    // ── Code Snippets ──────────────────────────────────────────────────────
    if (vectorResults.length > 0) {
      parts.push('## Relevant Code Snippets\n');
      for (const r of vectorResults) {
        const path = r.document.metadata.relativePath ?? r.document.metadata.path ?? 'unknown';
        const scoreLabel = r.score > 0 ? ` (score: ${r.score.toFixed(3)})` : '';
        parts.push(`### ${path}${scoreLabel}\n\`\`\`\n${r.document.text.slice(0, 400)}\n\`\`\`\n`);
      }
    }

    // ── Structural Context ─────────────────────────────────────────────────
    if (graphResults.length > 0) {
      parts.push('## Structural Context\n');

      const byFile = new Map<string, FunctionNode[]>();
      const fileNodes: FileNode[] = [];

      for (const node of graphResults) {
        if (node.type === 'file') {
          fileNodes.push(node as FileNode);
        } else if (node.type === 'function') {
          const fn = node as FunctionNode;
          const key = fn.filePath.replace(/\\/g, '/');
          if (!byFile.has(key)) byFile.set(key, []);
          byFile.get(key)!.push(fn);
        }
      }

      for (const [filePath, fns] of byFile) {
        parts.push(`### \`${filePath}\``);
        for (const fn of fns.slice(0, 8)) {
          const qualifiedName = fn.parentClass ? `${fn.parentClass}.${fn.label}` : fn.label;
          const sig = `${qualifiedName}(${fn.parameters.join(', ')})${fn.returnType ? ': ' + fn.returnType : ''}`;
          parts.push(`  - \`${sig}\` — L${fn.line}`);
        }
        parts.push('');
      }

      for (const node of fileNodes) {
        parts.push(`- File: \`${node.path}\` (exports: ${node.exports.slice(0, 5).join(', ')})`);
      }
      parts.push('');
    }

    // ── Git History ────────────────────────────────────────────────────────
    const filePaths = vectorResults
      .map(r => (r.document.metadata.relativePath ?? r.document.metadata.path ?? '') as string)
      .filter(Boolean);

    if (filePaths.length > 0) {
      const commits = this.getCommitsForFiles(filePaths);
      if (commits.length > 0) {
        parts.push('## Recent Git History\n');
        for (const c of commits) {
          const date = new Date(c.timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
          const files = c.filesChanged.slice(0, 3).join(', ');
          const more = c.filesChanged.length > 3 ? ` +${c.filesChanged.length - 3}` : '';
          parts.push(`- \`${c.sha.slice(0, 7)}\` ${c.message} *(${date})* — ${files}${more}`);
        }
        parts.push('');
      }
    }

    // ── Working Diff ───────────────────────────────────────────────────────
    if (workingDiff && workingDiff.trim().length > 0) {
      parts.push('## Uncommitted Changes (git diff HEAD)\n');
      parts.push(`\`\`\`diff\n${workingDiff.slice(0, 2000)}\n\`\`\`\n`);
    }

    return parts.join('\n');
  }
}
