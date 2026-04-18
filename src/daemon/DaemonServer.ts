import express from 'express';
import { createServer, Server as HttpServer } from 'http';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import { DatabaseManager } from '../db/DatabaseManager.js';
import { getFireCodeDir } from '../utils/paths.js';
import { getContextTool } from '../mcp/tools/get_context.js';

export const DAEMON_PORT = 37778;
export const DAEMON_HOST = '127.0.0.1';

// ── Web Dashboard HTML ─────────────────────────────────────────────────────

function buildDashboardHtml(db: DatabaseManager, project: string, cwd: string): string {
  const sessions = db.getSessions(project, 10);
  const observations = db.getObservations({ project, limit: 20 });
  const corpusItems = db.getCorpus({ project, limit: 10 });

  const obsHtml = observations.map(o => {
    const icons: Record<string, string> = { change: '✏️', bugfix: '🐛', feature: '✨', refactor: '♻️', decision: '🧭', discovery: '🔍' };
    const icon = icons[o.type] ?? '•';
    const file = o.file_path ? `<small class="file">${o.file_path}</small>` : '';
    const date = new Date(o.created_at).toLocaleString();
    return `<li class="obs obs-${o.type}">
      <span class="icon">${icon}</span>
      <div class="obs-body">
        <strong>${o.summary}</strong>${file}
        <small class="date">${date}</small>
      </div>
    </li>`;
  }).join('');

  const sessionHtml = sessions.map(s => {
    const start = new Date(s.started_at).toLocaleString();
    const badge = s.status === 'active' ? '<span class="badge active">active</span>' : '<span class="badge">done</span>';
    return `<li class="session">${badge} <strong>${s.id.slice(0, 8)}</strong> <small>${start}</small></li>`;
  }).join('');

  const corpusHtml = corpusItems.map(c => `<li class="corpus-item">
    <strong>${c.title}</strong>
    <small class="file">${c.source ?? ''}</small>
    <p>${c.content.slice(0, 120)}…</p>
  </li>`).join('') || '<li>No corpus items yet. Run <code>fire-code corpus build</code></li>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🔥 Fire Code — ${project}</title>
<style>
  :root { --bg:#0d1117; --surface:#161b22; --border:#30363d; --text:#c9d1d9; --accent:#ff6b35; --green:#3fb950; --blue:#58a6ff; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", monospace; background: var(--bg); color: var(--text); padding: 24px; }
  h1 { color: var(--accent); font-size: 1.4rem; margin-bottom: 4px; }
  .subtitle { color: #8b949e; font-size: .85rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media(max-width:720px) { .grid { grid-template-columns: 1fr; } }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; }
  .card h2 { font-size: .9rem; text-transform: uppercase; letter-spacing: .05em; color: #8b949e; margin-bottom: 12px; }
  ul { list-style: none; }
  .obs { display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border); }
  .obs:last-child { border-bottom: none; }
  .icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 2px; }
  .obs-body { display: flex; flex-direction: column; gap: 2px; }
  .obs-body strong { font-size: .88rem; }
  .file, .date { font-size: .75rem; color: #8b949e; }
  .session { padding: 6px 0; border-bottom: 1px solid var(--border); font-size: .85rem; display: flex; gap: 8px; align-items: center; }
  .session:last-child { border-bottom: none; }
  .badge { background: var(--border); padding: 1px 6px; border-radius: 12px; font-size: .7rem; }
  .badge.active { background: #1a4731; color: var(--green); }
  .corpus-item { padding: 8px 0; border-bottom: 1px solid var(--border); }
  .corpus-item:last-child { border-bottom: none; }
  .corpus-item strong { font-size: .88rem; }
  .corpus-item p { font-size: .8rem; color: #8b949e; margin-top: 4px; }
  code { background: var(--border); padding: 1px 5px; border-radius: 4px; font-size: .8rem; }
  .status-bar { display: flex; gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: .82rem; }
  .status-item strong { color: var(--accent); }
  .full-width { grid-column: 1 / -1; }
</style>
</head>
<body>
<h1>🔥 Fire Code</h1>
<p class="subtitle">Project: <strong>${project}</strong> &nbsp;·&nbsp; ${cwd}</p>

<div class="status-bar">
  <div class="status-item">Observations: <strong>${observations.length}</strong></div>
  <div class="status-item">Sessions: <strong>${sessions.length}</strong></div>
  <div class="status-item">Corpus: <strong>${corpusItems.length}</strong> items</div>
  <div class="status-item">Daemon: <strong style="color:var(--green)">running</strong></div>
</div>

<div class="grid">
  <div class="card">
    <h2>Recent Observations</h2>
    <ul>${obsHtml || '<li style="color:#8b949e;padding:8px 0">No observations yet</li>'}</ul>
  </div>
  <div class="card">
    <h2>Sessions</h2>
    <ul>${sessionHtml || '<li style="color:#8b949e;padding:8px 0">No sessions yet</li>'}</ul>
  </div>
  <div class="card full-width">
    <h2>Knowledge Corpus</h2>
    <ul>${corpusHtml}</ul>
  </div>
</div>

<script>
  setTimeout(() => location.reload(), 30000);
</script>
</body>
</html>`;
}

// ── Server ─────────────────────────────────────────────────────────────────

export class DaemonServer {
  private app = express();
  private server: HttpServer | null = null;
  private startTime = Date.now();

  constructor(private cwd: string) {
    this.app.use(express.json({ limit: '10mb' }));
    this.setupRoutes();
  }

  private setupRoutes(): void {
    const app = this.app;

    app.get('/health', (_req, res) => {
      res.json({ ok: true, uptime: Date.now() - this.startTime, pid: process.pid });
    });

    app.get('/', (req, res) => {
      const cwd = (req.query.cwd as string) ?? this.cwd;
      const firedotDir = getFireCodeDir(cwd);
      if (!existsSync(firedotDir)) {
        return res.send('<h1>No Fire Code index found. Run <code>fire-code index</code></h1>');
      }
      const project = (req.query.project as string) ?? require('path').basename(cwd);
      const db = DatabaseManager.getInstance(firedotDir);
      res.send(buildDashboardHtml(db, project, cwd));
    });

    app.post('/index', async (req, res) => {
      const { cwd = this.cwd, mode = 'lazy' } = req.body as { cwd?: string; mode?: 'full' | 'lazy' };
      try {
        const { execSync } = await import('child_process');
        execSync(`npx fire-code index --mode=${mode} --cwd "${cwd}"`, { timeout: 60_000 });
        res.json({ ok: true, cwd });
      } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
      }
    });

    app.post('/context', async (req, res) => {
      const { query, cwd = this.cwd, k = 5 } = req.body as { query: string; cwd?: string; k?: number };
      try {
        const context = await getContextTool({ query, k, includeGraph: true }, cwd);
        res.json({ ok: true, context });
      } catch (err) {
        res.status(500).json({ ok: false, error: String(err) });
      }
    });

    app.get('/observations', (req, res) => {
      const cwd = (req.query.cwd as string) ?? this.cwd;
      const firedotDir = getFireCodeDir(cwd);
      if (!existsSync(firedotDir)) return res.json({ ok: true, results: [] });
      const db = DatabaseManager.getInstance(firedotDir);
      const results = db.getObservations({
        query: req.query.q as string | undefined,
        limit: Number(req.query.limit ?? 20),
      });
      res.json({ ok: true, results });
    });

    app.get('/corpus', (req, res) => {
      const cwd = (req.query.cwd as string) ?? this.cwd;
      const firedotDir = getFireCodeDir(cwd);
      if (!existsSync(firedotDir)) return res.json({ ok: true, results: [] });
      const db = DatabaseManager.getInstance(firedotDir);
      const results = db.getCorpus({
        query: req.query.q as string | undefined,
        limit: Number(req.query.limit ?? 10),
      });
      res.json({ ok: true, results });
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.app);
      this.server.listen(DAEMON_PORT, DAEMON_HOST, () => {
        logger.info({ port: DAEMON_PORT }, 'Fire Code daemon started');
        resolve();
      });
      this.server.on('error', reject);
    });
  }

  stop(): void {
    this.server?.close();
    logger.info('Fire Code daemon stopped');
  }
}

// ── PID helpers ────────────────────────────────────────────────────────────

export function getDaemonPidFile(cwd: string): string {
  const dir = getFireCodeDir(cwd);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, 'daemon.pid');
}

export function writeDaemonPid(cwd: string, pid: number): void {
  writeFileSync(getDaemonPidFile(cwd), String(pid), 'utf8');
}

export function readDaemonPid(cwd: string): number | null {
  const pidFile = getDaemonPidFile(cwd);
  if (!existsSync(pidFile)) return null;
  const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
  return isNaN(pid) ? null : pid;
}

export function isDaemonRunning(cwd: string): boolean {
  const pid = readDaemonPid(cwd);
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
