#!/usr/bin/env node
/**
 * Fire Code — context-inject.js
 *
 * Hook runner invoked by Claude Code lifecycle events:
 *   session-start  → inject rich memory context (observations + summaries)
 *   session-init   → ensure session is registered in SQLite
 *   pre-read       → inject file-level observation history before Claude reads a file
 *   post-tool      → capture tool call as observation, re-index if Write/Edit
 *   stop           → trigger session summarization
 *   session-end    → mark session as completed
 *
 * Reads hook data from:
 *   CLAUDE_TOOL_NAME, CLAUDE_TOOL_INPUT_JSON, CLAUDE_TOOL_RESULT_JSON,
 *   CLAUDE_CWD, CLAUDE_SESSION_ID (when available)
 *
 * Always outputs { continue: true } — never blocks Claude.
 */
'use strict';

const { execFileSync, execSync } = require('child_process');
const { existsSync, readFileSync } = require('fs');
const path = require('path');

const event      = process.argv[2] || 'session-start';
const cwd        = process.env.CLAUDE_CWD || process.env.PWD || process.cwd();
const sessionId  = process.env.CLAUDE_SESSION_ID || `session-${Date.now()}`;
const toolName   = process.env.CLAUDE_TOOL_NAME || '';
const toolInput  = safeJson(process.env.CLAUDE_TOOL_INPUT_JSON);
const toolResult = safeJson(process.env.CLAUDE_TOOL_RESULT_JSON);

const firedotDir    = path.join(cwd, '.firecode');
const bootstrapLog  = path.join(firedotDir, 'bootstrap.log');
const dbPath        = path.join(firedotDir, 'firecode.db');

function safeJson(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function silentContinue(context) {
  const out = { continue: true, suppressOutput: true };
  if (context) out.context = context;
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
}

function readBootstrapLog() {
  try {
    if (!existsSync(bootstrapLog)) return null;
    return readFileSync(bootstrapLog, 'utf8').trim().split('\n').slice(-5).join('\n');
  } catch { return null; }
}

function getProjectName() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    return pkg.name || path.basename(cwd);
  } catch { return path.basename(cwd); }
}

const DAEMON_PORT = 37778;

function daemonFetch(path, body) {
  try {
    // Synchronous HTTP to daemon (Node.js doesn't have sync fetch, use execFileSync curl)
    const url = `http://127.0.0.1:${DAEMON_PORT}${path}`;
    if (body) {
      const result = execSync(
        `curl -s -X POST -H "Content-Type: application/json" -d ${JSON.stringify(JSON.stringify(body))} ${url}`,
        { timeout: 5_000, stdio: ['pipe', 'pipe', 'ignore'] }
      );
      return result ? JSON.parse(result.toString('utf8')) : null;
    }
    const result = execSync(`curl -s ${url}`, { timeout: 5_000, stdio: ['pipe', 'pipe', 'ignore'] });
    return result ? JSON.parse(result.toString('utf8')) : null;
  } catch { return null; }
}

function isDaemonAlive() {
  const resp = daemonFetch('/health');
  return resp && resp.ok === true;
}

function runFireCode(args, input) {
  try {
    const opts = { cwd, stdio: ['pipe', 'pipe', 'ignore'], timeout: 25_000, shell: true };
    const result = execSync(`npx fire-code ${args.join(' ')}`, opts);
    return result ? result.toString('utf8').trim() : '';
  } catch { return ''; }
}

function captureObservation() {
  if (!toolName) return;
  const writeTools = new Set(['Write', 'Edit', 'MultiEdit', 'Create']);

  const payload = JSON.stringify({
    event: 'observation',
    tool: toolName,
    input: toolInput,
    result: toolResult,
    sessionId,
    cwd,
    project: getProjectName(),
  });

  try {
    // Fire-and-forget: capture observation via fire-code internal API
    runFireCode(['observe', '--data', `'${payload.replace(/'/g, "'\\''")}'`]);
  } catch { /* never block */ }

  // Re-index changed files
  if (writeTools.has(toolName)) {
    try {
      execSync(`npx fire-code index --mode=lazy --cwd "${cwd}"`, {
        stdio: 'ignore', timeout: 25_000, shell: true,
      });
    } catch { /* never block */ }
  }
}

try {
  switch (event) {
    case 'session-start': {
      const project = getProjectName();
      const logLines = readBootstrapLog();
      const contextParts = [];

      if (logLines) {
        contextParts.push(`[Fire Code] Project index loaded for **${project}**:\n${logLines}`);
      }

      // Try daemon first (warm model, faster); fallback to CLI
      if (existsSync(dbPath)) {
        let memContext = '';
        if (isDaemonAlive()) {
          const resp = daemonFetch('/observations', null);
          if (resp && resp.results && resp.results.length > 0) {
            memContext = resp.results.slice(0, 8).map(o => `• [${o.type}] ${o.summary}`).join('\n');
          }
        }
        if (!memContext) memContext = runFireCode(['context', '--cwd', cwd, '--limit', '8']);
        if (memContext) contextParts.push(memContext);
      }

      if (contextParts.length > 0) {
        contextParts.push('\nUse `firecode.get_context`, `firecode.smart_search`, `firecode.corpus_search`, or `firecode.observations` to query project memory.');
        silentContinue(contextParts.join('\n\n'));
      } else {
        silentContinue();
      }
      break;
    }

    case 'session-init': {
      // Start daemon if not running (background, non-blocking)
      if (existsSync(dbPath) && !isDaemonAlive()) {
        try {
          execSync(`npx fire-code daemon start --cwd "${cwd}"`, {
            stdio: 'ignore', timeout: 10_000, shell: true,
          });
        } catch { /* best-effort */ }
      }
      // Ensure session is registered (idempotent)
      runFireCode(['session', 'start', '--cwd', cwd, '--id', sessionId]);
      silentContinue();
      break;
    }

    case 'pre-read': {
      // Inject file-level observation history before Claude reads a file
      const filePath = toolInput?.file_path || toolInput?.path;
      if (!filePath || !existsSync(dbPath)) { silentContinue(); break; }

      const fileContext = runFireCode(['context', '--file', filePath, '--cwd', cwd]);
      if (fileContext) {
        silentContinue(`[Fire Code] History for \`${path.basename(filePath)}\`:\n${fileContext}`);
      } else {
        silentContinue();
      }
      break;
    }

    case 'post-tool': {
      captureObservation();
      silentContinue();
      break;
    }

    case 'stop': {
      // Trigger summarization of the current session
      runFireCode(['session', 'summarize', '--cwd', cwd, '--id', sessionId]);
      silentContinue();
      break;
    }

    case 'session-end': {
      runFireCode(['session', 'end', '--cwd', cwd, '--id', sessionId]);
      silentContinue();
      break;
    }

    default:
      silentContinue();
  }
} catch {
  silentContinue();
}
