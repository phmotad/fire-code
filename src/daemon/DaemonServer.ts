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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildDashboardHtml(db: DatabaseManager, project: string, cwd: string): string {
  const sessions = db.getSessions(project, 50);
  const observations = db.getObservations({ project, limit: 100 });
  const corpusItems = db.getCorpus({ project, limit: 50 });

  const obsJson = JSON.stringify(observations.map(o => ({
    id: o.id, type: o.type, summary: esc(o.summary),
    file: o.file_path ? esc(o.file_path) : null,
    date: new Date(o.created_at).toLocaleString(),
  })));

  const sessJson = JSON.stringify(sessions.map(s => ({
    id: s.id.slice(0, 8), status: s.status,
    start: new Date(s.started_at).toLocaleString(),
  })));

  const corpJson = JSON.stringify(corpusItems.map(c => ({
    title: esc(c.title), source: c.source ? esc(c.source) : '',
    preview: esc(c.content.slice(0, 150)),
  })));

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🔥 Fire Code — ${esc(project)}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0d1117;--surface:#161b22;--surface2:#1c2128;--border:#30363d;
  --text:#c9d1d9;--muted:#8b949e;--accent:#ff6b35;--accent2:#e5531a;
  --green:#3fb950;--blue:#58a6ff;--yellow:#d29922;--purple:#bc8cff;--red:#f85149;
}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);height:100vh;display:flex;flex-direction:column;overflow:hidden}
/* Header */
.header{display:flex;align-items:center;gap:12px;padding:12px 20px;background:var(--surface);border-bottom:1px solid var(--border);flex-shrink:0}
.logo{font-size:1.25rem;font-weight:700;color:var(--accent);letter-spacing:-.02em}
.project-badge{background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:3px 10px;font-size:.78rem;color:var(--muted)}
.header-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.status-dot{width:7px;height:7px;border-radius:50%;background:var(--green);flex-shrink:0}
.status-label{font-size:.75rem;color:var(--muted)}
.btn{padding:5px 12px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:.78rem;cursor:pointer;transition:background .15s}
.btn:hover{background:var(--border)}
.btn.primary{background:var(--accent);border-color:var(--accent2);color:#fff}
.btn.primary:hover{background:var(--accent2)}
.btn.danger{border-color:#6e3737;color:var(--red)}
.btn.loading{opacity:.6;pointer-events:none}
/* Stats bar */
.stats-bar{display:flex;gap:0;border-bottom:1px solid var(--border);flex-shrink:0}
.stat{flex:1;padding:10px 16px;border-right:1px solid var(--border);font-size:.78rem;color:var(--muted)}
.stat:last-child{border-right:none}
.stat strong{display:block;font-size:1.1rem;color:var(--text);font-weight:600}
/* Layout */
.layout{display:flex;flex:1;overflow:hidden}
/* Sidebar */
.sidebar{width:180px;background:var(--surface);border-right:1px solid var(--border);padding:12px 0;flex-shrink:0}
.nav-item{display:flex;align-items:center;gap:8px;padding:8px 16px;font-size:.83rem;cursor:pointer;border-radius:0;color:var(--muted);transition:all .15s;border-left:2px solid transparent}
.nav-item:hover{color:var(--text);background:var(--surface2)}
.nav-item.active{color:var(--accent);background:var(--surface2);border-left-color:var(--accent)}
.nav-icon{font-size:.95rem;width:16px;text-align:center}
.nav-divider{height:1px;background:var(--border);margin:8px 0}
/* Main */
.main{flex:1;overflow-y:auto;padding:20px}
.panel{display:none}
.panel.active{display:block}
/* Search + filter */
.toolbar{display:flex;gap:8px;margin-bottom:16px;align-items:center}
.search-input{flex:1;padding:7px 12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:.83rem;outline:none}
.search-input:focus{border-color:var(--accent)}
.filter-btn{padding:5px 10px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font-size:.75rem;cursor:pointer;transition:all .15s}
.filter-btn:hover,.filter-btn.active{background:var(--surface2);color:var(--text);border-color:var(--accent)}
/* Cards */
.obs-list,.corpus-list,.session-list{display:flex;flex-direction:column;gap:2px}
.obs-card{display:flex;gap:10px;padding:10px 12px;background:var(--surface);border:1px solid var(--border);border-radius:7px;transition:border-color .15s}
.obs-card:hover{border-color:#444c56}
.obs-icon{font-size:1rem;flex-shrink:0;margin-top:1px;width:20px;text-align:center}
.obs-content{flex:1;min-width:0}
.obs-summary{font-size:.85rem;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.obs-meta{display:flex;gap:8px;margin-top:3px;font-size:.72rem;color:var(--muted)}
.obs-file{color:var(--blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px}
.type-badge{padding:1px 6px;border-radius:10px;font-size:.68rem;font-weight:500;flex-shrink:0}
.type-change{background:#1a3048;color:var(--blue)}
.type-bugfix{background:#3d1a1a;color:var(--red)}
.type-feature{background:#1a3d1a;color:var(--green)}
.type-refactor{background:#2d1a3d;color:var(--purple)}
.type-decision{background:#3d2d1a;color:var(--yellow)}
.type-discovery{background:#1a2d3d;color:#79c0ff}
/* Corpus */
.corpus-card{padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:7px;margin-bottom:2px}
.corpus-title{font-size:.88rem;font-weight:600;margin-bottom:4px}
.corpus-source{font-size:.72rem;color:var(--blue);margin-bottom:6px}
.corpus-preview{font-size:.78rem;color:var(--muted);line-height:1.5}
/* Sessions */
.session-card{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface);border:1px solid var(--border);border-radius:7px}
.sess-id{font-family:monospace;font-size:.82rem}
.sess-status{padding:2px 7px;border-radius:10px;font-size:.68rem;font-weight:500}
.sess-active{background:#1a4731;color:var(--green)}
.sess-done{background:var(--surface2);color:var(--muted)}
.sess-time{margin-left:auto;font-size:.72rem;color:var(--muted)}
/* Empty */
.empty{text-align:center;padding:48px 24px;color:var(--muted);font-size:.85rem}
.empty-icon{font-size:2rem;margin-bottom:12px}
code{background:var(--surface2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;font-size:.8rem;font-family:monospace}
/* Scrollbar */
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:var(--border);border-radius:3px}
/* Toast */
.toast{position:fixed;bottom:20px;right:20px;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:.82rem;box-shadow:0 4px 20px rgba(0,0,0,.5);transform:translateY(80px);opacity:0;transition:all .3s;z-index:999}
.toast.show{transform:translateY(0);opacity:1}
.toast.success{border-color:var(--green);color:var(--green)}
.toast.error{border-color:var(--red);color:var(--red)}
</style>
</head>
<body>
<div class="header">
  <span class="logo">🔥 Fire Code</span>
  <span class="project-badge">${esc(project)}</span>
  <div class="header-right">
    <span class="status-dot" id="dot"></span>
    <span class="status-label" id="statusLabel">running</span>
    <button class="btn" onclick="doRefresh()" id="refreshBtn">↻ Refresh</button>
    <button class="btn primary" onclick="doReindex()" id="reindexBtn">⚡ Re-index</button>
  </div>
</div>

<div class="stats-bar">
  <div class="stat"><strong id="statObs">${observations.length}</strong>Observations</div>
  <div class="stat"><strong id="statSess">${sessions.length}</strong>Sessions</div>
  <div class="stat"><strong id="statCorpus">${corpusItems.length}</strong>Corpus items</div>
  <div class="stat"><strong id="statUptime">–</strong>Uptime</div>
</div>

<div class="layout">
  <nav class="sidebar">
    <div class="nav-item active" onclick="showPanel('obs',this)"><span class="nav-icon">👁</span>Observations</div>
    <div class="nav-item" onclick="showPanel('corpus',this)"><span class="nav-icon">📚</span>Corpus</div>
    <div class="nav-item" onclick="showPanel('sessions',this)"><span class="nav-icon">💬</span>Sessions</div>
    <div class="nav-divider"></div>
    <div class="nav-item" onclick="window.open('https://github.com/phmotad/fire-code','_blank')"><span class="nav-icon">★</span>GitHub</div>
    <div class="nav-item" onclick="window.open('https://www.npmjs.com/package/@phmotad/fire-code','_blank')"><span class="nav-icon">📦</span>npm</div>
  </nav>

  <main class="main">
    <!-- Observations panel -->
    <div class="panel active" id="panel-obs">
      <div class="toolbar">
        <input class="search-input" placeholder="Search observations…" oninput="renderObs(this.value,activeType)" id="obsSearch">
        <button class="filter-btn active" onclick="filterType('',this)">All</button>
        <button class="filter-btn" onclick="filterType('feature',this)">✨ feature</button>
        <button class="filter-btn" onclick="filterType('bugfix',this)">🐛 bugfix</button>
        <button class="filter-btn" onclick="filterType('change',this)">✏️ change</button>
        <button class="filter-btn" onclick="filterType('decision',this)">🧭 decision</button>
        <button class="filter-btn" onclick="filterType('refactor',this)">♻️ refactor</button>
      </div>
      <div class="obs-list" id="obsList"></div>
    </div>

    <!-- Corpus panel -->
    <div class="panel" id="panel-corpus">
      <div class="toolbar">
        <input class="search-input" placeholder="Search corpus…" oninput="renderCorpus(this.value)" id="corpusSearch">
      </div>
      <div class="corpus-list" id="corpusList"></div>
    </div>

    <!-- Sessions panel -->
    <div class="panel" id="panel-sessions">
      <div class="session-list" id="sessionList"></div>
    </div>
  </main>
</div>

<div class="toast" id="toast"></div>

<script>
const OBS = ${obsJson};
const SESS = ${sessJson};
const CORPUS = ${corpJson};
const ICONS = {change:'✏️',bugfix:'🐛',feature:'✨',refactor:'♻️',decision:'🧭',discovery:'🔍'};
let activeType = '';

function showPanel(name, el) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('panel-'+name).classList.add('active');
  el.classList.add('active');
}

function filterType(type, el) {
  activeType = type;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  renderObs(document.getElementById('obsSearch').value, type);
}

function renderObs(q, type) {
  const q2 = q.toLowerCase();
  const filtered = OBS.filter(o =>
    (!type || o.type === type) &&
    (!q2 || o.summary.toLowerCase().includes(q2) || (o.file && o.file.toLowerCase().includes(q2)))
  );
  const el = document.getElementById('obsList');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">👁</div>No observations yet.<br>Claude will record changes automatically.</div>';
    return;
  }
  el.innerHTML = filtered.map(o => \`
    <div class="obs-card">
      <span class="obs-icon">\${ICONS[o.type]||'•'}</span>
      <div class="obs-content">
        <div class="obs-summary">\${o.summary}</div>
        <div class="obs-meta">
          <span class="type-badge type-\${o.type}">\${o.type}</span>
          \${o.file ? \`<span class="obs-file">\${o.file}</span>\` : ''}
          <span>\${o.date}</span>
        </div>
      </div>
    </div>
  \`).join('');
}

function renderCorpus(q) {
  const q2 = q.toLowerCase();
  const filtered = CORPUS.filter(c =>
    !q2 || c.title.toLowerCase().includes(q2) || c.preview.toLowerCase().includes(q2)
  );
  const el = document.getElementById('corpusList');
  if (!filtered.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📚</div>No corpus items yet.<br>Run <code>fire-code corpus build</code></div>';
    return;
  }
  el.innerHTML = filtered.map(c => \`
    <div class="corpus-card">
      <div class="corpus-title">\${c.title}</div>
      \${c.source ? \`<div class="corpus-source">\${c.source}</div>\` : ''}
      <div class="corpus-preview">\${c.preview}\${c.preview.length >= 150 ? '…' : ''}</div>
    </div>
  \`).join('');
}

function renderSessions() {
  const el = document.getElementById('sessionList');
  if (!SESS.length) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">💬</div>No sessions yet.</div>';
    return;
  }
  el.innerHTML = SESS.map(s => \`
    <div class="session-card">
      <span class="sess-id">\${s.id}</span>
      <span class="sess-status \${s.status==='active'?'sess-active':'sess-done'}">\${s.status}</span>
      <span class="sess-time">\${s.start}</span>
    </div>
  \`).join('');
}

function toast(msg, type='success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast '+type+' show';
  setTimeout(() => t.className = 'toast', 3000);
}

function doRefresh() {
  const btn = document.getElementById('refreshBtn');
  btn.classList.add('loading'); btn.textContent = '↻ Loading…';
  location.reload();
}

async function doReindex() {
  const btn = document.getElementById('reindexBtn');
  btn.classList.add('loading'); btn.textContent = '⚡ Indexing…';
  try {
    const r = await fetch('/index', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'lazy'})});
    const d = await r.json();
    if (d.ok) toast('Re-index complete ✓'); else toast(d.error||'Error','error');
  } catch(e) { toast('Daemon unreachable','error'); }
  finally { btn.classList.remove('loading'); btn.textContent = '⚡ Re-index'; }
}

async function updateUptime() {
  try {
    const r = await fetch('/health');
    const d = await r.json();
    const s = Math.floor(d.uptime/1000);
    const h = Math.floor(s/3600), m = Math.floor((s%3600)/60);
    document.getElementById('statUptime').textContent = h ? h+'h '+m+'m' : m+'m '+s%60+'s';
  } catch {}
}

// Init
renderObs('', '');
renderCorpus('');
renderSessions();
updateUptime();
setInterval(updateUptime, 10000);
setTimeout(() => location.reload(), 60000);
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
