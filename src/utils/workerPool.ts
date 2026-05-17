import { Worker } from 'worker_threads';
import { randomUUID } from 'crypto';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from './logger.js';

// __dirname is available in CommonJS (this project builds to CJS output).
// At runtime: dist/utils/workerPool.js → dist/workers/embeddingWorker.js
// In dev/test: src/utils/workerPool.ts → src/workers/embeddingWorker.js (won't exist → fallback)
const WORKER_PATH = join(__dirname, '../workers/embeddingWorker.js');

interface EmbedRequest { id: string; texts: string[] }
interface InternalMessage {
  type?: 'ready' | 'error';
  error?: string;
  id?: string;
  embeddings?: number[][];
}

type PendingEntry = {
  resolve: (v: number[][]) => void;
  reject: (e: Error) => void;
};

let worker: Worker | null = null;
let workerFailed = false;
const pending = new Map<string, PendingEntry>();

function spawnWorker(): Worker {
  const w = new Worker(WORKER_PATH);

  w.on('message', (msg: InternalMessage) => {
    if (msg.type === 'ready') {
      logger.debug('Embedding worker ready');
      return;
    }
    if (msg.type === 'error') {
      workerFailed = true;
      worker?.terminate();
      worker = null;
      logger.warn({ err: msg.error }, 'Embedding worker failed to load — falling back to main thread');
      for (const { reject } of pending.values()) reject(new Error(msg.error ?? 'Worker error'));
      pending.clear();
      return;
    }
    if (msg.id) {
      const entry = pending.get(msg.id);
      if (entry) {
        pending.delete(msg.id);
        if (msg.error) entry.reject(new Error(msg.error));
        else entry.resolve(msg.embeddings ?? []);
      }
    }
  });

  w.on('error', (err) => {
    workerFailed = true;
    logger.warn({ err: String(err) }, 'Embedding worker crashed');
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
    worker = null;
  });

  return w;
}

/**
 * Send texts to the embedding worker thread.
 * Returns null when the compiled worker file isn't present (dev/test mode or after a crash),
 * signalling the caller to fall back to the main-thread pipeline.
 */
export async function workerEmbed(texts: string[]): Promise<number[][] | null> {
  if (workerFailed || !existsSync(WORKER_PATH)) return null;

  if (!worker) worker = spawnWorker();

  return new Promise<number[][]>((resolve, reject) => {
    const id = randomUUID();
    pending.set(id, { resolve, reject });
    worker!.postMessage({ id, texts } as EmbedRequest);
  });
}

export function terminateEmbeddingWorker(): void {
  worker?.terminate();
  worker = null;
}
