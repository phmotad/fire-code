import { InMemoryGraphStore } from '../../../src/graph/InMemoryGraphStore';
import { SQLiteGraphStore } from '../../../src/graph/SQLiteGraphStore';
import { DatabaseManager } from '../../../src/db/DatabaseManager';
import type { FileNode, FunctionNode, DependencyEdge } from '../../../src/graph/GraphStore';
import { join } from 'path';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';

function makeFile(id: string, path: string): FileNode {
  return { id, type: 'file', label: path, path, functions: [], exports: [] };
}

function makeFn(id: string, filePath: string, name: string): FunctionNode {
  return { id, type: 'function', label: name, filePath, line: 1, isExported: true, parameters: [] };
}

// ── InMemoryGraphStore ────────────────────────────────────────────────────

describe('InMemoryGraphStore', () => {
  let store: InMemoryGraphStore;

  beforeEach(() => {
    store = new InMemoryGraphStore();
  });

  it('adds and retrieves nodes', () => {
    const node = makeFile('file:a.ts', 'a.ts');
    store.addNode(node);
    expect(store.getNode('file:a.ts')).toEqual(node);
  });

  it('returns undefined for missing node', () => {
    expect(store.getNode('nonexistent')).toBeUndefined();
  });

  it('adds edges and retrieves neighbors', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.addNode(makeFile('file:b.ts', 'b.ts'));
    const edge: DependencyEdge = { from: 'file:a.ts', to: 'file:b.ts', type: 'imports' };
    store.addEdge(edge);
    const neighbors = store.getNeighbors('file:a.ts');
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].id).toBe('file:b.ts');
  });

  it('returns empty neighbors for unknown node', () => {
    expect(store.getNeighbors('x')).toEqual([]);
  });

  it('queries by type', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.addNode(makeFn('fn:a.ts:foo', 'a.ts', 'foo'));
    const files = store.query({ type: 'file' });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe('file');
  });

  it('queries by label partial match', () => {
    store.addNode(makeFile('file:auth.ts', 'auth.ts'));
    store.addNode(makeFile('file:user.ts', 'user.ts'));
    const results = store.query({ label: 'auth' });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('file:auth.ts');
  });

  it('returns correct stats', () => {
    store.addNode(makeFile('f1', 'a.ts'));
    store.addNode(makeFile('f2', 'b.ts'));
    store.addNode(makeFn('fn1', 'a.ts', 'foo'));
    store.addEdge({ from: 'f1', to: 'f2', type: 'imports' });
    const stats = store.getStats();
    expect(stats.nodes).toBe(3);
    expect(stats.edges).toBe(1);
    expect(stats.byType.file).toBe(2);
    expect(stats.byType.function).toBe(1);
  });

  it('serializes and deserializes', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
    const serialized = store.serialize();
    const restored = InMemoryGraphStore.deserialize(serialized);
    expect(restored.getNode('file:a.ts')).toBeDefined();
    expect(restored.getStats().edges).toBe(1);
  });
});

// ── SQLiteGraphStore ──────────────────────────────────────────────────────

describe('SQLiteGraphStore', () => {
  let tmpDir: string;
  let store: SQLiteGraphStore;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'firecode-graph-test-'));
    DatabaseManager.reset();
    const db = DatabaseManager.getInstance(tmpDir);
    store = db.getGraphStore('test-project');
  });

  afterEach(() => {
    DatabaseManager.reset();
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('adds and retrieves nodes', () => {
    const node = makeFile('file:a.ts', 'a.ts');
    store.addNode(node);
    const retrieved = store.getNode('file:a.ts');
    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe('file:a.ts');
  });

  it('returns undefined for missing node', () => {
    expect(store.getNode('nonexistent')).toBeUndefined();
  });

  it('adds edges and retrieves neighbors', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.addNode(makeFile('file:b.ts', 'b.ts'));
    store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
    const neighbors = store.getNeighbors('file:a.ts');
    expect(neighbors).toHaveLength(1);
    expect(neighbors[0].id).toBe('file:b.ts');
  });

  it('queries by type', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.addNode(makeFn('fn:a.ts:foo', 'a.ts', 'foo'));
    const files = store.query({ type: 'file' });
    expect(files).toHaveLength(1);
    expect(files[0].type).toBe('file');
  });

  it('returns correct stats', () => {
    store.addNode(makeFile('f1', 'a.ts'));
    store.addNode(makeFile('f2', 'b.ts'));
    store.addNode(makeFn('fn1', 'a.ts', 'foo'));
    store.addEdge({ from: 'f1', to: 'f2', type: 'imports' });
    const stats = store.getStats();
    expect(stats.nodes).toBe(3);
    expect(stats.edges).toBe(1);
    expect(stats.byType.file).toBe(2);
    expect(stats.byType.function).toBe(1);
  });

  it('BFS traversal via graphology', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.addNode(makeFile('file:b.ts', 'b.ts'));
    store.addNode(makeFile('file:c.ts', 'c.ts'));
    store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
    store.addEdge({ from: 'file:b.ts', to: 'file:c.ts', type: 'imports' });
    const reachable = store.reachableFrom('file:a.ts', 5);
    const ids = reachable.map(n => n.id);
    expect(ids).toContain('file:b.ts');
    expect(ids).toContain('file:c.ts');
  });

  it('dependantsOf returns reverse deps', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.addNode(makeFile('file:b.ts', 'b.ts'));
    store.addEdge({ from: 'file:a.ts', to: 'file:b.ts', type: 'imports' });
    const deps = store.dependantsOf('file:b.ts');
    expect(deps.map(n => n.id)).toContain('file:a.ts');
  });

  it('upsert overwrites existing node', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    const updated: FileNode = { id: 'file:a.ts', type: 'file', label: 'a-updated.ts', path: 'a.ts', functions: ['foo'], exports: [] };
    store.addNode(updated);
    expect(store.getNode('file:a.ts')?.label).toBe('a-updated.ts');
  });

  it('clear removes all project data', () => {
    store.addNode(makeFile('file:a.ts', 'a.ts'));
    store.clear();
    expect(store.getStats().nodes).toBe(0);
  });
});
