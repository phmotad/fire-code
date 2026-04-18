import type { Document, ScoredDocument, VectorStore } from './VectorStore.js';
import { logger } from '../utils/logger.js';

type EmbedPipeline = (texts: string[], options?: Record<string, unknown>) => Promise<{ data: Float32Array[] }>;
let pipelineCache: EmbedPipeline | null = null;

async function getEmbedding(text: string): Promise<number[]> {
  try {
    if (!pipelineCache) {
      const { pipeline } = await import('@xenova/transformers');
      pipelineCache = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')) as unknown as EmbedPipeline;
    }
    const output = await pipelineCache!([text], { pooling: 'mean', normalize: true });
    return Array.from(output.data[0]);
  } catch {
    // Fallback: zero vector of dim 384
    return new Array(384).fill(0) as number[];
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Text-only fallback using TF-IDF-like term overlap
function textSimilarity(query: string, text: string): number {
  const queryTerms = new Set(query.toLowerCase().split(/\W+/).filter(Boolean));
  const textTerms = text.toLowerCase().split(/\W+/).filter(Boolean);
  if (queryTerms.size === 0 || textTerms.length === 0) return 0;
  const matches = textTerms.filter((t) => queryTerms.has(t)).length;
  return matches / (queryTerms.size + textTerms.length - matches);
}

export class MemoryVectorStore implements VectorStore {
  private documents: Map<string, Document> = new Map();
  private useEmbeddings = true;

  constructor(opts?: { useEmbeddings?: boolean }) {
    if (opts?.useEmbeddings === false) this.useEmbeddings = false;
  }

  async add(documents: Document[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }
    logger.debug({ count: documents.length }, 'Documents added to vector store');
  }

  async search(query: string, k = 5): Promise<ScoredDocument[]> {
    const docs = Array.from(this.documents.values());
    if (docs.length === 0) return [];

    const docsWithEmbeddings = docs.filter((d) => d.embedding && d.embedding.length > 0);

    let scored: ScoredDocument[];

    if (this.useEmbeddings && docsWithEmbeddings.length > 0) {
      const queryEmbedding = await getEmbedding(query);
      scored = docsWithEmbeddings.map((doc) => ({
        document: doc,
        score: cosineSimilarity(queryEmbedding, doc.embedding!),
      }));
    } else {
      scored = docs.map((doc) => ({
        document: doc,
        score: textSimilarity(query, doc.text),
      }));
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, k);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) this.documents.delete(id);
  }

  async clear(): Promise<void> {
    this.documents.clear();
  }

  size(): number {
    return this.documents.size;
  }

  serialize(): string {
    return JSON.stringify(Array.from(this.documents.values()));
  }

  static deserialize(data: string): MemoryVectorStore {
    const store = new MemoryVectorStore();
    const docs = JSON.parse(data) as Document[];
    for (const doc of docs) store.documents.set(doc.id, doc);
    return store;
  }
}
