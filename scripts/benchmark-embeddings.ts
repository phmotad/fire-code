#!/usr/bin/env tsx
/**
 * Benchmark com embeddings reais — roda via tsx (não Jest).
 * tsx suporta ESM nativo, então @xenova/transformers funciona sem problemas.
 *
 * Uso:
 *   npx tsx scripts/benchmark-embeddings.ts
 *   npm run bench:emb
 */

import { join, resolve } from 'path';
import { existsSync, rmSync, readdirSync, readFileSync, statSync } from 'fs';

// Aponta o cache do modelo para a cópia já baixada no node_modules
process.env['FIRECODE_MODEL_CACHE'] = resolve(__dirname, '../node_modules/@xenova/transformers/.cache');
process.env['LOG_LEVEL'] = 'warn';

import { indexProject } from '../src/indexing/Indexer.js';
import { DatabaseManager } from '../src/db/DatabaseManager.js';
import { getDefaults } from '../src/config/defaults.js';
import { getFireCodeDir } from '../src/utils/paths.js';
import { smartSearchTool } from '../src/mcp/tools/smart_search.js';
import { getContextTool } from '../src/mcp/tools/get_context.js';
import { searchCodeTool } from '../src/mcp/tools/search_code.js';
import { findSimilarTool } from '../src/mcp/tools/find_similar.js';

// ─── config ──────────────────────────────────────────────────────────────────

const FIXTURE = resolve(__dirname, '../__tests__/fixtures/complex-project');
const FIRE_DIR = getFireCodeDir(FIXTURE);
const tokens = (text: string): number => Math.ceil(text.length / 4);

// ─── tasks ───────────────────────────────────────────────────────────────────

interface Task {
  id: string;
  query: string;
  expectedFiles: string[];
  confusingFiles?: string[];
  category: 'implementation' | 'disambiguation' | 'dependency' | 'config';
}

const TASKS: Task[] = [
  { id: 'T01', category: 'implementation',  query: 'hash password securely with salt',              expectedFiles: ['utils/crypto'],               confusingFiles: ['orderService', 'emailJob'] },
  { id: 'T02', category: 'implementation',  query: 'validate email address format',                  expectedFiles: ['utils/validators'],            confusingFiles: ['paymentProcessor', 'appConfig'] },
  { id: 'T03', category: 'implementation',  query: 'cancel an order and check if cancellable',       expectedFiles: ['orders/orderService', 'models/Order'], confusingFiles: ['paymentService'] },
  { id: 'T04', category: 'implementation',  query: 'refund a completed payment partially or fully',  expectedFiles: ['payments/paymentService'],     confusingFiles: ['orderService'] },
  { id: 'T05', category: 'implementation',  query: 'rate limit HTTP requests per IP window',         expectedFiles: ['auth/authMiddleware'],          confusingFiles: ['authService', 'appConfig'] },
  { id: 'T06', category: 'implementation',  query: 'build database INSERT query with returning',     expectedFiles: ['core/database'],               confusingFiles: ['userRepository'] },
  { id: 'T07', category: 'implementation',  query: 'send email when order is confirmed',             expectedFiles: ['jobs/emailJob'],               confusingFiles: ['orderService', 'paymentService'] },
  { id: 'T08', category: 'implementation',  query: 'load app configuration from environment variables', expectedFiles: ['config/appConfig'],          confusingFiles: ['core/database'] },
  { id: 'T09', category: 'disambiguation',  query: 'structured JSON logger for services with trace and span', expectedFiles: ['core/logger'],         confusingFiles: ['utils/logger'] },
  { id: 'T10', category: 'disambiguation',  query: 'simple console logger for utilities',            expectedFiles: ['utils/logger'],               confusingFiles: ['core/logger'] },
  { id: 'T11', category: 'disambiguation',  query: 'session token expiry and validity check',        expectedFiles: ['models/Session'],             confusingFiles: ['auth/authService', 'auth/authMiddleware'] },
  { id: 'T12', category: 'disambiguation',  query: 'find user by email address in database',         expectedFiles: ['users/userRepository'],        confusingFiles: ['users/userService', 'auth/authService'] },
  { id: 'T13', category: 'dependency',      query: 'cache with TTL tags and in-memory storage',      expectedFiles: ['core/cache'],                 confusingFiles: ['config/appConfig'] },
  { id: 'T14', category: 'dependency',      query: 'user role permissions admin moderator',          expectedFiles: ['models/User', 'auth/authMiddleware'], confusingFiles: ['users/userRepository'] },
  { id: 'T15', category: 'config',          query: 'stripe paypal mercadopago payment provider keys', expectedFiles: ['config/appConfig', 'payments/paymentProcessor'], confusingFiles: ['payments/paymentService'] },
];

const SMART_TASKS: Task[] = [
  { id: 'S01', category: 'implementation',  query: 'hashPassword',                    expectedFiles: ['utils/crypto'],           confusingFiles: ['authService'] },
  { id: 'S02', category: 'implementation',  query: 'validateEmail',                   expectedFiles: ['utils/validators'],       confusingFiles: ['paymentProcessor'] },
  { id: 'S03', category: 'implementation',  query: 'cancelOrder isCancellable',        expectedFiles: ['orders/orderService'],    confusingFiles: ['paymentService'] },
  { id: 'S04', category: 'implementation',  query: 'refundPayment isRefundable',       expectedFiles: ['payments/paymentService'], confusingFiles: ['orderService'] },
  { id: 'S05', category: 'implementation',  query: 'rateLimitMiddleware',              expectedFiles: ['auth/authMiddleware'],    confusingFiles: ['authService'] },
  { id: 'S06', category: 'implementation',  query: 'buildInsert QueryBuilder',         expectedFiles: ['core/database'],          confusingFiles: ['userRepository'] },
  { id: 'S07', category: 'implementation',  query: 'buildWelcomeEmail emailJob',       expectedFiles: ['jobs/emailJob'],          confusingFiles: ['orderService'] },
  { id: 'S08', category: 'implementation',  query: 'loadAppConfig validateConfig',     expectedFiles: ['config/appConfig'],       confusingFiles: ['core/database'] },
  { id: 'S09', category: 'disambiguation',  query: 'StructuredLogger createAppLogger', expectedFiles: ['core/logger'],            confusingFiles: ['utils/logger'] },
  { id: 'S10', category: 'disambiguation',  query: 'ConsoleLogger createLogger',       expectedFiles: ['utils/logger'],           confusingFiles: ['core/logger'] },
  { id: 'S11', category: 'disambiguation',  query: 'isExpired isValid Session',        expectedFiles: ['models/Session'],         confusingFiles: ['authMiddleware'] },
  { id: 'S12', category: 'disambiguation',  query: 'findByEmail userRepository',       expectedFiles: ['users/userRepository'],   confusingFiles: ['userService'] },
  { id: 'S13', category: 'dependency',      query: 'buildCacheKey MemoryCache',        expectedFiles: ['core/cache'],             confusingFiles: ['appConfig'] },
  { id: 'S14', category: 'dependency',      query: 'isAdmin isModerator UserRole',     expectedFiles: ['models/User'],            confusingFiles: ['userRepository'] },
  { id: 'S15', category: 'config',          query: 'PaymentsConfig stripe mercadopago', expectedFiles: ['config/appConfig'],      confusingFiles: ['paymentService'] },
];

const FIND_TASKS = [
  { id: 'F01', description: 'hash password with salt',           expectedSymbol: 'hashPassword' },
  { id: 'F02', description: 'validate email address',            expectedSymbol: 'validateEmail' },
  { id: 'F03', description: 'cancel order cancellable',          expectedSymbol: 'cancelOrder' },
  { id: 'F04', description: 'refund payment processor',          expectedSymbol: 'refundPayment' },
  { id: 'F05', description: 'rate limit middleware request',     expectedSymbol: 'rateLimitMiddleware' },
  { id: 'F06', description: 'send welcome email',                expectedSymbol: 'buildWelcomeEmail' },
  { id: 'F07', description: 'find user by email database',       expectedSymbol: 'findByEmail' },
  { id: 'F08', description: 'cache with TTL expiry',             expectedSymbol: 'buildCacheKey' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function walkFiles(dir: string, ext = '.ts'): string[] {
  const results: string[] = [];
  const skip = new Set(['node_modules', '.git', 'dist', '.firecode', '__tests__']);
  function rec(d: string) {
    for (const e of readdirSync(d)) {
      if (skip.has(e)) continue;
      const full = join(d, e);
      if (statSync(full).isDirectory()) { rec(full); continue; }
      if (full.endsWith(ext)) results.push(full);
    }
  }
  rec(dir);
  return results;
}

function hasFile(response: string, files: string[]): boolean {
  const norm = response.replace(/\\/g, '/');
  return files.some(f => norm.includes(f));
}

interface TR { taskId: string; tokens: number; latencyMs: number; recall: boolean; confused: boolean; }

function row(name: string, results: TR[], baseline: number) {
  const avgTk = Math.round(results.reduce((s, r) => s + r.tokens, 0) / results.length);
  const recall = Math.round(results.filter(r => r.recall).length / results.length * 100);
  const confused = Math.round(results.filter(r => r.confused).length / results.length * 100);
  const lat = (results.reduce((s, r) => s + r.latencyMs, 0) / results.length).toFixed(1);
  const saving = baseline > 0 ? `${Math.round((1 - avgTk / baseline) * 100)}%` : '  —  ';
  const tk = avgTk.toLocaleString().padStart(7);
  console.log(`  ║  ${name} │ ${tk}  │ ${saving.padStart(5)}  │ ${(recall + '%').padStart(5)}  │ ${(confused + '%').padStart(5)}  │ ${lat.padStart(6)} ms  ║`);
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  🔥 Fire Code — Benchmark com Embeddings Reais\n');

  // 1. Setup
  DatabaseManager.reset();
  if (existsSync(FIRE_DIR)) rmSync(FIRE_DIR, { recursive: true, force: true });

  const config = getDefaults();
  config.indexing.mode = 'full';
  config.indexing.include = ['**/*.ts'];
  config.indexing.exclude = [];

  const db = DatabaseManager.getInstance(FIRE_DIR);
  const graphStore = db.getGraphStore('complex-project');
  const vectorStore = db.getVectorStore('complex-project');

  // 2. Index com embeddings reais
  console.log('  Indexando projeto com embeddings reais...');
  const t0 = performance.now();
  const result = await indexProject(FIXTURE, config, graphStore, vectorStore);
  const indexMs = (performance.now() - t0).toFixed(0);
  console.log(`  ✓ ${result.filesIndexed} arquivos, ${result.functionsFound} funções, ${result.embeddingsGenerated} embeddings em ${indexMs}ms\n`);

  // 3. Baseline: sem fire-code
  const files = walkFiles(FIXTURE);
  let allContent = '';
  for (const f of files) allContent += readFileSync(f, 'utf8');
  const baselineTokens = tokens(allContent);
  const baseline: TR[] = TASKS.map(t => ({ taskId: t.id, tokens: baselineTokens, latencyMs: 0, recall: true, confused: true }));

  // 4. smart_search NL
  console.log('  Rodando smart_search (NL)...');
  const smartNL: TR[] = [];
  for (const task of TASKS) {
    const t0 = performance.now();
    const resp = await smartSearchTool({ query: task.query, max_results: 10 }, FIXTURE);
    smartNL.push({ taskId: task.id, tokens: tokens(resp), latencyMs: performance.now() - t0, recall: hasFile(resp, task.expectedFiles), confused: hasFile(resp, task.confusingFiles ?? []) });
  }

  // 5. smart_search Symbol
  console.log('  Rodando smart_search (símbolos)...');
  const smartSym: TR[] = [];
  for (const task of SMART_TASKS) {
    const t0 = performance.now();
    const resp = await smartSearchTool({ query: task.query, max_results: 10 }, FIXTURE);
    smartSym.push({ taskId: task.id, tokens: tokens(resp), latencyMs: performance.now() - t0, recall: hasFile(resp, task.expectedFiles), confused: hasFile(resp, task.confusingFiles ?? []) });
  }

  // 6. get_context (hybrid)
  console.log('  Rodando get_context (híbrido)...');
  const ctxResults: TR[] = [];
  for (const task of TASKS) {
    const t0 = performance.now();
    const resp = await getContextTool({ query: task.query, k: 5, includeGraph: true }, FIXTURE);
    ctxResults.push({ taskId: task.id, tokens: tokens(resp), latencyMs: performance.now() - t0, recall: hasFile(resp, task.expectedFiles), confused: hasFile(resp, task.confusingFiles ?? []) });
  }

  // 7. search_code (vetor semântico)
  console.log('  Rodando search_code (embeddings reais)...');
  const vecResults: TR[] = [];
  for (const task of TASKS) {
    const t0 = performance.now();
    const resp = await searchCodeTool({ query: task.query, k: 5 }, FIXTURE);
    vecResults.push({ taskId: task.id, tokens: tokens(resp), latencyMs: performance.now() - t0, recall: hasFile(resp, task.expectedFiles), confused: hasFile(resp, task.confusingFiles ?? []) });
  }

  // 8. find_similar
  console.log('  Rodando find_similar (anti-duplicação)...');
  const findResults: { taskId: string; found: boolean; tokens: number; latencyMs: number }[] = [];
  for (const task of FIND_TASKS) {
    const t0 = performance.now();
    const resp = await findSimilarTool({ description: task.description, type: 'any', k: 5 }, FIXTURE);
    findResults.push({
      taskId: task.id,
      found: resp.toLowerCase().replace(/\\/g, '/').includes(task.expectedSymbol.toLowerCase()),
      tokens: tokens(resp),
      latencyMs: performance.now() - t0,
    });
  }

  // ─── Print table ──────────────────────────────────────────────────────────

  console.log('\n');
  console.log('  ╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('  ║  BENCHMARK  —  Claude WITHOUT vs WITH @phmotad/fire-code                     ║');
  console.log(`  ║  Fixture    : complex-project — ${result.filesIndexed} files, ~1 200 LOC, ~${(baselineTokens / 1000).toFixed(0)} k tokens total     ║`);
  console.log('  ║  Tasks      : 15 NL + 15 símbolos + 8 find_similar                          ║');
  console.log('  ║  Embeddings : REAIS (Xenova/all-MiniLM-L6-v2, 384 dims)                     ║');
  console.log('  ╠══════════════════════════════════════════════════════════════════════════════╣');
  console.log('  ║  Cenário                            │ Tk/qry  │ Econ.  │ Recall │ Confsd │     Lat ║');
  console.log('  ╠══════════════════════════════════════════════════════════════════════════════╣');
  row('WITHOUT fire-code (todos os arqs)  ', baseline, 0);
  console.log('  ╠══════════════════════════════════════════════════════════════════════════════╣');
  row('smart_search  (linguagem natural ✗)', smartNL, baselineTokens);
  row('smart_search  (consulta símbolo  ✓)', smartSym, baselineTokens);
  row('get_context   (híbrido + grafo)    ', ctxResults, baselineTokens);
  row('search_code   (vetor semântico  ✓)', vecResults, baselineTokens);
  console.log('  ╚══════════════════════════════════════════════════════════════════════════════╝\n');

  // ── Matriz por tarefa ──
  console.log('  Consultas NL — matriz de recall (✓ hit  ✗ miss  ⚠ confuso):');
  console.log(`  ${'ID'.padEnd(4)} ${'Categoria'.padEnd(15)} ${'Consulta'.padEnd(42)} NoFC  SmNL  Ctx   Vec`);
  console.log('  ' + '─'.repeat(88));
  for (const task of TASKS) {
    const b = baseline.find(r => r.taskId === task.id)!;
    const s = smartNL.find(r => r.taskId === task.id)!;
    const c = ctxResults.find(r => r.taskId === task.id)!;
    const v = vecResults.find(r => r.taskId === task.id)!;
    const fmt = (r: TR) => r.confused ? ' ⚠  ' : r.recall ? ' ✓  ' : ' ✗  ';
    console.log(`  ${task.id.padEnd(4)} ${task.category.padEnd(15)} ${task.query.slice(0, 42).padEnd(42)} ${fmt(b)} ${fmt(s)} ${fmt(c)} ${fmt(v)}`);
  }

  // ── find_similar ──
  const findFound = findResults.filter(r => r.found).length;
  const findRecall = Math.round(findFound / findResults.length * 100);
  const findAvgTk = Math.round(findResults.reduce((s, r) => s + r.tokens, 0) / findResults.length);
  const findAvgLat = (findResults.reduce((s, r) => s + r.latencyMs, 0) / findResults.length).toFixed(1);
  console.log(`\n  find_similar — Anti-duplicação (${findResults.length} tarefas):`);
  console.log(`  ${'ID'.padEnd(4)} ${'Descrição'.padEnd(35)} ${'Símbolo esperado'.padEnd(25)} Achou  Tk    Lat`);
  console.log('  ' + '─'.repeat(82));
  for (const r of findResults) {
    const task = FIND_TASKS.find(t => t.id === r.taskId)!;
    console.log(`  ${r.taskId.padEnd(4)} ${task.description.slice(0, 35).padEnd(35)} ${task.expectedSymbol.padEnd(25)} ${r.found ? ' ✓' : ' ✗'}    ${r.tokens.toString().padStart(4)}  ${r.latencyMs.toFixed(1)}ms`);
  }
  console.log(`\n  find_similar: recall ${findRecall}% | média ${findAvgTk} tokens | ${findAvgLat}ms | economia ${Math.round((1 - findAvgTk / baselineTokens) * 100)}%`);

  // ── Breakdown por categoria ──
  const categories = ['implementation', 'disambiguation', 'dependency', 'config'] as const;
  console.log(`\n  Recall por categoria — NL (SmNL / Ctx / Vec) | Símbolo (SmSym):`);
  for (const cat of categories) {
    const nlT = TASKS.filter(t => t.category === cat);
    const symT = SMART_TASKS.filter(t => t.category === cat);
    const pctNL = (arr: TR[]) => !nlT.length ? 0 : Math.round(arr.filter(r => nlT.some(t => t.id === r.taskId) && r.recall).length / nlT.length * 100);
    const pctSym = (arr: TR[]) => !symT.length ? 0 : Math.round(arr.filter(r => symT.some(t => t.id === r.taskId) && r.recall).length / symT.length * 100);
    console.log(`    ${cat.padEnd(18)}: NL → ${pctNL(smartNL)}% / ${pctNL(ctxResults)}% / ${pctNL(vecResults)}%   |   Sym → ${pctSym(smartSym)}%`);
  }

  console.log('\n  Conclusões principais:');
  const smartSymRecall = Math.round(smartSym.filter(r => r.recall).length / smartSym.length * 100);
  const ctxRecall = Math.round(ctxResults.filter(r => r.recall).length / ctxResults.length * 100);
  const vecRecall = Math.round(vecResults.filter(r => r.recall).length / vecResults.length * 100);
  const ctxAvgTk = Math.round(ctxResults.reduce((s, r) => s + r.tokens, 0) / ctxResults.length);
  console.log(`    1. Economia de tokens : ${Math.round((1 - ctxAvgTk / baselineTokens) * 100)}% (get_context) a ${Math.round((1 - Math.round(smartSym.reduce((s,r)=>s+r.tokens,0)/smartSym.length) / baselineTokens) * 100)}% (smart_search simbólico)`);
  console.log(`    2. smart_search símb  : ${smartSymRecall}% recall — busca exata no grafo`);
  console.log(`    3. get_context híbrido: ${ctxRecall}% recall — com embeddings reais`);
  console.log(`    4. search_code vetorial: ${vecRecall}% recall — cosine similarity real`);
  console.log(`    5. find_similar       : ${findRecall}% recall — anti-duplicação`);
  console.log();

  // 9. Cleanup
  DatabaseManager.reset();
  if (existsSync(FIRE_DIR)) rmSync(FIRE_DIR, { recursive: true, force: true });
}

main().catch(err => { console.error('\n  Erro:', String(err)); process.exit(1); });
