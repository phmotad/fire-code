import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { SCHEMA_SQL } from './schema.js';
import { SQLiteGraphStore } from '../graph/SQLiteGraphStore.js';

export type ObservationType = 'change' | 'bugfix' | 'feature' | 'refactor' | 'decision' | 'discovery';

export interface Session {
  id: string;
  project: string;
  cwd: string;
  started_at: number;
  ended_at: number | null;
  status: 'active' | 'completed' | 'abandoned';
}

export interface Observation {
  id: number;
  session_id: string;
  project: string;
  type: ObservationType;
  tool: string | null;
  file_path: string | null;
  summary: string;
  detail: string | null;
  created_at: number;
}

export interface Summary {
  id: number;
  session_id: string;
  project: string;
  content: string;
  created_at: number;
}

export interface CorpusItem {
  id: number;
  project: string;
  title: string;
  content: string;
  source: string | null;
  tags: string;
  private: number;
  created_at: number;
  updated_at: number;
}

export interface ObservationFilter {
  project?: string;
  type?: ObservationType;
  file_path?: string;
  query?: string;
  limit?: number;
  offset?: number;
  dateStart?: number;
  dateEnd?: number;
}

let instance: DatabaseManager | null = null;

export class DatabaseManager {
  // exposed for reset() only — do not use externally
  readonly db: Database.Database;

  private constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  static getInstance(firecdoDir: string): DatabaseManager {
    if (!instance) {
      if (!existsSync(firecdoDir)) mkdirSync(firecdoDir, { recursive: true });
      const dbPath = join(firecdoDir, 'firecode.db');
      instance = new DatabaseManager(dbPath);
    }
    return instance;
  }

  static reset(): void {
    if (instance) {
      try { instance.db.close(); } catch { /* ignore */ }
      instance = null;
    }
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  createSession(id: string, project: string, cwd: string): Session {
    const stmt = this.db.prepare(
      `INSERT OR IGNORE INTO sessions (id, project, cwd, started_at) VALUES (?, ?, ?, ?)`
    );
    stmt.run(id, project, cwd, Date.now());
    return this.getSession(id)!;
  }

  getSession(id: string): Session | null {
    return this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Session | null;
  }

  endSession(id: string, status: 'completed' | 'abandoned' = 'completed'): void {
    this.db.prepare(`UPDATE sessions SET ended_at = ?, status = ? WHERE id = ?`)
      .run(Date.now(), status, id);
  }

  getActiveSession(project: string): Session | null {
    return this.db.prepare(
      `SELECT * FROM sessions WHERE project = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`
    ).get(project) as Session | null;
  }

  // ── Observations ──────────────────────────────────────────────────────────

  addObservation(obs: Omit<Observation, 'id' | 'created_at'>): number {
    const result = this.db.prepare(`
      INSERT INTO observations (session_id, project, type, tool, file_path, summary, detail)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(obs.session_id, obs.project, obs.type, obs.tool, obs.file_path, obs.summary, obs.detail);
    return result.lastInsertRowid as number;
  }

  getObservations(filter: ObservationFilter = {}): Observation[] {
    const { project, type, file_path, query, limit = 20, offset = 0, dateStart, dateEnd } = filter;

    if (query) {
      // FTS5 search
      const ftsResults = this.db.prepare(`
        SELECT o.* FROM observations o
        JOIN observations_fts f ON f.rowid = o.id
        WHERE observations_fts MATCH ?
          ${project ? 'AND o.project = ?' : ''}
          ${type ? 'AND o.type = ?' : ''}
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
      `).all(
        ...[query, project, type].filter(Boolean),
        limit, offset
      ) as Observation[];
      return ftsResults;
    }

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (project) { conditions.push('project = ?'); params.push(project); }
    if (type) { conditions.push('type = ?'); params.push(type); }
    if (file_path) { conditions.push('file_path LIKE ?'); params.push(`%${file_path}%`); }
    if (dateStart) { conditions.push('created_at >= ?'); params.push(dateStart); }
    if (dateEnd) { conditions.push('created_at <= ?'); params.push(dateEnd); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    params.push(limit, offset);

    return this.db.prepare(`
      SELECT * FROM observations ${where}
      ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).all(...params) as Observation[];
  }

  getObservationsByIds(ids: number[]): Observation[] {
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    return this.db.prepare(
      `SELECT * FROM observations WHERE id IN (${placeholders}) ORDER BY created_at DESC`
    ).all(...ids) as Observation[];
  }

  getRecentContext(project: string, limit = 10): string {
    const obs = this.getObservations({ project, limit });
    if (obs.length === 0) return '';

    const summaries = this.db.prepare(
      `SELECT * FROM summaries WHERE project = ? ORDER BY created_at DESC LIMIT 3`
    ).all(project) as Summary[];

    const lines: string[] = ['## Recent Project Memory\n'];

    if (summaries.length > 0) {
      lines.push('### Session Summaries');
      summaries.forEach(s => {
        const date = new Date(s.created_at).toLocaleDateString();
        lines.push(`**[${date}]** ${s.content}`);
      });
      lines.push('');
    }

    if (obs.length > 0) {
      lines.push('### Recent Observations');
      obs.forEach(o => {
        const icon = { change: '✏️', bugfix: '🐛', feature: '✨', refactor: '♻️', decision: '🧭', discovery: '🔍' }[o.type] ?? '•';
        const file = o.file_path ? ` \`${o.file_path}\`` : '';
        lines.push(`${icon} **[${o.type}]**${file} — ${o.summary}`);
      });
    }

    return lines.join('\n');
  }

  // ── Summaries ─────────────────────────────────────────────────────────────

  addSummary(session_id: string, project: string, content: string): number {
    const result = this.db.prepare(
      `INSERT INTO summaries (session_id, project, content) VALUES (?, ?, ?)`
    ).run(session_id, project, content);
    return result.lastInsertRowid as number;
  }

  // ── File index ────────────────────────────────────────────────────────────

  upsertFileIndex(project: string, filePath: string, functions: string[], classes: string[], imports: string[]): void {
    this.db.prepare(`
      INSERT INTO file_index (project, file_path, functions, classes, imports, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(project, file_path) DO UPDATE SET
        functions  = excluded.functions,
        classes    = excluded.classes,
        imports    = excluded.imports,
        indexed_at = excluded.indexed_at
    `).run(project, filePath, JSON.stringify(functions), JSON.stringify(classes), JSON.stringify(imports), Date.now());
  }

  // ── Sessions list ─────────────────────────────────────────────────────────

  getSessions(project: string, limit = 10): Session[] {
    return this.db.prepare(
      `SELECT * FROM sessions WHERE project = ? ORDER BY started_at DESC LIMIT ?`
    ).all(project, limit) as Session[];
  }

  // ── Corpus ────────────────────────────────────────────────────────────────

  upsertCorpus(project: string, title: string, content: string, source?: string, tags?: string[], isPrivate = false): number {
    const tagsJson = JSON.stringify(tags ?? []);
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT INTO corpus (project, title, content, source, tags, private, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project, title) DO UPDATE SET
        content    = excluded.content,
        source     = excluded.source,
        tags       = excluded.tags,
        private    = excluded.private,
        updated_at = excluded.updated_at
    `).run(project, title, content, source ?? null, tagsJson, isPrivate ? 1 : 0, now, now);
    return result.lastInsertRowid as number;
  }

  getCorpus(filter: { project?: string; query?: string; tags?: string[]; limit?: number; includePrivate?: boolean }): CorpusItem[] {
    const { project, query, limit = 10, includePrivate = false } = filter;
    const privateFilter = includePrivate ? '' : 'AND c.private = 0';

    if (query) {
      return this.db.prepare(`
        SELECT c.* FROM corpus c
        JOIN corpus_fts f ON f.rowid = c.id
        WHERE corpus_fts MATCH ?
          ${project ? 'AND c.project = ?' : ''}
          ${privateFilter}
        ORDER BY c.updated_at DESC
        LIMIT ?
      `).all(...[query, project].filter(Boolean), limit) as CorpusItem[];
    }

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    if (project) { conditions.push('project = ?'); params.push(project); }
    if (!includePrivate) { conditions.push('private = 0'); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    return this.db.prepare(
      `SELECT * FROM corpus ${where} ORDER BY updated_at DESC LIMIT ?`
    ).all(...params, limit) as CorpusItem[];
  }

  deleteCorpus(project: string, title: string): void {
    this.db.prepare(`DELETE FROM corpus WHERE project = ? AND title = ?`).run(project, title);
  }

  // ── Graph ─────────────────────────────────────────────────────────────────

  getGraphStore(project: string): SQLiteGraphStore {
    return new SQLiteGraphStore(this.db, project);
  }

  close(): void {
    this.db.close();
    instance = null;
  }
}
