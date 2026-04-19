export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  pool: { min: number; max: number; idleTimeoutMs: number };
  ssl: boolean;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
  duration: number;
}

export interface Transaction {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface DatabaseClient {
  query<T>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  isHealthy(): Promise<boolean>;
}

export class QueryBuilder {
  private clauses: string[] = [];
  private params: unknown[] = [];
  private paramIndex = 1;

  select(fields: string | string[]): this {
    const cols = Array.isArray(fields) ? fields.join(', ') : fields;
    this.clauses.push(`SELECT ${cols}`);
    return this;
  }

  from(table: string, alias?: string): this {
    this.clauses.push(`FROM ${table}${alias ? ` AS ${alias}` : ''}`);
    return this;
  }

  where(condition: string, ...values: unknown[]): this {
    const replaced = condition.replace(/\?/g, () => `$${this.paramIndex++}`);
    this.clauses.push(`WHERE ${replaced}`);
    this.params.push(...values);
    return this;
  }

  andWhere(condition: string, ...values: unknown[]): this {
    const replaced = condition.replace(/\?/g, () => `$${this.paramIndex++}`);
    this.clauses.push(`AND ${replaced}`);
    this.params.push(...values);
    return this;
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): this {
    this.clauses.push(`ORDER BY ${field} ${direction}`);
    return this;
  }

  limit(n: number): this {
    this.clauses.push(`LIMIT $${this.paramIndex++}`);
    this.params.push(n);
    return this;
  }

  offset(n: number): this {
    this.clauses.push(`OFFSET $${this.paramIndex++}`);
    this.params.push(n);
    return this;
  }

  build(): { sql: string; params: unknown[] } {
    return { sql: this.clauses.join('\n'), params: this.params };
  }
}

export function buildInsert(table: string, data: Record<string, unknown>): { sql: string; params: unknown[] } {
  const keys = Object.keys(data);
  const cols = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  return { sql: `INSERT INTO ${table} (${cols}) VALUES (${placeholders}) RETURNING *`, params: Object.values(data) };
}

export function buildUpdate(table: string, data: Record<string, unknown>, where: Record<string, unknown>): { sql: string; params: unknown[] } {
  const sets = Object.keys(data).map((k, i) => `${k} = $${i + 1}`).join(', ');
  const whereKeys = Object.keys(where);
  const offset = Object.keys(data).length;
  const conds = whereKeys.map((k, i) => `${k} = $${offset + i + 1}`).join(' AND ');
  return {
    sql: `UPDATE ${table} SET ${sets} WHERE ${conds} RETURNING *`,
    params: [...Object.values(data), ...Object.values(where)],
  };
}
