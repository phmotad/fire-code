import { HybridMemory } from '../../../src/memory/HybridMemory';
import type { VectorStore, ScoredDocument } from '../../../src/vector/VectorStore';
import type { GraphStore, GraphNode, GraphQueryFilter } from '../../../src/graph/GraphStore';

function makeVectorStore(results: ScoredDocument[] = []): VectorStore {
  return {
    add: jest.fn(),
    search: jest.fn().mockResolvedValue(results),
    delete: jest.fn(),
    clear: jest.fn(),
    size: jest.fn().mockReturnValue(results.length),
  };
}

function makeGraphStore(): GraphStore {
  return {
    addNode: jest.fn(),
    addEdge: jest.fn(),
    getNode: jest.fn().mockReturnValue(undefined),
    getNeighbors: jest.fn().mockReturnValue([]),
    dependantsOf: jest.fn().mockReturnValue([]),
    query: jest.fn().mockReturnValue([]),
    getStats: jest.fn().mockReturnValue({ nodes: 0, edges: 0, byType: {} }),
    serialize: jest.fn().mockReturnValue('{}'),
    clear: jest.fn(),
  } as unknown as GraphStore;
}

describe('HybridMemory', () => {
  test('retrieve returns empty context when stores have no results', async () => {
    const memory = new HybridMemory(makeVectorStore([]), makeGraphStore());
    const result = await memory.retrieve('find something', { k: 3 });
    expect(result.vectorResults).toHaveLength(0);
    expect(result.graphResults).toHaveLength(0);
    expect(result.combined).toContain('find something');
  });

  test('retrieve includes code snippets from vector results', async () => {
    const docs: ScoredDocument[] = [{
      document: {
        id: 'doc1',
        text: 'function hello() { return 42; }',
        metadata: { relativePath: 'src/hello.ts', type: 'file' },
      },
      score: 0.9,
    }];
    const memory = new HybridMemory(makeVectorStore(docs), makeGraphStore());
    const result = await memory.retrieve('hello function');
    expect(result.vectorResults).toHaveLength(1);
    expect(result.combined).toContain('src/hello.ts');
    expect(result.combined).toContain('function hello');
  });

  test('retrieve skips graph traversal when includeGraph=false', async () => {
    const graphStore = makeGraphStore();
    const memory = new HybridMemory(makeVectorStore([]), graphStore);
    await memory.retrieve('test query', { includeGraph: false });
    expect(graphStore.query).not.toHaveBeenCalled();
    expect(graphStore.getNeighbors).not.toHaveBeenCalled();
  });

  test('retrieve appends working diff to combined output', async () => {
    const memory = new HybridMemory(makeVectorStore([]), makeGraphStore());
    const diff = 'diff --git a/foo.ts b/foo.ts\n+const added = true;';
    const result = await memory.retrieve('test', { workingDiff: diff });
    expect(result.combined).toContain('Uncommitted Changes');
    expect(result.combined).toContain('added = true');
  });

  test('retrieve traverses graph from vector result file paths', async () => {
    const docs: ScoredDocument[] = [{
      document: {
        id: 'd1',
        text: 'some code',
        metadata: { relativePath: 'src/utils.ts', type: 'file' },
      },
      score: 0.8,
    }];
    const fileNode: GraphNode = {
      id: 'file:src/utils.ts',
      type: 'file',
      label: 'utils.ts',
      path: 'src/utils.ts',
      functions: [],
      exports: ['foo'],
    };
    const graphStore = makeGraphStore();
    (graphStore.getNode as jest.Mock).mockImplementation((id: string) =>
      id === 'file:src/utils.ts' ? fileNode : undefined
    );
    const memory = new HybridMemory(makeVectorStore(docs), graphStore);
    await memory.retrieve('utils helper');
    expect(graphStore.getNode).toHaveBeenCalledWith('file:src/utils.ts');
    expect(graphStore.getNeighbors).toHaveBeenCalledWith('file:src/utils.ts');
  });

  test('retrieve includes commit history for matched file paths', async () => {
    const docs: ScoredDocument[] = [{
      document: {
        id: 'd1',
        text: 'code',
        metadata: { relativePath: 'src/auth.ts', type: 'file' },
      },
      score: 0.85,
    }];
    const commitNode: GraphNode = {
      id: 'commit:abc123',
      type: 'commit',
      label: 'fix: auth bug',
      sha: 'abc123def456',
      message: 'fix: resolve auth token issue',
      timestamp: '2024-03-15T10:00:00Z',
      filesChanged: ['src/auth.ts'],
    };
    const graphStore = makeGraphStore();
    (graphStore.dependantsOf as jest.Mock).mockReturnValue([commitNode]);
    const memory = new HybridMemory(makeVectorStore(docs), graphStore);
    const result = await memory.retrieve('auth token');
    expect(result.combined).toContain('Git History');
    expect(result.combined).toContain('abc123d');
    expect(result.combined).toContain('auth token issue');
  });

  test('retrieve queries graph for exact symbol matches in query tokens', async () => {
    const graphStore = makeGraphStore();
    const memory = new HybridMemory(makeVectorStore([]), graphStore);
    await memory.retrieve('getUserById function');
    expect(graphStore.query).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'function', exact: true })
    );
  });

  test('graph results include function nodes in combined output', async () => {
    const fnNode: GraphNode = {
      id: 'fn:getUserById',
      type: 'function',
      label: 'getUserById',
      filePath: 'src/users.ts',
      line: 42,
      isExported: true,
      parameters: ['id: string'],
      returnType: 'User',
    };
    const graphStore = makeGraphStore();
    (graphStore.query as jest.Mock).mockImplementation((filter: GraphQueryFilter) =>
      filter.exact ? [fnNode] : []
    );
    const memory = new HybridMemory(makeVectorStore([]), graphStore);
    const result = await memory.retrieve('getUserById');
    expect(result.graphResults).toContainEqual(fnNode);
    expect(result.combined).toContain('getUserById');
  });
});
