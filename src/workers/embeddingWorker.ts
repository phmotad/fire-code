import { parentPort } from 'worker_threads';

// Runs @xenova/transformers in a dedicated thread so the main event loop
// stays free during batch indexing and query embedding.

interface EmbedRequest {
  id: string;
  texts: string[];
}

interface EmbedResponse {
  id: string;
  embeddings: number[][];
  error?: string;
}

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';

type Pipeline = (
  texts: string[],
  opts: Record<string, unknown>,
) => Promise<{ data: Float32Array; dims: number[] }>;

let pipe: Pipeline | null = null;

async function init(): Promise<void> {
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    if (process.env.FIRECODE_MODEL_CACHE) {
      (env as { cacheDir?: string }).cacheDir = process.env.FIRECODE_MODEL_CACHE;
    }
    pipe = (await pipeline('feature-extraction', MODEL_ID)) as unknown as Pipeline;
    parentPort!.postMessage({ type: 'ready' });
  } catch (err) {
    parentPort!.postMessage({ type: 'error', error: String(err) });
  }
}

parentPort!.on('message', async (req: EmbedRequest) => {
  if (!pipe) {
    parentPort!.postMessage({
      id: req.id,
      embeddings: [],
      error: 'Model not ready',
    } as EmbedResponse);
    return;
  }
  try {
    const tensor = await pipe(req.texts, { pooling: 'mean', normalize: true });
    const [batch, dim] = tensor.dims;
    const embeddings: number[][] = [];
    for (let i = 0; i < batch; i++) {
      embeddings.push(Array.from(tensor.data.slice(i * dim, (i + 1) * dim)));
    }
    parentPort!.postMessage({ id: req.id, embeddings } as EmbedResponse);
  } catch (err) {
    parentPort!.postMessage({ id: req.id, embeddings: [], error: String(err) } as EmbedResponse);
  }
});

init();
