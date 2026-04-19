import { User, UserId, Email, UserRole, UserStatus } from '../models/User';
import { DatabaseClient, QueryBuilder } from '../core/database';

export interface UserFilters {
  role?: UserRole;
  status?: UserStatus;
  email?: string;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: Email): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  findMany(filters: UserFilters, page: number, pageSize: number): Promise<PaginatedResult<User>>;
  create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User>;
  update(id: UserId, data: Partial<User>): Promise<User | null>;
  delete(id: UserId): Promise<boolean>;
  updateStatus(id: UserId, status: UserStatus): Promise<User | null>;
  updateRole(id: UserId, role: UserRole): Promise<User | null>;
  updateLastLogin(id: UserId): Promise<void>;
  count(filters?: UserFilters): Promise<number>;
  existsByEmail(email: Email): Promise<boolean>;
  existsByUsername(username: string): Promise<boolean>;
}

export class SqlUserRepository implements UserRepository {
  constructor(private readonly db: DatabaseClient) {}

  async findById(id: UserId): Promise<User | null> {
    const result = await this.db.query<User>('SELECT * FROM users WHERE id = $1 AND status != $2', [id, 'deleted']);
    return result.rows[0] ?? null;
  }

  async findByEmail(email: Email): Promise<User | null> {
    const result = await this.db.query<User>('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    return result.rows[0] ?? null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const result = await this.db.query<User>('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] ?? null;
  }

  async findMany(filters: UserFilters, page = 1, pageSize = 20): Promise<PaginatedResult<User>> {
    const qb = new QueryBuilder().select('*').from('users');
    if (filters.role) qb.andWhere('role = ?', filters.role);
    if (filters.status) qb.andWhere('status = ?', filters.status);
    if (filters.createdAfter) qb.andWhere('created_at >= ?', filters.createdAfter);
    qb.orderBy('created_at', 'DESC').limit(pageSize).offset((page - 1) * pageSize);
    const { sql, params } = qb.build();
    const result = await this.db.query<User>(sql, params);
    const total = await this.count(filters);
    return { items: result.rows, total, page, pageSize, hasMore: page * pageSize < total };
  }

  async create(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const result = await this.db.query<User>(
      'INSERT INTO users (email, username, password_hash, role, status, metadata) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [data.email, data.username, data.passwordHash, data.role, data.status, JSON.stringify(data.metadata)],
    );
    return result.rows[0];
  }

  async update(id: UserId, data: Partial<User>): Promise<User | null> {
    const fields = Object.entries(data).filter(([k]) => !['id', 'createdAt'].includes(k));
    if (fields.length === 0) return this.findById(id);
    const sets = fields.map(([k], i) => `${k} = $${i + 2}`).join(', ');
    const result = await this.db.query<User>(
      `UPDATE users SET ${sets}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...fields.map(([, v]) => v)],
    );
    return result.rows[0] ?? null;
  }

  async delete(id: UserId): Promise<boolean> {
    const result = await this.db.query('UPDATE users SET status = $1 WHERE id = $2', ['deleted', id]);
    return result.rowCount > 0;
  }

  async updateStatus(id: UserId, status: UserStatus): Promise<User | null> {
    return this.update(id, { status });
  }

  async updateRole(id: UserId, role: UserRole): Promise<User | null> {
    return this.update(id, { role });
  }

  async updateLastLogin(id: UserId): Promise<void> {
    await this.db.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [id]);
  }

  async count(filters: UserFilters = {}): Promise<number> {
    const qb = new QueryBuilder().select('COUNT(*) as count').from('users');
    if (filters.role) qb.andWhere('role = ?', filters.role);
    if (filters.status) qb.andWhere('status = ?', filters.status);
    const { sql, params } = qb.build();
    const result = await this.db.query<{ count: string }>(sql, params);
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }

  async existsByEmail(email: Email): Promise<boolean> {
    const result = await this.db.query('SELECT 1 FROM users WHERE email = $1 LIMIT 1', [email.toLowerCase()]);
    return result.rowCount > 0;
  }

  async existsByUsername(username: string): Promise<boolean> {
    const result = await this.db.query('SELECT 1 FROM users WHERE username = $1 LIMIT 1', [username]);
    return result.rowCount > 0;
  }
}
