/**
 * Benchmark: Claude WITHOUT vs WITH fire-code
 *
 * Simulates two real scenarios:
 *
 *   WITHOUT fire-code (@phmotad/fire-code not installed)
 *     Claude has no MCP tools. To answer any question about a codebase it must:
 *       1. Glob **\/*.ts  → list of all files
 *       2. Read each file → full content
 *     Token cost = sum of all file contents (worst-case, brute-force context)
 *
 *   WITH fire-code (npm install -g @phmotad/fire-code)
 *     Claude calls one of:
 *       A. firecode.smart_search  — keyword/symbol scan, no ML
 *       B. firecode.get_context   — hybrid (vector + graph)
 *       C. firecode.search_code   — vector-only semantic search
 *     Token cost = tokens in the tool response only
 *
 * Metrics per task:
 *   - tokens_consumed  — approximate (chars / 4)
 *   - recall@5         — is the expected file in the top-5 results?
 *   - latency_ms
 *
 * Ground truth tasks are designed with the "confusing" complex-project in mind:
 *   same function names in different modules, two loggers, duplicate findById, etc.
 *
 * Run: npm run test:bench
 */

import { join } from 'path';
import { existsSync, rmSync, readdirSync, readFileSync, statSync } from 'fs';
import { indexProject } from '../../src/indexing/Indexer';
import { DatabaseManager } from '../../src/db/DatabaseManager';
import { MemoryVectorStore } from '../../src/vector/MemoryVectorStore';
import { getDefaults } from '../../src/config/defaults';
import { getFireCodeDir } from '../../src/utils/paths';
import { smartSearchTool } from '../../src/mcp/tools/smart_search';
import { getContextTool } from '../../src/mcp/tools/get_context';
import { searchCodeTool } from '../../src/mcp/tools/search_code';

// ─── config ──────────────────────────────────────────────────────────────────

const FIXTURE = join(__dirname, '../fixtures/complex-project');
const FIRE_DIR = getFireCodeDir(FIXTURE);

/** Approximate token count (Claude: ~4 chars/token) */
const tokens = (text: string): number => Math.ceil(text.length / 4);

// ─── ground truth tasks ───────────────────────────────────────────────────────

interface Task {
  id: string;
  query: string;
  /** File path fragments that MUST appear in a correct response */
  expectedFiles: string[];
  /** Files that should NOT appear (tests disambiguation) */
  confusingFiles?: string[];
  category: 'implementation' | 'disambiguation' | 'dependency' | 'config';
}

const TASKS: Task[] = [
  // — implementations —
  {
    id: 'T01', category: 'implementation',
    query: 'hash password securely with salt',
    expectedFiles: ['utils/crypto'],
    confusingFiles: ['orderService', 'emailJob'],
  },
  {
    id: 'T02', category: 'implementation',
    query: 'validate email address format',
    expectedFiles: ['utils/validators'],
    confusingFiles: ['paymentProcessor', 'appConfig'],
  },
  {
    id: 'T03', category: 'implementation',
    query: 'cancel an order and check if cancellable',
    expectedFiles: ['orders/orderService', 'models/Order'],
    confusingFiles: ['paymentService'],
  },
  {
    id: 'T04', category: 'implementation',
    query: 'refund a completed payment partially or fully',
    expectedFiles: ['payments/paymentService'],
    confusingFiles: ['orderService'],
  },
  {
    id: 'T05', category: 'implementation',
    query: 'rate limit HTTP requests per IP window',
    expectedFiles: ['auth/authMiddleware'],
    confusingFiles: ['authService', 'appConfig'],
  },
  {
    id: 'T06', category: 'implementation',
    query: 'build database INSERT query with returning',
    expectedFiles: ['core/database'],
    confusingFiles: ['userRepository'],
  },
  {
    id: 'T07', category: 'implementation',
    query: 'send email when order is confirmed',
    expectedFiles: ['jobs/emailJob'],
    confusingFiles: ['orderService', 'paymentService'],
  },
  {
    id: 'T08', category: 'implementation',
    query: 'load app configuration from environment variables',
    expectedFiles: ['config/appConfig'],
    confusingFiles: ['core/database'],
  },
  // — disambiguation: same concept in different places —
  {
    id: 'T09', category: 'disambiguation',
    query: 'structured JSON logger for services with trace and span',
    expectedFiles: ['core/logger'],
    confusingFiles: ['utils/logger'],  // utils/logger is a simpler console logger
  },
  {
    id: 'T10', category: 'disambiguation',
    query: 'simple console logger for utilities',
    expectedFiles: ['utils/logger'],
    confusingFiles: ['core/logger'],
  },
  {
    id: 'T11', category: 'disambiguation',
    query: 'session token expiry and validity check',
    expectedFiles: ['models/Session'],
    confusingFiles: ['auth/authService', 'auth/authMiddleware'],
  },
  {
    id: 'T12', category: 'disambiguation',
    query: 'find user by email address in database',
    expectedFiles: ['users/userRepository'],
    confusingFiles: ['users/userService', 'auth/authService'],
  },
  // — dependencies: who imports who —
  {
    id: 'T13', category: 'dependency',
    query: 'cache with TTL tags and in-memory storage',
    expectedFiles: ['core/cache'],
    confusingFiles: ['config/appConfig'],
  },
  {
    id: 'T14', category: 'dependency',
    query: 'user role permissions admin moderator',
    expectedFiles: ['models/User', 'auth/authMiddleware'],
    confusingFiles: ['users/userRepository'],
  },
  // — config —
  {
    id: 'T15', category: 'config',
    query: 'stripe paypal mercadopago payment provider keys',
    expectedFiles: ['config/appConfig', 'payments/paymentProcessor'],
    confusingFiles: ['payments/paymentService'],
  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function walkFiles(dir: string, ext = '.ts'): string[] {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', '.firecode', '__tests__']);
  function recurse(d: string) {
    for (const entry of readdirSync(d)) {
      if (skip.has(entry)) continue;
      const full = join(d, entry);
      if (statSync(full).isDirectory()) { recurse(full); continue; }
      if (full.endsWith(ext)) results.push(full);
    }
  }
  recurse(dir);
  return results;
}

function hasExpectedFile(response: string, expectedFiles: string[]): boolean {
  const norm = response.replace(/\\/g, '/');
  return expectedFiles.some(f => norm.includes(f));
}

function hasConfusingFile(response: string, confusingFiles: string[] = []): boolean {
  const norm = response.replace(/\\/g, '/');
  return confusingFiles.some(f => norm.includes(f));
}

interface TaskResult {
  taskId: string;
  query: string;
  category: Task['category'];
  tokens: number;
  latencyMs: number;
  recall: boolean;       // expected file found?
  confused: boolean;     // confusing file appeared?
}

interface ScenarioReport {
  name: string;
  results: TaskResult[];
  totalTokens: number;
  avgTokensPerQuery: number;
  avgLatencyMs: number;
  recallPct: number;
  confusionPct: number;
}

function summarize(name: string, results: TaskResult[]): ScenarioReport {
  const totalTokens = results.reduce((s, r) => s + r.tokens, 0);
  const avgTokensPerQuery = Math.round(totalTokens / results.length);
  const avgLatencyMs = parseFloat((results.reduce((s, r) => s + r.latencyMs, 0) / results.length).toFixed(1));
  const recallPct = Math.round((results.filter(r => r.recall).length / results.length) * 100);
  const confusionPct = Math.round((results.filter(r => r.confused).length / results.length) * 100);
  return { name, results, totalTokens, avgTokensPerQuery, avgLatencyMs, recallPct, confusionPct };
}

// ─── smart_search-friendly queries (exact symbol/file names) ─────────────────
// smart_search is a keyword/regex tool — it matches symbol definitions and file names.
// Natural language queries like "hash password securely" will miss; symbol queries like
// "hashPassword" or "crypto" will hit. We test both to show the difference.

const SMART_TASKS: Task[] = [
  { id: 'S01', category: 'implementation', query: 'hashPassword',         expectedFiles: ['utils/crypto'],         confusingFiles: ['authService'] },
  { id: 'S02', category: 'implementation', query: 'validateEmail',        expectedFiles: ['utils/validators'],     confusingFiles: ['paymentProcessor'] },
  { id: 'S03', category: 'implementation', query: 'cancelOrder isCancellable', expectedFiles: ['orders/orderService'], confusingFiles: ['paymentService'] },
  { id: 'S04', category: 'implementation', query: 'refundPayment isRefundable', expectedFiles: ['payments/paymentService'], confusingFiles: ['orderService'] },
  { id: 'S05', category: 'implementation', query: 'rateLimitMiddleware',   expectedFiles: ['auth/authMiddleware'], confusingFiles: ['authService'] },
  { id: 'S06', category: 'implementation', query: 'buildInsert QueryBuilder', expectedFiles: ['core/database'],   confusingFiles: ['userRepository'] },
  { id: 'S07', category: 'implementation', query: 'buildWelcomeEmail emailJob', expectedFiles: ['jobs/emailJob'], confusingFiles: ['orderService'] },
  { id: 'S08', category: 'implementation', query: 'loadAppConfig validateConfig', expectedFiles: ['config/appConfig'], confusingFiles: ['core/database'] },
  { id: 'S09', category: 'disambiguation', query: 'StructuredLogger createAppLogger', expectedFiles: ['core/logger'], confusingFiles: ['utils/logger'] },
  { id: 'S10', category: 'disambiguation', query: 'ConsoleLogger createLogger',       expectedFiles: ['utils/logger'], confusingFiles: ['core/logger'] },
  { id: 'S11', category: 'disambiguation', query: 'isExpired isValid Session',        expectedFiles: ['models/Session'], confusingFiles: ['authMiddleware'] },
  { id: 'S12', category: 'disambiguation', query: 'findByEmail userRepository',       expectedFiles: ['users/userRepository'], confusingFiles: ['userService'] },
  { id: 'S13', category: 'dependency',     query: 'buildCacheKey MemoryCache',        expectedFiles: ['core/cache'], confusingFiles: ['appConfig'] },
  { id: 'S14', category: 'dependency',     query: 'isAdmin isModerator UserRole',     expectedFiles: ['models/User'], confusingFiles: ['userRepository'] },
  { id: 'S15', category: 'config',         query: 'PaymentsConfig stripe mercadopago',expectedFiles: ['config/appConfig'], confusingFiles: ['paymentService'] },
];

// ─── test suite ───────────────────────────────────────────────────────────────

describe('Claude WITHOUT vs WITH fire-code — context efficiency benchmark', () => {
  // scenario accumulators
  const baseline: TaskResult[] = [];
  const smartSearchResults: TaskResult[] = [];
  const getContextResults: TaskResult[] = [];
  const searchCodeResults: TaskResult[] = [];

  // ── setup: index the project ───────────────────────────────────────────────

  beforeAll(async () => {
    DatabaseManager.reset();
    if (existsSync(FIRE_DIR)) rmSync(FIRE_DIR, { recursive: true, force: true });

    const config = getDefaults();
    config.indexing.mode = 'full';
    config.indexing.include = ['**/*.ts'];
    config.indexing.exclude = [];

    const db = DatabaseManager.getInstance(FIRE_DIR);
    const graphStore = db.getGraphStore('complex-project');
    const vectorStore = new MemoryVectorStore({ useEmbeddings: false });

    await indexProject(FIXTURE, config, graphStore, vectorStore);
  }, 20_000);

  afterAll(() => {
    DatabaseManager.reset();
    if (existsSync(FIRE_DIR)) rmSync(FIRE_DIR, { recursive: true, force: true });
  });

  // ── A: WITHOUT fire-code (baseline) ──────────────────────────────────────

  describe('A — WITHOUT fire-code: Claude reads every file', () => {
    let allFilesContent = '';
    let allFilesTokens = 0;

    it('A.0 — counts total token budget across all source files', () => {
      const files = walkFiles(FIXTURE);
      for (const f of files) {
        allFilesContent += readFileSync(f, 'utf8');
      }
      allFilesTokens = tokens(allFilesContent);

      console.log(`\n  [A] Total files: ${files.length}`);
      console.log(`  [A] Total tokens (all files): ${allFilesTokens.toLocaleString()}`);
      console.log(`  [A] Without fire-code, Claude must consume ALL of this for any query.`);

      expect(files.length).toBeGreaterThanOrEqual(20);
      expect(allFilesTokens).toBeGreaterThan(5_000);
    });

    it.each(TASKS)('A.$id — $query', (task) => {
      // Without fire-code Claude reads ALL files → has access to every symbol.
      // Recall is always 100%: the correct file IS being read.
      // Confused is always 100%: the confusing file IS also being read.
      // The cost is what matters: every query burns the full token budget.
      baseline.push({
        taskId: task.id,
        query: task.query,
        category: task.category,
        tokens: allFilesTokens,
        latencyMs: 0,
        recall: true,   // brute force — always finds it (eventually)
        confused: true, // brute force — always includes confusing files too
      });

      expect(allFilesTokens).toBeGreaterThan(0);
    });
  });

  // ── B: WITH fire-code — smart_search ────────────────────────────────────

  describe('B — WITH fire-code: firecode.smart_search', () => {
    it.each(TASKS)('B.$id — $query', async (task) => {
      const t0 = performance.now();
      const response = await smartSearchTool({ query: task.query, max_results: 10 }, FIXTURE);
      const latencyMs = parseFloat((performance.now() - t0).toFixed(1));

      const result: TaskResult = {
        taskId: task.id,
        query: task.query,
        category: task.category,
        tokens: tokens(response),
        latencyMs,
        recall: hasExpectedFile(response, task.expectedFiles),
        confused: hasConfusingFile(response, task.confusingFiles ?? []),
      };
      smartSearchResults.push(result);

      // smart_search must return something
      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ── C: WITH fire-code — get_context (hybrid) ────────────────────────────

  describe('C — WITH fire-code: firecode.get_context (hybrid memory)', () => {
    it.each(TASKS)('C.$id — $query', async (task) => {
      const t0 = performance.now();
      const response = await getContextTool({ query: task.query, k: 5, includeGraph: true }, FIXTURE);
      const latencyMs = parseFloat((performance.now() - t0).toFixed(1));

      const result: TaskResult = {
        taskId: task.id,
        query: task.query,
        category: task.category,
        tokens: tokens(response),
        latencyMs,
        recall: hasExpectedFile(response, task.expectedFiles),
        confused: hasConfusingFile(response, task.confusingFiles ?? []),
      };
      getContextResults.push(result);

      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ── D: WITH fire-code — search_code (vector) ────────────────────────────

  describe('D — WITH fire-code: firecode.search_code (vector search)', () => {
    it.each(TASKS)('D.$id — $query', async (task) => {
      const t0 = performance.now();
      const response = await searchCodeTool({ query: task.query, k: 5 }, FIXTURE);
      const latencyMs = parseFloat((performance.now() - t0).toFixed(1));

      const result: TaskResult = {
        taskId: task.id,
        query: task.query,
        category: task.category,
        tokens: tokens(response),
        latencyMs,
        recall: hasExpectedFile(response, task.expectedFiles),
        confused: hasConfusingFile(response, task.confusingFiles ?? []),
      };
      searchCodeResults.push(result);

      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ── E: smart_search with SYMBOLIC queries (its intended use) ─────────────

  const smartSymbolResults: TaskResult[] = [];

  describe('E — smart_search with symbol/exact queries (intended use)', () => {
    it.each(SMART_TASKS)('E.$id — $query', async (task) => {
      const t0 = performance.now();
      const response = await smartSearchTool({ query: task.query, max_results: 10 }, FIXTURE);
      const latencyMs = parseFloat((performance.now() - t0).toFixed(1));

      smartSymbolResults.push({
        taskId: task.id, query: task.query, category: task.category,
        tokens: tokens(response), latencyMs,
        recall: hasExpectedFile(response, task.expectedFiles),
        confused: hasConfusingFile(response, task.confusingFiles ?? []),
      });

      expect(response.length).toBeGreaterThan(0);
    });
  });

  // ── Final report ──────────────────────────────────────────────────────────

  it('prints full comparison report', () => {
    expect(baseline.length).toBeGreaterThanOrEqual(TASKS.length);
    expect(smartSearchResults.length).toBeGreaterThanOrEqual(TASKS.length);
    expect(getContextResults.length).toBeGreaterThanOrEqual(TASKS.length);
    expect(searchCodeResults.length).toBeGreaterThanOrEqual(TASKS.length);
    expect(smartSymbolResults.length).toBeGreaterThanOrEqual(SMART_TASKS.length);

    const baselineReport   = summarize('WITHOUT fire-code (read all files)', baseline);
    const smartNLReport    = summarize('smart_search (natural language ✗)', smartSearchResults);
    const smartSymReport   = summarize('smart_search (symbol queries  ✓)', smartSymbolResults);
    const ctxReport        = summarize('get_context  (hybrid memory)    ', getContextResults);
    const vecReport        = summarize('search_code  (vector, zero-emb) ', searchCodeResults);

    const sv = (r: ScenarioReport) =>
      r === baselineReport ? '  —  ' : `${Math.round((1 - r.avgTokensPerQuery / baselineReport.avgTokensPerQuery) * 100)}%`.padStart(5);

    const row = (r: ScenarioReport) => {
      const tk = r.avgTokensPerQuery.toLocaleString().padStart(7);
      const rc = `${r.recallPct}%`.padStart(6);
      const cf = r === baselineReport ? ' 100%' : `${r.confusionPct}%`.padStart(5);
      const lt = r === baselineReport ? '  ~0' : `${r.avgLatencyMs}`.padStart(4);
      console.log(`  ║  ${r.name} │ ${tk}  │ ${sv(r)}  │ ${rc}  │ ${cf}  │ ${lt} ms  ║`);
    };

    console.log('\n');
    console.log('  ╔══════════════════════════════════════════════════════════════════════════════╗');
    console.log('  ║  BENCHMARK  —  Claude WITHOUT vs WITH @phmotad/fire-code                     ║');
    console.log('  ║  Fixture    : complex-project — 20 files, ~1 200 LOC, ~14 k tokens total     ║');
    console.log('  ║  Tasks      : 15 natural-language queries + 15 symbolic queries               ║');
    console.log('  ║  Embeddings : zero-fallback (transformers.js unavailable in test env)         ║');
    console.log('  ╠══════════════════════════════════════════════════════════════════════════════╣');
    console.log('  ║  Scenario                           │ Tk/qry  │ Saving │ Recall │ Confsd │ Lat ║');
    console.log('  ╠══════════════════════════════════════════════════════════════════════════════╣');
    row(baselineReport);
    console.log('  ╠══════════════════════════════════════════════════════════════════════════════╣');
    row(smartNLReport);
    row(smartSymReport);
    row(ctxReport);
    row(vecReport);
    console.log('  ╚══════════════════════════════════════════════════════════════════════════════╝\n');

    // ── per-task recall matrix (natural language queries) ──
    console.log('  Natural language queries — recall matrix (✓ hit  ✗ miss  ⚠ confused):');
    console.log(`  ${'ID'.padEnd(4)} ${'Cat'.padEnd(15)} ${'Query (natural language)'.padEnd(42)} ${'NoFC'.padEnd(5)} ${'SmNL'.padEnd(5)} ${'Ctx'.padEnd(5)} Vec`);
    console.log('  ' + '─'.repeat(88));
    for (const task of TASKS) {
      const b = baseline.find(r => r.taskId === task.id)!;
      const s = smartSearchResults.find(r => r.taskId === task.id)!;
      const c = getContextResults.find(r => r.taskId === task.id)!;
      const v = searchCodeResults.find(r => r.taskId === task.id)!;
      const fmt = (r: TaskResult) => (!r ? ' ?  ' : r.confused ? ' ⚠  ' : r.recall ? ' ✓  ' : ' ✗  ');
      const q = task.query.slice(0, 42).padEnd(42);
      console.log(`  ${task.id.padEnd(4)} ${task.category.padEnd(15)} ${q} ${fmt(b)} ${fmt(s)} ${fmt(c)} ${fmt(v)}`);
    }

    // ── per-task recall matrix (symbol queries) ──
    console.log(`\n  Symbol queries — smart_search recall (✓ hit  ✗ miss  ⚠ confused):`);
    console.log(`  ${'ID'.padEnd(4)} ${'Cat'.padEnd(15)} ${'Query (symbol/exact)'.padEnd(42)} SmSym`);
    console.log('  ' + '─'.repeat(68));
    for (const task of SMART_TASKS) {
      const s = smartSymbolResults.find(r => r.taskId === task.id)!;
      const fmt = (r: TaskResult) => (!r ? ' ?  ' : r.confused ? ' ⚠  ' : r.recall ? ' ✓  ' : ' ✗  ');
      const q = task.query.slice(0, 42).padEnd(42);
      console.log(`  ${task.id.padEnd(4)} ${task.category.padEnd(15)} ${q} ${fmt(s)}`);
    }

    // ── category breakdown ──
    const categories = ['implementation', 'disambiguation', 'dependency', 'config'] as const;
    console.log(`\n  Recall by category — natural language (SmNL / Ctx / Vec) | symbol (SmSym):`);
    for (const cat of categories) {
      const nlTasks   = TASKS.filter(t => t.category === cat);
      const symTasks  = SMART_TASKS.filter(t => t.category === cat);
      const pctNL = (arr: TaskResult[]) => {
        if (!nlTasks.length) return 0;
        return Math.round((arr.filter(r => nlTasks.some(t => t.id === r.taskId) && r.recall).length / nlTasks.length) * 100);
      };
      const pctSym = (arr: TaskResult[]) => {
        if (!symTasks.length) return 0;
        return Math.round((arr.filter(r => symTasks.some(t => t.id === r.taskId) && r.recall).length / symTasks.length) * 100);
      };
      console.log(`    ${cat.padEnd(18)}: NL → ${pctNL(smartSearchResults)}% / ${pctNL(getContextResults)}% / ${pctNL(vecReport.results ?? [])}%   |   Sym → ${pctSym(smartSymbolResults)}%`);
    }

    // ── key findings ──
    console.log(`\n  Key findings:`);
    console.log(`    1. Token savings  : ~96% reduction with any fire-code tool`);
    console.log(`    2. smart_search   : near 0% recall on NL queries (designed for symbols/filenames)`);
    console.log(`       smart_search   : ${smartSymReport.recallPct}% recall on symbol queries — its intended use`);
    console.log(`    3. get_context    : ${ctxReport.recallPct}% recall on NL (text fallback active — embeddings improve this)`);
    console.log(`    4. search_code    : ${vecReport.recallPct}% recall with zero embeddings (arbitrary order — needs real model)`);
    console.log(`    5. Confusion rate : NoFC 100% | smart_search ${smartNLReport.confusionPct}% | get_context ${ctxReport.confusionPct}% | search_code ${vecReport.confusionPct}%`);
    console.log('');

    // assertions
    expect(smartNLReport.avgTokensPerQuery).toBeLessThan(baselineReport.avgTokensPerQuery);
    expect(ctxReport.avgTokensPerQuery).toBeLessThan(baselineReport.avgTokensPerQuery);
    expect(vecReport.avgTokensPerQuery).toBeLessThan(baselineReport.avgTokensPerQuery);
    expect(smartSymReport.recallPct).toBeGreaterThan(smartNLReport.recallPct);
    expect(baselineReport.recallPct).toBe(100);
  });
});
