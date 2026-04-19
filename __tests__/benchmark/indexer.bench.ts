/**
 * Benchmark: complex-project indexing + search accuracy
 *
 * Fixture: 20 TS files, ~1 200 LOC — intentionally confusing:
 *   - `hash()`       defined in utils/crypto.ts; ALSO imported inside authService.ts
 *   - `findById()`   class method in SqlUserRepository, OrderService, PaymentService
 *   - `validateEmail()` defined in validators.ts; called inside authService.ts (not re-defined)
 *   - `Logger` vs `AppLogger`   — two separate logger interfaces, two separate files
 *   - `isValid()`    defined in models/Session.ts; imported by authMiddleware.ts
 *   - `buildCacheKey()` core/cache.ts — imported by 3 services
 *
 * Discovered limitations (documented below as known gaps):
 *   [GAP-1] GraphStore.query({ label }) uses LIKE %label% — substring, not exact.
 *           query({ label: 'hash' }) also returns `hashPassword`, `hashUserPassword`.
 *   [GAP-2] GraphBuilder only creates FunctionNodes for top-level functions / arrow fns.
 *           Class methods (findById, etc.) appear in ParsedClass.methods but not as
 *           individual FunctionNode entries in the graph.
 *   [GAP-3] Zero-embedding fallback (transformers.js unavailable in test) means
 *           vector search returns documents in arbitrary / insertion order.
 *           Semantic accuracy tests are only valid with real embeddings.
 */

import { join } from 'path';
import { existsSync, rmSync } from 'fs';
import { indexProject } from '../../src/indexing/Indexer';
import { DatabaseManager } from '../../src/db/DatabaseManager';
import { MemoryVectorStore } from '../../src/vector/MemoryVectorStore';
import { getDefaults } from '../../src/config/defaults';
import { getFireCodeDir } from '../../src/utils/paths';
import type { FunctionNode, FileNode } from '../../src/graph/GraphStore';

const FIXTURE = join(__dirname, '../fixtures/complex-project');
const FIRE_DIR = getFireCodeDir(FIXTURE);

afterAll(() => {
  DatabaseManager.reset();
  if (existsSync(FIRE_DIR)) rmSync(FIRE_DIR, { recursive: true, force: true });
});

function mark(label: string): () => number {
  const start = performance.now();
  return () => {
    const ms = performance.now() - start;
    console.log(`  [bench] ${label}: ${ms.toFixed(1)}ms`);
    return ms;
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('Benchmark — complex-project (20 files, ~1 200 LOC)', () => {
  let graphStore: ReturnType<DatabaseManager['getGraphStore']>;
  let vectorStore: MemoryVectorStore;

  beforeAll(async () => {
    DatabaseManager.reset();
    if (existsSync(FIRE_DIR)) rmSync(FIRE_DIR, { recursive: true, force: true });
    const db = DatabaseManager.getInstance(FIRE_DIR);
    graphStore = db.getGraphStore('complex-project');
    vectorStore = new MemoryVectorStore({ useEmbeddings: false });
  }, 10_000);

  // ── 1. Indexing throughput ────────────────────────────────────────────────

  it('full index completes in < 8 s and covers all files', async () => {
    const config = getDefaults();
    config.indexing.mode = 'full';
    config.indexing.include = ['**/*.ts'];
    config.indexing.exclude = [];

    const stop = mark('full index');
    const result = await indexProject(FIXTURE, config, graphStore, vectorStore);
    const ms = stop();

    console.log(`  files: ${result.filesIndexed}`);
    console.log(`  fns  : ${result.functionsFound}`);
    console.log(`  nodes: ${result.nodesCreated}`);
    console.log(`  edges: ${result.edgesCreated}`);

    expect(ms).toBeLessThan(8_000);
    expect(result.filesIndexed).toBeGreaterThanOrEqual(20);
    expect(result.functionsFound).toBeGreaterThanOrEqual(60);
    expect(result.nodesCreated).toBeGreaterThanOrEqual(80);
    expect(result.edgesCreated).toBeGreaterThanOrEqual(10);
  }, 15_000);

  // ── 2. File nodes ─────────────────────────────────────────────────────────

  it('all 20 source files appear as file nodes in the graph', () => {
    const stop = mark('file nodes');
    const fileNodes = graphStore.query({ type: 'file' }) as FileNode[];
    stop();

    const paths = fileNodes.map(n => (n.label ?? n.path ?? '').replace(/\\/g, '/'));

    const expected = [
      'models/User', 'models/Payment', 'models/Order', 'models/Session',
      'utils/crypto', 'utils/validators', 'utils/logger',
      'core/database', 'core/cache', 'core/logger',
      'auth/authService', 'auth/authMiddleware',
      'users/userRepository', 'users/userService',
      'payments/paymentService', 'payments/paymentProcessor',
      'orders/orderService',
      'api/router',
      'jobs/emailJob',
      'config/appConfig',
    ];

    for (const fragment of expected) {
      const found = paths.some(p => p.includes(fragment));
      if (!found) console.warn(`  MISSING file node: ${fragment}`);
      expect(found).toBe(true);
    }
  });

  // ── 3. Top-level function extraction ─────────────────────────────────────

  it('top-level exported functions are indexed as function nodes', () => {
    const stop = mark('top-level functions');

    // Functions that are top-level (not class methods) — should all be indexed
    const topLevelFunctions = [
      'calculateFee',          // models/Payment.ts
      'calculateTotal',        // models/Order.ts
      'isExpired',             // models/Session.ts
      'isAdmin',               // models/User.ts
      'generateToken',         // utils/crypto.ts
      'validateEmail',         // utils/validators.ts
      'buildCacheKey',         // core/cache.ts
      'buildInsert',           // core/database.ts
      'validateRegistration',  // auth/authService.ts
      'buildWelcomeEmail',     // jobs/emailJob.ts
      'loadAppConfig',         // config/appConfig.ts
      'normalizeAmount',       // payments/paymentProcessor.ts
    ];

    stop();

    for (const name of topLevelFunctions) {
      const nodes = graphStore.query({ type: 'function', label: name }) as FunctionNode[];
      // LIKE %name% — may return more than one if name is a substring of another fn name
      const exact = nodes.filter(n => n.label === name);
      if (exact.length === 0) console.warn(`  MISSING top-level fn: ${name}`);
      expect(exact.length).toBeGreaterThanOrEqual(1);
    }
  });

  // ── 4. Graph: LIKE vs exact — [GAP-1] documented ─────────────────────────

  it('[GAP-1] query({ label: "hash" }) returns SUBSTRING matches (hash + hashPassword + hashUserPassword)', () => {
    const stop = mark('label LIKE match');
    const allHashNodes = graphStore.query({ type: 'function', label: 'hash' }) as FunctionNode[];
    stop();

    // LIKE %hash% returns hashPassword and hashUserPassword too — documented behavior
    expect(allHashNodes.length).toBeGreaterThan(1);

    // The one true `hash()` function is findable by filtering the results
    const exactHash = allHashNodes.filter(n => n.label === 'hash');
    expect(exactHash.length).toBe(1);
    expect(exactHash[0].filePath).toContain('crypto');

    // hashPassword exists separately in crypto.ts
    const hashPassword = allHashNodes.filter(n => n.label === 'hashPassword');
    expect(hashPassword.length).toBeGreaterThanOrEqual(1);

    console.log(`  query('hash') → ${allHashNodes.length} nodes (LIKE-match includes: ${allHashNodes.map(n => n.label).join(', ')})`);
    console.log(`  → exact 'hash' resolves to: ${exactHash[0].filePath}`);
  });

  it('[GAP-1] buildCacheKey has exactly one EXACT match — one definition in core/cache', () => {
    const stop = mark('buildCacheKey exact');
    const nodes = graphStore.query({ type: 'function', label: 'buildCacheKey' }) as FunctionNode[];
    stop();

    // 'buildCacheKey' is not a substring of any other function name in this fixture
    expect(nodes.length).toBe(1);
    expect(nodes[0].filePath).toContain('cache');
  });

  it('[GAP-1] createLogger and createAppLogger are different functions in different modules', () => {
    const loggerNodes    = (graphStore.query({ type: 'function', label: 'createLogger' }) as FunctionNode[])
      .filter(n => n.label === 'createLogger');
    const appLoggerNodes = (graphStore.query({ type: 'function', label: 'createAppLogger' }) as FunctionNode[])
      .filter(n => n.label === 'createAppLogger');

    expect(loggerNodes.length).toBeGreaterThanOrEqual(1);
    expect(appLoggerNodes.length).toBeGreaterThanOrEqual(1);
    expect(loggerNodes[0].filePath).toContain('utils');
    expect(appLoggerNodes[0].filePath).toContain('core');
    expect(loggerNodes[0].filePath).not.toBe(appLoggerNodes[0].filePath);
  });

  // ── 5. Class method gap — [GAP-2] documented ─────────────────────────────

  it('[GAP-2] class methods (findById) are NOT indexed as FunctionNodes — only as class metadata', () => {
    const stop = mark('class method gap');
    const fnNodes = (graphStore.query({ type: 'function', label: 'findById' }) as FunctionNode[])
      .filter(n => n.label === 'findById');
    stop();

    // findById is a class method on SqlUserRepository, OrderService, PaymentService.
    // GraphBuilder does not create FunctionNode entries for class methods — only for
    // top-level functions and arrow functions.
    // This is GAP-2: class methods are invisible to the function-level graph.
    expect(fnNodes.length).toBe(0);
    console.log('  [GAP-2] findById class method — 0 FunctionNodes (class methods not indexed individually)');

    // BUT the classes themselves ARE captured — verify via file nodes that have the classes
    const userRepoFile = (graphStore.query({ type: 'file' }) as FileNode[])
      .find(n => (n.label ?? '').includes('userRepository'));
    expect(userRepoFile).toBeDefined();
    // The class methods are stored in the class metadata on the ParsedClass — not in the graph
  });

  // ── 6. Import edges (dependency graph) ───────────────────────────────────

  it('import edges exist between related modules', () => {
    const stop = mark('import edges');
    const stats = graphStore.getStats();
    stop();

    // 20 files should generate many import edges (auth → utils, services → core, etc.)
    expect(stats.edges).toBeGreaterThanOrEqual(10);
    console.log(`  edges: ${stats.edges} (import relationships)`);
  });

  // ── 7. Vector search coverage (file-level, not semantic) ─────────────────

  it('vector store holds documents for all indexed files', async () => {
    const stop = mark('vector store size');
    const size = vectorStore.size();
    stop();

    // Each file produces 1+ chunks → 20 files → at least 20 documents
    expect(size).toBeGreaterThanOrEqual(20);
    console.log(`  vector docs: ${size} (chunks across 20 files)`);
  });

  it('[GAP-3] vector search returns results but semantic ranking is arbitrary with zero embeddings', async () => {
    const stop = mark('vector search (zero embeddings)');
    const results = await vectorStore.search('hash password crypto', 5);
    stop();

    // Results exist (5 documents returned)
    expect(results.length).toBe(5);

    // All documents have relativePath metadata
    for (const r of results) {
      expect(r.document.metadata['relativePath']).toBeDefined();
    }

    // With zero embeddings, scores are all 0 — semantic order is undefined
    const allZero = results.every(r => r.score === 0);
    console.log(`  [GAP-3] all scores zero: ${allZero} — semantic search requires real embeddings`);

    // We can still verify metadata structure is correct
    const paths = results.map(r => (r.document.metadata['relativePath'] as string).replace(/\\/g, '/'));
    expect(paths.every(p => p.includes('src/'))).toBe(true);
  });

  // ── 8. Re-indexing idempotency ────────────────────────────────────────────

  it('re-indexing the same project does not double the node count', async () => {
    const before = graphStore.getStats().nodes;

    const config = getDefaults();
    config.indexing.mode = 'full';
    config.indexing.include = ['**/*.ts'];
    config.indexing.exclude = [];

    const db2 = DatabaseManager.getInstance(FIRE_DIR);
    const gs2 = db2.getGraphStore('complex-project');
    const vs2 = new MemoryVectorStore({ useEmbeddings: false });

    const stop = mark('re-index idempotency');
    await indexProject(FIXTURE, config, gs2, vs2);
    stop();

    const after = graphStore.getStats().nodes;
    // SQLite UPSERT — node count must not grow unboundedly
    expect(after).toBeLessThanOrEqual(Math.ceil(before * 1.1));
    console.log(`  nodes before: ${before}, after re-index: ${after}`);
  }, 15_000);

  // ── 9. Summary ────────────────────────────────────────────────────────────

  it('prints benchmark summary', () => {
    const stats = graphStore.getStats();
    const vsSize = vectorStore.size();

    console.log(`\n  ┌─ Benchmark Summary ──────────────────────────────────────┐`);
    console.log(`  │  File nodes     : ${String(stats.byType['file'] ?? 0).padStart(4)}                                  │`);
    console.log(`  │  Function nodes : ${String(stats.byType['function'] ?? 0).padStart(4)}                                  │`);
    console.log(`  │  Total nodes    : ${String(stats.nodes).padStart(4)}                                  │`);
    console.log(`  │  Import edges   : ${String(stats.edges).padStart(4)}                                  │`);
    console.log(`  │  Vector chunks  : ${String(vsSize).padStart(4)}                                  │`);
    console.log(`  ├─ Known Gaps ────────────────────────────────────────────────┤`);
    console.log(`  │  GAP-1: query({ label }) uses LIKE %label% (substring)      │`);
    console.log(`  │  GAP-2: class methods not indexed as FunctionNodes           │`);
    console.log(`  │  GAP-3: semantic search needs real embeddings (not zero)     │`);
    console.log(`  └─────────────────────────────────────────────────────────────┘\n`);

    expect(stats.byType['file']).toBeGreaterThanOrEqual(20);
    expect(stats.byType['function']).toBeGreaterThanOrEqual(60);
  });
});
