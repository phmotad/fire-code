import type { ScannedFile } from './FileScanner.js';
import { sanitizeForLLM, isPrivateFile } from '../utils/privacy.js';
import { logger } from '../utils/logger.js';

export interface EmbeddingDocument {
  id: string;
  text: string;
  metadata: {
    path: string;
    relativePath: string;
    type: 'file' | 'function' | 'class';
    name?: string;
  };
  embedding?: number[];
}

type EmbedPipeline = (texts: string[], options?: Record<string, unknown>) => Promise<{ data: Float32Array[] }>;
let pipelineCache: EmbedPipeline | null = null;

async function getPipeline(): Promise<EmbedPipeline | null> {
  if (pipelineCache) return pipelineCache;
  try {
    // Dynamic import to avoid issues in test environments
    const { pipeline } = await import('@xenova/transformers');
    const pipe = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    pipelineCache = pipe as unknown as EmbedPipeline;
    return pipelineCache;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Could not load transformers.js, using zero embeddings');
    return null;
  }
}

async function embed(texts: string[]): Promise<number[][]> {
  const pipe = await getPipeline();
  if (!pipe) {
    return texts.map(() => new Array(384).fill(0) as number[]);
  }

  const output = await pipe(texts, { pooling: 'mean', normalize: true });
  return output.data.map((arr: Float32Array) => Array.from(arr));
}

export function buildDocumentsFromFiles(files: ScannedFile[]): EmbeddingDocument[] {
  const docs: EmbeddingDocument[] = [];

  for (const file of files) {
    if (isPrivateFile(file.path)) continue; // skip secrets

    const sanitized = sanitizeForLLM(file.content, file.path);
    const chunkSize = 512;
    const chunks = [];
    for (let i = 0; i < sanitized.length; i += chunkSize) {
      chunks.push(sanitized.slice(i, i + chunkSize));
    }

    chunks.forEach((chunk, idx) => {
      docs.push({
        id: `file:${file.relativePath}:chunk:${idx}`,
        text: chunk,
        metadata: { path: file.path, relativePath: file.relativePath, type: 'file' },
      });
    });
  }

  return docs;
}

export async function generateEmbeddings(docs: EmbeddingDocument[]): Promise<EmbeddingDocument[]> {
  const BATCH = 32;
  const result: EmbeddingDocument[] = [];

  for (let i = 0; i < docs.length; i += BATCH) {
    const batch = docs.slice(i, i + BATCH);
    const texts = batch.map((d) => d.text);
    const embeddings = await embed(texts);
    batch.forEach((doc, j) => {
      result.push({ ...doc, embedding: embeddings[j] });
    });
    logger.debug({ progress: `${Math.min(i + BATCH, docs.length)}/${docs.length}` }, 'Embedding progress');
  }

  return result;
}
