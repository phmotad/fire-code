import { logger } from './logger.js';
import { workerEmbed } from './workerPool.js';

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

interface PipelineTensor {
  data: Float32Array;
  dims: number[];
}

type EmbedPipeline = (
  texts: string[],
  options?: Record<string, unknown>,
) => Promise<PipelineTensor>;

export interface DownloadProgress {
  file: string;
  progress: number; // 0–100
  loaded: number;   // bytes
  total: number;    // bytes
  status: 'initiate' | 'download' | 'progress' | 'done' | 'ready' | 'loading';
}

export type ProgressCallback = (info: DownloadProgress) => void;

let cachedPipeline: EmbedPipeline | null = null;

/** True if the pipeline has been loaded into memory this process. */
export function isPipelineReady(): boolean {
  return cachedPipeline !== null;
}

/**
 * Load (and optionally download) the embedding model.
 * Returns the pipeline or null if loading fails.
 * @param onProgress  Called for each download/load progress event.
 */
export async function ensureModel(onProgress?: ProgressCallback): Promise<EmbedPipeline | null> {
  if (cachedPipeline) return cachedPipeline;

  try {
    const { pipeline, env } = await import('@xenova/transformers');

    // Allow overriding cache dir via env var
    if (process.env.FIRECODE_MODEL_CACHE) {
      env.cacheDir = process.env.FIRECODE_MODEL_CACHE;
    }

    const progressCb = onProgress
      ? (info: Record<string, unknown>) => {
          onProgress({
            file: String(info.file ?? info.name ?? ''),
            progress: typeof info.progress === 'number' ? info.progress : 0,
            loaded: typeof info.loaded === 'number' ? info.loaded : 0,
            total: typeof info.total === 'number' ? info.total : 0,
            status: (info.status as DownloadProgress['status']) ?? 'progress',
          });
        }
      : undefined;

    const pipe = await pipeline('feature-extraction', MODEL_ID, {
      progress_callback: progressCb,
    });

    cachedPipeline = pipe as unknown as EmbedPipeline;
    logger.info({ model: MODEL_ID }, 'Embedding model loaded');
    return cachedPipeline;
  } catch (err) {
    logger.warn({ err: String(err) }, 'Could not load embedding model — falling back to text similarity');
    return null;
  }
}

/** Get the cached pipeline (null if not yet loaded). */
export function getCachedPipeline(): EmbedPipeline | null {
  return cachedPipeline;
}

/** Reset the cache (for tests). */
export function resetPipeline(): void {
  cachedPipeline = null;
}

/**
 * Extract individual embedding vectors from a batched pipeline tensor.
 * The tensor's `data` is a flat Float32Array of shape [batch, dim].
 */
export function extractEmbeddings(tensor: PipelineTensor): number[][] {
  const [batchSize, dim] = tensor.dims;
  const result: number[][] = [];
  for (let i = 0; i < batchSize; i++) {
    result.push(Array.from(tensor.data.slice(i * dim, (i + 1) * dim)));
  }
  return result;
}

/**
 * Embed texts using a worker thread when available (production), falling back
 * to the main-thread pipeline in dev/test environments.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  // Try worker thread first — returns null in dev/test mode or after worker crash
  const workerResult = await workerEmbed(texts).catch(() => null);
  if (workerResult !== null) return workerResult;

  // Main-thread fallback
  const pipe = await ensureModel();
  if (!pipe) return texts.map(() => []);
  const tensor = await pipe(texts, { pooling: 'mean', normalize: true });
  return extractEmbeddings(tensor);
}
