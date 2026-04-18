#!/usr/bin/env tsx
/**
 * 🔥 Fire Code — Claude Code Benchmark v2
 *
 * Roda o mesmo prompt no `claude -p` DUAS vezes:
 *   ① WITHOUT FireCode — Claude sem contexto (padrão)
 *   ② WITH  FireCode  — Claude + MCP fire-code
 *
 * Não precisa de API key — usa a sessão já logada no terminal.
 */

import { spawn, execSync } from 'child_process';
import {
  mkdtempSync, cpSync, writeFileSync, readFileSync,
  existsSync, rmSync, mkdirSync,
} from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import chalk from 'chalk';

process.env['LOG_LEVEL'] = 'silent';

import { indexProject } from '../src/indexing/Indexer';
import { DatabaseManager } from '../src/db/DatabaseManager';
import { MemoryVectorStore } from '../src/vector/MemoryVectorStore';
import { getDefaults } from '../src/config/defaults';
import { getFireCodeDir } from '../src/utils/paths';
import { CorpusService } from '../src/services/CorpusService';

// ─── Paths ────────────────────────────────────────────────────────────────────

const FIRECODE_ROOT  = resolve(__dirname, '..');
const TEST_SRC       = join(__dirname, 'test-project');
const CLI_ENTRY      = join(FIRECODE_ROOT, 'src', 'cli', 'index.ts');

// ─── Scenarios ────────────────────────────────────────────────────────────────

interface Scenario {
  id:           string;
  hypothesis:   string;
  description:  string;
  outputFile:   string;
  promptBase:   string;
  mcpHint:      string;   // extra context hint for WITH run
  checkDup:     string[];
  checkReuse:   string[];
}

const SCENARIOS: Scenario[] = [
  {
    id:          'H2',
    hypothesis:  'Code Duplication',
    description: 'Forgot Password feature',
    outputFile:  'src/forgot-password.ts',
    promptBase:  `Create the file \`src/forgot-password.ts\` with a \`forgotPassword(email: string)\` function.

It must:
1. Validate email format
2. Check if the user exists in the database
3. Generate a secure random reset token
4. Save the token to the database with 1-hour expiry
5. Send a password reset email with a link

Constraints:
- Do NOT re-implement functions that already exist in the codebase
- Import and reuse existing helpers wherever possible
- The file must compile as valid TypeScript`,
    mcpHint: 'forgotPassword email reset token flow',
    checkDup:   ['validateEmail', 'generateToken', 'hashPassword'],
    checkReuse: ['validateEmail', 'generateToken', 'sendEmail', 'buildPasswordResetEmail', 'db.'],
  },
  {
    id:          'H1',
    hypothesis:  'Context Awareness',
    description: 'Change Email (similar to changePassword)',
    outputFile:  'src/change-email.ts',
    promptBase:  `Create the file \`src/change-email.ts\` with a \`changeEmail(userId, newEmail, currentPassword)\` function.

It must:
1. Validate the new email format
2. Verify the current password is correct (for security)
3. Check the new email is not already taken
4. Update the user record in the database

Constraints:
- Do NOT re-implement functions that already exist in the codebase
- Import and reuse existing helpers wherever possible
- The file must compile as valid TypeScript`,
    mcpHint: 'change email validation password verification',
    checkDup:   ['validateEmail', 'comparePassword'],
    checkReuse: ['validateEmail', 'comparePassword', 'db.'],
  },
  {
    id:          'H4',
    hypothesis:  'Feature Awareness',
    description: 'Registration Handler (auth patterns exist)',
    outputFile:  'src/register-handler.ts',
    promptBase:  `Create the file \`src/register-handler.ts\` with a \`handleRegister(email, password)\` function.

It must:
1. Validate the email format
2. Validate password strength (min 8 chars, uppercase, number)
3. Check the email is not already registered
4. Hash the password securely
5. Create and return the new user

Constraints:
- Do NOT re-implement functions that already exist in the codebase
- Import and reuse existing helpers wherever possible
- The file must compile as valid TypeScript`,
    mcpHint: 'registration email password hash create user',
    checkDup:   ['validateEmail', 'validatePassword', 'hashPassword'],
    checkReuse: ['validateEmail', 'validatePassword', 'hashPassword', 'registerUser', 'db.'],
  },
  {
    id:          'H5',
    hypothesis:  'Graph Traversal',
    description: 'Dependency-aware refactor using graph neighbors',
    outputFile:  'src/session-handler.ts',
    promptBase:  `Create the file \`src/session-handler.ts\` with a \`createSession(userId, email)\` function.

It must:
1. Verify the user exists by ID
2. Generate a session token
3. Save the session token in the database
4. Return the token and expiry time

Constraints:
- Do NOT re-implement functions that already exist in the codebase
- Import and reuse existing helpers wherever possible
- The file must compile as valid TypeScript`,
    mcpHint: 'session token user database',
    checkDup:   ['generateToken'],
    checkReuse: ['generateToken', 'db.'],
  },
  {
    id:          'H6',
    hypothesis:  'Corpus Knowledge',
    description: 'Architecture-aware implementation using corpus docs',
    outputFile:  'src/password-reset.ts',
    promptBase:  `Create the file \`src/password-reset.ts\` with a \`resetPassword(token, newPassword)\` function.

It must:
1. Find the reset token in the database
2. Check it hasn't expired
3. Validate new password strength
4. Hash the new password
5. Update the user password in the database
6. Delete the used token

Constraints:
- Do NOT re-implement functions that already exist in the codebase
- Import and reuse existing helpers wherever possible
- The file must compile as valid TypeScript`,
    mcpHint: 'password reset token expiry validation hash',
    checkDup:   ['validatePassword', 'hashPassword'],
    checkReuse: ['validatePassword', 'hashPassword', 'db.'],
  },
];

// ─── UI helpers ───────────────────────────────────────────────────────────────

function clr() { process.stdout.write('\x1Bc'); }

function stripAnsi(s: string) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

function box(title: string, width = 64) {
  const top    = chalk.red('╔' + '═'.repeat(width) + '╗');
  const bottom = chalk.red('╚' + '═'.repeat(width) + '╝');
  const pad    = Math.max(0, Math.floor((width - stripAnsi(title).length) / 2));
  const mid    = chalk.red('║') + ' '.repeat(pad) + title + ' '.repeat(width - pad - stripAnsi(title).length) + chalk.red('║');
  return `${top}\n${mid}\n${bottom}`;
}

function rule(ch = '─', width = 66) { return chalk.gray(ch.repeat(width)); }

function tag(text: string, color: 'red' | 'green' | 'yellow' | 'gray' | 'blue') {
  const fg = { red: chalk.bgRed.white, green: chalk.bgGreen.black, yellow: chalk.bgYellow.black, gray: chalk.bgGray.white, blue: chalk.bgBlue.white };
  return fg[color](` ${text} `);
}

function padR(s: string, len: number) {
  const clean = stripAnsi(s);
  return s + ' '.repeat(Math.max(0, len - clean.length));
}

function wait(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ─── Run claude subprocess ────────────────────────────────────────────────────

interface RunOpts {
  cwd:        string;
  prompt:     string;
  mcpConfig?: string;
}

function runClaude(opts: RunOpts): Promise<{ exitCode: number }> {
  const args: string[] = [
    '--print',
    '--dangerously-skip-permissions',
    '--tools', 'default',
    '--permission-mode', 'bypassPermissions',
  ];
  if (opts.mcpConfig) args.push('--mcp-config', opts.mcpConfig);

  return new Promise((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd:   opts.cwd,
      stdio: ['pipe', 'inherit', 'inherit'],
      shell: true,
    });
    proc.stdin!.write(opts.prompt, 'utf8');
    proc.stdin!.end();
    proc.on('close', code => resolve({ exitCode: code ?? 0 }));
    proc.on('error', reject);
  });
}

// ─── Analyze generated file ───────────────────────────────────────────────────

interface Analysis {
  exists:       boolean;
  lines:        number;
  duplications: string[];
  reuses:       string[];
  preview:      string[];
}

function analyzeFile(filePath: string, scenario: Scenario): Analysis {
  if (!existsSync(filePath)) {
    return { exists: false, lines: 0, duplications: [], reuses: [], preview: [] };
  }
  const code  = readFileSync(filePath, 'utf8');
  const lines = code.split('\n');

  const duplications = scenario.checkDup.filter(name =>
    new RegExp(`\\bfunction\\s+${name}\\b`).test(code) ||
    new RegExp(`\\bconst\\s+${name}\\s*=`).test(code) ||
    new RegExp(`\\bexport\\s+function\\s+${name}\\b`).test(code) ||
    new RegExp(`\\basync\\s+function\\s+${name}\\b`).test(code)
  );

  const reuses = scenario.checkReuse.filter(sym => code.includes(sym));
  return { exists: true, lines: lines.length, duplications, reuses, preview: lines.slice(0, 25) };
}

// ─── Setup test projects ──────────────────────────────────────────────────────

interface Projects {
  withoutDir: string;
  withDir:    string;
  mcpConfig:  string;
  tempRoot:   string;
}

async function setupProjects(): Promise<Projects> {
  const tempRoot   = mkdtempSync(join(tmpdir(), 'firecode-bench-'));
  const withoutDir = join(tempRoot, 'without');
  const withDir    = join(tempRoot, 'with');

  cpSync(TEST_SRC, withoutDir, { recursive: true });
  cpSync(TEST_SRC, withDir,    { recursive: true });

  // Index the "with" project using new SQLite-backed graph
  const config = getDefaults();
  config.indexing.mode    = 'full';
  config.indexing.include = ['**/*.ts', '**/*.md'];
  config.indexing.exclude = [];

  const firedotDir = getFireCodeDir(withDir);
  mkdirSync(firedotDir, { recursive: true });

  const db         = DatabaseManager.getInstance(firedotDir);
  const graphStore = db.getGraphStore('benchmark');
  const vectorStore = new MemoryVectorStore({ useEmbeddings: false });

  await indexProject(withDir, config, graphStore, vectorStore);

  // Build corpus from docs
  const corpus = new CorpusService(withDir);
  await corpus.build();

  DatabaseManager.reset();

  const mcpConfig = join(tempRoot, 'mcp.json');
  writeFileSync(mcpConfig, JSON.stringify({
    mcpServers: {
      'fire-code': {
        command: 'npx',
        args:    ['tsx', CLI_ENTRY, 'dev', '--cwd', withDir],
        env:     { LOG_LEVEL: 'error', NODE_ENV: 'production', PATH: process.env.PATH },
      },
    },
  }, null, 2));

  return { withoutDir, withDir, mcpConfig, tempRoot };
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildWithPrompt(scenario: Scenario): string {
  return (
    `Before writing any code, call these Fire Code MCP tools in order:\n` +
    `1. \`firecode.smart_search\` with query "${scenario.mcpHint}" — find relevant files and symbols\n` +
    `2. \`firecode.get_context\` with query "${scenario.description}" — get semantic context\n` +
    `3. \`firecode.corpus_search\` with query "${scenario.mcpHint}" — check architecture docs\n` +
    `4. \`firecode.get_graph\` to understand dependencies\n\n` +
    scenario.promptBase
  );
}

// ─── Print comparison ─────────────────────────────────────────────────────────

function printComparison(scenario: Scenario, without: Analysis, with_: Analysis) {
  clr();
  console.log(box(`  🔥 COMPARISON — [${scenario.id}] ${scenario.hypothesis}  `));
  console.log(chalk.gray(`     Task: ${scenario.description}\n`));

  const maxLines = Math.max(without.preview.length, with_.preview.length, 1);
  console.log(chalk.bold(padR('  WITHOUT FireCode', 40)) + chalk.bold('  WITH FireCode'));
  console.log(rule());

  for (let i = 0; i < Math.min(maxLines, 20); i++) {
    const l = without.preview[i] ?? '';
    const r = with_.preview[i] ?? '';
    const rColor = with_.reuses.some(sym => r.includes(sym)) ? chalk.green(r) : chalk.dim(r);
    console.log(chalk.dim(padR(l.slice(0, 38), 40)) + '  ' + rColor.slice(0, 60));
  }
  console.log(rule());
  console.log('\n' + chalk.bold('  Metrics:\n'));

  function row(label: string, bad: string | number, good: string | number, improved: boolean) {
    const badStr  = chalk.red(String(bad));
    const goodStr = improved ? chalk.green(String(good)) : chalk.yellow(String(good));
    console.log(`    ${chalk.gray(padR(label + ':', 24))} ${padR(badStr, 20)} → ${goodStr}`);
  }

  row('Duplications',    without.duplications.length, with_.duplications.length, with_.duplications.length < without.duplications.length);
  row('Existing reuses', without.reuses.length,       with_.reuses.length,       with_.reuses.length > without.reuses.length);
  row('Lines generated', without.lines,               with_.lines,               with_.lines <= without.lines);

  if (with_.reuses.length > 0) {
    console.log(`\n    ${tag('WITH', 'red')} Reused: ${with_.reuses.map(n => chalk.green(n)).join(', ')}`);
  }
  if (without.reuses.length > 0 && with_.reuses.length <= without.reuses.length) {
    console.log(`    ${tag('WITHOUT', 'gray')} Reused: ${without.reuses.map(n => chalk.yellow(n)).join(', ')}`);
  }

  const verdict = with_.duplications.length < without.duplications.length || with_.reuses.length > without.reuses.length;
  console.log('\n' + rule());
  console.log(verdict
    ? `\n    ${chalk.green('✓')} ${chalk.green.bold(`[${scenario.id}] CONFIRMADO`)}`
    : `\n    ${chalk.yellow('~')} ${chalk.yellow.bold(`[${scenario.id}] PARCIAL`)}`);
  console.log();
}

// ─── Final summary ────────────────────────────────────────────────────────────

interface ScenarioResult { scenario: Scenario; without: Analysis; with: Analysis; }

function printSummary(results: ScenarioResult[]) {
  clr();
  console.log(box('  🔥 FIRE CODE v2 — BENCHMARK FINAL RESULTS  '));
  console.log();

  const totalDupWithout    = results.reduce((a, r) => a + r.without.duplications.length, 0);
  const totalDupWith       = results.reduce((a, r) => a + r.with.duplications.length, 0);
  const totalReuseWithout  = results.reduce((a, r) => a + r.without.reuses.length, 0);
  const totalReuseWith     = results.reduce((a, r) => a + r.with.reuses.length, 0);
  const totalLinesWithout  = results.filter(r => r.without.exists).reduce((a, r) => a + r.without.lines, 0);
  const totalLinesWith     = results.filter(r => r.with.exists).reduce((a, r) => a + r.with.lines, 0);

  console.log(chalk.bold('  Resultados por hipótese:\n'));
  console.log(chalk.gray('  ' + padR('Hipótese', 32) + padR('Dup W/WF', 12) + padR('Reuso W/WF', 14) + padR('Linhas W/WF', 14) + 'Status'));
  console.log('  ' + rule('─', 78));

  for (const r of results) {
    const dupOk    = r.with.duplications.length < r.without.duplications.length;
    const reuseOk  = r.with.reuses.length > r.without.reuses.length;
    const linesOk  = r.with.lines < r.without.lines;
    const ok       = dupOk || reuseOk;
    const icon     = ok ? chalk.green('✓') : chalk.yellow('~');
    const status   = ok ? chalk.green('CONFIRMADO') : chalk.yellow('PARCIAL');
    const lineDiff = r.without.lines > 0 && r.with.lines > 0
      ? `${r.without.lines}→${r.with.lines}`
      : 'N/A';

    console.log(
      `  ${icon} ` +
      padR(`[${r.scenario.id}] ${r.scenario.hypothesis}`, 30) + '  ' +
      padR(`${r.without.duplications.length}→${r.with.duplications.length}`, 12) +
      padR(`${r.without.reuses.length}→${r.with.reuses.length}`, 14) +
      padR(lineDiff, 14) +
      status,
    );
  }

  console.log('  ' + rule('─', 78));

  const linesDelta = totalLinesWithout > 0 ? Math.round((1 - totalLinesWith / totalLinesWithout) * 100) : 0;
  const reuseDelta = totalReuseWithout > 0 ? Math.round(((totalReuseWith - totalReuseWithout) / totalReuseWithout) * 100) : 0;

  console.log(
    '  ' + chalk.bold(padR('TOTAL', 32)) +
    chalk.red(padR(`${totalDupWithout} dup`, 6)) + chalk.gray('→') + chalk.green(padR(`${totalDupWith} dup`, 8)) +
    chalk.red(padR(`${totalReuseWithout} reuso`, 8)) + chalk.gray('→') + chalk.green(padR(`${totalReuseWith} reuso`, 8)) +
    chalk.gray(`  ${linesDelta > 0 ? '-' + linesDelta + '%' : '+'  + Math.abs(linesDelta) + '%'} linhas`),
  );

  const confirmed = results.filter(r =>
    r.with.duplications.length < r.without.duplications.length ||
    r.with.reuses.length > r.without.reuses.length,
  ).length;

  console.log('\n  ' + rule('═', 78));

  if (confirmed === results.length) {
    console.log(`\n  ${chalk.green.bold('🔥 TODAS AS HIPÓTESES CONFIRMADAS')} (${confirmed}/${results.length})`);
  } else if (confirmed >= results.length * 0.6) {
    console.log(`\n  ${chalk.yellow.bold('⚡ MAIORIA CONFIRMADA')} (${confirmed}/${results.length})`);
  } else {
    console.log(`\n  ${chalk.red.bold('⚠ POUCOS CONFIRMADOS')} (${confirmed}/${results.length})`);
  }

  console.log(`\n  ${chalk.gray('Δ Reuso:')}  ${chalk.green(`+${reuseDelta}%`)} (${totalReuseWithout} → ${totalReuseWith} símbolos)`);
  console.log(`  ${chalk.gray('Δ Código:')} ${chalk.green(`-${linesDelta}%`)} linhas geradas`);
  console.log(`  ${chalk.gray('Δ Dup:')}    ${totalDupWith < totalDupWithout ? chalk.green('reduzida') : chalk.gray('igual')} (${totalDupWithout} → ${totalDupWith})`);

  console.log('\n  ' + chalk.gray('Ferramentas MCP usadas:'));
  console.log('  ' + chalk.gray('  firecode.smart_search   — busca estrutural rápida'));
  console.log('  ' + chalk.gray('  firecode.get_context    — contexto semântico + grafo'));
  console.log('  ' + chalk.gray('  firecode.corpus_search  — busca em documentação indexada'));
  console.log('  ' + chalk.gray('  firecode.get_graph      — relações de dependência (SQLite + graphology)'));
  console.log();

  // Write JSON results for report generation
  const resultsPath = join(__dirname, '..', 'benchmark-results.json');
  writeFileSync(resultsPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    version: '2.0',
    scenarios: results.map(r => ({
      id: r.scenario.id,
      hypothesis: r.scenario.hypothesis,
      without: { lines: r.without.lines, duplications: r.without.duplications.length, reuses: r.without.reuses.length, symbols: r.without.reuses },
      with:    { lines: r.with.lines,    duplications: r.with.duplications.length,    reuses: r.with.reuses.length,    symbols: r.with.reuses },
    })),
    totals: { dupWithout: totalDupWithout, dupWith: totalDupWith, reuseWithout: totalReuseWithout, reuseWith: totalReuseWith, linesWithout: totalLinesWithout, linesWith: totalLinesWith, linesDelta, reuseDelta, confirmed, total: results.length },
  }, null, 2));
  console.log(chalk.gray(`  Resultados salvos em: benchmark-results.json\n`));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  clr();
  console.log(box('  🔥  FIRE CODE v2 BENCHMARK  '));
  console.log(chalk.gray(`
  Compara Claude Code COM e SEM FireCode MCP (v2)
  Novas ferramentas: smart_search · corpus_search · get_graph (SQLite+graphology)

  Cenários: ${SCENARIOS.length} hipóteses
  MCP:      firecode.smart_search · get_context · corpus_search · get_graph
`));

  console.log(chalk.bold('  [1/2] Preparando projetos de teste...'));
  let projects: Projects;
  try {
    projects = await setupProjects();
    console.log(chalk.green(`        ✓ Projetos criados, indexados e corpus construído\n`));
    console.log(chalk.gray(`        without → ${projects.withoutDir}`));
    console.log(chalk.gray(`        with    → ${projects.withDir}\n`));
  } catch (err) {
    console.error(chalk.red('  Erro ao preparar projetos:'), String(err));
    process.exit(1);
  }

  console.log(chalk.bold('  [2/2] Iniciando testes...\n'));
  await wait(2000);

  const results: ScenarioResult[] = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const s = SCENARIOS[i];

    // WITHOUT run
    clr();
    console.log(box(`  TESTE ${i + 1}/${SCENARIOS.length} — [${s.id}] ${s.hypothesis}  `));
    console.log(chalk.gray(`  Task: ${s.description}\n`));
    console.log(rule());
    console.log('\n' + tag('① SEM FireCode', 'gray') + '\n');
    await runClaude({ cwd: projects.withoutDir, prompt: s.promptBase });
    const withoutAnalysis = analyzeFile(join(projects.withoutDir, s.outputFile), s);
    if (withoutAnalysis.exists) {
      console.log(chalk.gray(`\n  Gerado: ${s.outputFile} (${withoutAnalysis.lines} linhas)`));
      withoutAnalysis.duplications.forEach(n => console.log(`  ${chalk.red('✗')} Re-implementou ${chalk.yellow(n + '()')}`));
      if (withoutAnalysis.duplications.length === 0) console.log(`  ${chalk.green('✓')} Sem duplicações`);
    } else {
      console.log(chalk.yellow(`\n  ⚠ Arquivo não criado`));
    }
    await wait(1000);

    // WITH run
    clr();
    console.log(box(`  TESTE ${i + 1}/${SCENARIOS.length} — [${s.id}] ${s.hypothesis}  `));
    console.log(chalk.gray(`  Task: ${s.description}\n`));
    console.log(rule());
    console.log('\n' + tag('② COM FireCode', 'red') + chalk.gray(' (smart_search · get_context · corpus_search · get_graph)\n'));
    await runClaude({ cwd: projects.withDir, prompt: buildWithPrompt(s), mcpConfig: projects.mcpConfig });
    const withAnalysis = analyzeFile(join(projects.withDir, s.outputFile), s);
    if (withAnalysis.exists) {
      console.log(chalk.gray(`\n  Gerado: ${s.outputFile} (${withAnalysis.lines} linhas)`));
      withAnalysis.reuses.forEach(sym => console.log(`  ${chalk.green('✓')} Reutilizou ${chalk.green(sym)}`));
      if (withAnalysis.duplications.length === 0) console.log(`  ${chalk.green('✓')} Zero duplicações`);
    } else {
      console.log(chalk.yellow(`\n  ⚠ Arquivo não criado`));
    }
    await wait(1000);

    results.push({ scenario: s, without: withoutAnalysis, with: withAnalysis });
    printComparison(s, withoutAnalysis, withAnalysis);
    await wait(2000);
  }

  try { rmSync(projects.tempRoot, { recursive: true, force: true }); } catch { /* ignore */ }
  printSummary(results);
}

main().catch(err => {
  console.error(chalk.red('\n  Erro fatal:'), String(err));
  process.exit(1);
});
