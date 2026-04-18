import { LocalIndex } from 'vectra';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import type { Document, ScoredDocument, VectorStore } from './VectorStore.js';
import { logger } from '../utils/logger.js';

type EmbedFn = (text: string) => Promise<number[]>;

// Lazy embed function — same model as MemoryVectorStore
let pipelineCache: ((texts: string[], opts?: Record<string, unknown>) => Promise<{ data: Float32Array[] }>) | null = null;

async function embed(text: string): Promise<number[]> {
  try {
    if (!pipelineCache) {
      const { pipeline } = await import('@xenova/transformers');
      pipelineCache = (await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')) as unknown as typeof pipelineCache;
    }
    const output = await pipelineCache!([text], { pooling: 'mean', normalize: true });
    return Array.from(output!.data[0]);
  } catch {
    return new Array(384).fill(0) as number[];
  }
}

/**
 * Vectra-backed vector store — uses HNSW for fast ANN search,
 * persists to disk, survives restarts.
 */
export class VectraVectorStore implements VectorStore {
  private index!: LocalIndex;
  private ready = false;
  private embedFn: EmbedFn;

  constructor(private dirPath: string, embedFn?: EmbedFn) {
    this.embedFn = embedFn ?? embed;
  }

  private async ensureReady(): Promise<void> {
    if (this.ready) return;
    if (!existsSync(this.dirPath)) mkdirSync(this.dirPath, { recursive: true });
    this.index = new LocalIndex(this.dirPath);
    if (!await this.index.isIndexCreated()) {
      await this.index.createIndex();
    }
    this.ready = true;
  }

  async add(documents: Document[]): Promise<void> {
    await this.ensureReady();
    for (const doc of documents) {
      const vector = doc.embedding?.length ? doc.embedding : await this.embedFn(doc.text);
      await this.index.upsertItem({
        id: doc.id,
        vector,
        metadata: { text: doc.text, ...doc.metadata },
      });
    }
    logger.debug({ count: documents.length }, 'Vectra: documents upserted');
  }

  async search(query: string, k = 5): Promise<ScoredDocument[]> {
    await this.ensureReady();
    const queryVector = await this.embedFn(query);
    const results = await this.index.queryItems(queryVector, query, k);
    return results.map(r => ({
      document: {
        id: r.item.id as string,
        text: (r.item.metadata?.text as string) ?? '',
        metadata: r.item.metadata as Record<string, unknown>,
      },
      score: r.score,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    await this.ensureReady();
    for (const id of ids) {
      await this.index.deleteItem(id);
    }
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    await this.index.deleteIndex();
    await this.index.createIndex();
  }

  size(): number {
    // Vectra doesn't expose sync count — return 0 as safe default
    return 0;
  }

  // Legacy compat (no-ops — vectra persists automatically)
  serialize(): string { return '{}'; }
  static deserialize(_data: string): VectraVectorStore {
    throw new Error('Use VectraVectorStore constructor directly');
  }
}
