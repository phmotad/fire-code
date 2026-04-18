import { MemoryVectorStore } from '../../../src/vector/MemoryVectorStore';
import type { Document } from '../../../src/vector/VectorStore';

function makeDoc(id: string, text: string, embedding?: number[]): Document {
  return { id, text, metadata: { relativePath: `${id}.ts` }, embedding };
}

function makeEmbedding(seed: number): number[] {
  const arr = new Array(384).fill(0) as number[];
  arr[seed % 384] = 1;
  return arr;
}

describe('MemoryVectorStore', () => {
  it('adds documents and reports size', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    await store.add([makeDoc('a', 'hello world'), makeDoc('b', 'goodbye')]);
    expect(store.size()).toBe(2);
  });

  it('returns empty results when store is empty', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    const results = await store.search('anything');
    expect(results).toEqual([]);
  });

  it('searches by text similarity (no embeddings)', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    await store.add([
      makeDoc('auth', 'authentication jwt token login'),
      makeDoc('db', 'database connection pool query'),
    ]);
    const results = await store.search('jwt authentication', 1);
    expect(results[0].document.id).toBe('auth');
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('respects k limit', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    for (let i = 0; i < 10; i++) {
      await store.add([makeDoc(`doc${i}`, `content about topic ${i}`)]);
    }
    const results = await store.search('content', 3);
    expect(results).toHaveLength(3);
  });

  it('searches with embeddings provided in documents', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    const docs = [
      makeDoc('a', 'auth', makeEmbedding(0)),
      makeDoc('b', 'db', makeEmbedding(1)),
    ];
    await store.add(docs);
    expect(store.size()).toBe(2);
    const results = await store.search('auth', 2);
    expect(results.length).toBeGreaterThan(0);
  });

  it('deletes documents', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    await store.add([makeDoc('x', 'test'), makeDoc('y', 'test2')]);
    await store.delete(['x']);
    expect(store.size()).toBe(1);
  });

  it('clears all documents', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    await store.add([makeDoc('x', 'test')]);
    await store.clear();
    expect(store.size()).toBe(0);
  });

  it('serializes and deserializes', async () => {
    const store = new MemoryVectorStore({ useEmbeddings: false });
    await store.add([makeDoc('x', 'hello', makeEmbedding(5))]);
    const serialized = store.serialize();
    const restored = MemoryVectorStore.deserialize(serialized);
    expect(restored.size()).toBe(1);
  });
});
