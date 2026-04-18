import { DatabaseManager } from '../../db/DatabaseManager.js';
import { ObservationService } from '../../services/ObservationService.js';
import { SessionService } from '../../services/SessionService.js';
import { SummarizationService } from '../../services/SummarizationService.js';
import { getFireCodeDir } from '../../utils/paths.js';
import { basename } from 'path';

interface ObserveOptions {
  cwd: string;
  data?: string;
}

interface ContextOptions {
  cwd: string;
  limit?: number;
  file?: string;
}

interface SessionOptions {
  cwd: string;
  id?: string;
  subcommand: 'start' | 'end' | 'summarize';
}

function getProjectName(cwd: string): string {
  try {
    const pkg = JSON.parse(require('fs').readFileSync(require('path').join(cwd, 'package.json'), 'utf8'));
    return pkg.name || basename(cwd);
  } catch { return basename(cwd); }
}

export async function observeCommand(opts: ObserveOptions): Promise<void> {
  if (!opts.data) return;

  let payload: {
    tool?: string; input?: Record<string, unknown>; result?: unknown;
    sessionId?: string; project?: string;
  };
  try { payload = JSON.parse(opts.data); } catch { return; }

  const project = payload.project ?? getProjectName(opts.cwd);
  const svc = new ObservationService(opts.cwd);
  const session = new SessionService(opts.cwd, project);

  const sessionId = payload.sessionId ?? session.getOrCreate(opts.cwd);

  svc.capture({
    tool_name: payload.tool ?? 'unknown',
    tool_input: payload.input,
    tool_result: payload.result,
    session_id: sessionId,
    project,
    cwd: opts.cwd,
  });
}

export async function contextCommand(opts: ContextOptions): Promise<void> {
  const project = getProjectName(opts.cwd);
  const db = DatabaseManager.getInstance(getFireCodeDir(opts.cwd));

  if (opts.file) {
    const obs = db.getObservations({ project, file_path: opts.file, limit: opts.limit ?? 5 });
    if (obs.length === 0) return;
    const lines = obs.map(o => `• [${o.type}] ${o.summary}`).join('\n');
    process.stdout.write(lines + '\n');
    return;
  }

  const context = db.getRecentContext(project, opts.limit ?? 10);
  if (context) process.stdout.write(context + '\n');
}

export async function sessionCommand(opts: SessionOptions): Promise<void> {
  const project = getProjectName(opts.cwd);
  const session = new SessionService(opts.cwd, project);

  switch (opts.subcommand) {
    case 'start': {
      const id = opts.id ?? session.getOrCreate(opts.cwd);
      process.stdout.write(id + '\n');
      break;
    }
    case 'end': {
      const id = opts.id ?? session.getActiveId();
      if (id) session.end(id);
      break;
    }
    case 'summarize': {
      const id = opts.id ?? session.getActiveId();
      if (!id) break;
      const svc = new SummarizationService(opts.cwd);
      await svc.summarizeSession(id, project);
      if (id) session.end(id);
      break;
    }
  }
}
