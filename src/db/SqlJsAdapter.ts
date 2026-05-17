import { existsSync, readFileSync, writeFileSync } from 'fs';
import type { SqlJsStatic, Database as SqlJsDbInstance, SqlValue } from 'sql.js';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const _initSqlJs = require('sql.js') as (config?: object) => Promise<SqlJsStatic>;

let _sqlJs: SqlJsStatic | null = null;

export async function initSqlJs(): Promise<void> {
  if (_sqlJs) return;
  // require('sql.js') → dist/sql-wasm.js. The Emscripten loader locates
  // sql-wasm.wasm from __dirname (same dist/ folder) automatically in Node.js.
  _sqlJs = await _initSqlJs();
}

export function getSqlJsSync(): SqlJsStatic {
  if (!_sqlJs) throw new Error('sql.js WASM not initialised — call initSqlJs() at startup');
  return _sqlJs;
}

// ── Run result (mirrors better-sqlite3) ─────────────────────────────────────

export interface RunResult {
  lastInsertRowid: number;
  changes: number;
}

// ── Statement wrapper ────────────────────────────────────────────────────────
// Statements are NOT auto-freed — callers may reuse them across multiple run()
// calls. Memory is reclaimed when the database is closed.

export class SqlJsStatement {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private readonly raw: any, private readonly owner: SqlJsDatabase) {}

  // Return types intentionally match better-sqlite3: unknown allows callers to cast
  get(...params: unknown[]): unknown {
    if (params.length > 0) this.raw.bind(params as SqlValue[]);
    const found = this.raw.step();
    const row = found ? this.raw.getAsObject() : null;
    this.raw.reset();
    return row;
  }

  all(...params: unknown[]): unknown[] {
    if (params.length > 0) this.raw.bind(params as SqlValue[]);
    const rows: unknown[] = [];
    while (this.raw.step()) {
      rows.push(this.raw.getAsObject());
    }
    this.raw.reset();
    return rows;
  }

  run(...params: unknown[]): RunResult {
    // sql.js Statement.run() binds params, steps once, and resets internally —
    // the statement is ready to be reused after this call.
    this.raw.run(params.length > 0 ? (params as SqlValue[]) : undefined);
    this.owner.markDirty();
    const lastId = (this.owner._scalar('SELECT last_insert_rowid()') ?? 0) as number;
    const chg = (this.owner._scalar('SELECT changes()') ?? 0) as number;
    return { lastInsertRowid: lastId, changes: chg };
  }

  free(): void {
    this.raw.free();
  }
}

// ── Database wrapper ─────────────────────────────────────────────────────────

export class SqlJsDatabase {
  private dirty = false;

  private constructor(
    private readonly db: SqlJsDbInstance,
    private readonly filePath: string,
  ) {}

  static openSync(sqlJs: SqlJsStatic, filePath: string): SqlJsDatabase {
    const db = existsSync(filePath)
      ? new sqlJs.Database(readFileSync(filePath))
      : new sqlJs.Database();
    return new SqlJsDatabase(db, filePath);
  }

  prepare(sql: string): SqlJsStatement {
    return new SqlJsStatement(this.db.prepare(sql), this);
  }

  /** Execute one or more SQL statements (DDL, schema init). */
  exec(sql: string): void {
    // sql.js db.exec() handles multiple statements and is the correct way
    // to run schema SQL that contains triggers with BEGIN...END blocks.
    this.db.exec(sql);
    this.dirty = true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transaction<T>(fn: (arg: T) => void): (arg: T) => void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return function (arg: T): void {
      self.db.run('BEGIN');
      try {
        fn(arg);
        self.db.run('COMMIT');
      } catch (err) {
        try { self.db.run('ROLLBACK'); } catch { /* ignore */ }
        throw err;
      }
      self.flush();
    };
  }

  markDirty(): void {
    this.dirty = true;
  }

  _scalar(sql: string): SqlValue | undefined {
    return this.db.exec(sql)[0]?.values?.[0]?.[0];
  }

  flush(): void {
    if (!this.dirty) return;
    const data = this.db.export();
    writeFileSync(this.filePath, Buffer.from(data));
    this.dirty = false;
  }

  close(): void {
    this.flush();
    this.db.close();
  }
}
