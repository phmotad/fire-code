import { User, UserId, UserRole, UserStatus, sanitizeUser } from '../models/User';
import { UserRepository, UserFilters, PaginatedResult } from './userRepository';
import { Cache, buildCacheKey } from '../core/cache';
import { validateEmail, validateUsername } from '../utils/validators';

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`User not found: ${id}`);
    this.name = 'UserNotFoundError';
  }
}

export class DuplicateUserError extends Error {
  constructor(field: 'email' | 'username', value: string) {
    super(`${field} already in use: ${value}`);
    this.name = 'DuplicateUserError';
  }
}

export class UserService {
  private static readonly CACHE_TTL = 300;
  private static readonly CACHE_TAG = 'users';

  constructor(
    private readonly repo: UserRepository,
    private readonly cache: Cache,
  ) {}

  async findById(id: UserId): Promise<User> {
    const cacheKey = buildCacheKey('user', id);
    const cached = await this.cache.get<User>(cacheKey);
    if (cached) return cached;
    const user = await this.repo.findById(id);
    if (!user) throw new UserNotFoundError(id);
    await this.cache.set(cacheKey, user, { ttl: UserService.CACHE_TTL, tags: [UserService.CACHE_TAG, `user:${id}`] });
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    if (!validateEmail(email)) return null;
    return this.repo.findByEmail(email);
  }

  async findByUsername(username: string): Promise<User | null> {
    if (!validateUsername(username)) return null;
    return this.repo.findByUsername(username);
  }

  async listUsers(filters: UserFilters, page = 1, pageSize = 20): Promise<PaginatedResult<User>> {
    return this.repo.findMany(filters, page, pageSize);
  }

  async updateRole(actorId: UserId, targetId: UserId, role: UserRole): Promise<User> {
    const actor = await this.repo.findById(actorId);
    if (!actor || actor.role !== 'admin') throw new Error('Only admins can change roles');
    if (actorId === targetId) throw new Error('Cannot change own role');
    const updated = await this.repo.updateRole(targetId, role);
    if (!updated) throw new UserNotFoundError(targetId);
    await this.cache.deleteByTag(`user:${targetId}`);
    return updated;
  }

  async suspendUser(actorId: UserId, targetId: UserId): Promise<User> {
    return this.setStatus(actorId, targetId, 'suspended');
  }

  async activateUser(actorId: UserId, targetId: UserId): Promise<User> {
    return this.setStatus(actorId, targetId, 'active');
  }

  async deleteUser(actorId: UserId, targetId: UserId): Promise<void> {
    if (actorId === targetId) throw new Error('Cannot delete own account via this method');
    const actor = await this.repo.findById(actorId);
    if (!actor || actor.role !== 'admin') throw new Error('Only admins can delete users');
    const deleted = await this.repo.delete(targetId);
    if (!deleted) throw new UserNotFoundError(targetId);
    await this.cache.deleteByTag(`user:${targetId}`);
  }

  async updateProfile(userId: UserId, data: { username?: string }): Promise<User> {
    if (data.username) {
      if (!validateUsername(data.username)) throw new Error('Invalid username');
      const existing = await this.repo.findByUsername(data.username);
      if (existing && existing.id !== userId) throw new DuplicateUserError('username', data.username);
    }
    const updated = await this.repo.update(userId, data);
    if (!updated) throw new UserNotFoundError(userId);
    await this.cache.deleteByTag(`user:${userId}`);
    return updated;
  }

  async getSanitizedUser(id: UserId): Promise<Omit<User, 'passwordHash' | 'metadata'>> {
    const user = await this.findById(id);
    return sanitizeUser(user);
  }

  private async setStatus(actorId: UserId, targetId: UserId, status: UserStatus): Promise<User> {
    const actor = await this.repo.findById(actorId);
    if (!actor || !['admin', 'moderator'].includes(actor.role)) throw new Error('Insufficient permissions');
    const updated = await this.repo.updateStatus(targetId, status);
    if (!updated) throw new UserNotFoundError(targetId);
    await this.cache.deleteByTag(`user:${targetId}`);
    return updated;
  }
}
