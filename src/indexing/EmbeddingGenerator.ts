import type { ScannedFile } from './FileScanner.js';
import { sanitizeForLLM, isPrivateFile } from '../utils/privacy.js';
import { logger } from '../utils/logger.js';
import { embedTexts } from '../utils/modelManager.js';

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
    const embeddings = await embedTexts(texts);
    batch.forEach((doc, j) => {
      result.push({ ...doc, embedding: embeddings[j] });
    });
    logger.debug({ progress: `${Math.min(i + BATCH, docs.length)}/${docs.length}` }, 'Embedding progress');
  }

  return result;
}
