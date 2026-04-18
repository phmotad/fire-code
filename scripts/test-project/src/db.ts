import type { User } from './types';

// In-memory mock database
const users = new Map<string, User>();
const tokens = new Map<string, { userId: string; expiresAt: Date }>();

export const db = {
  users: {
    findByEmail: async (email: string): Promise<User | null> => {
      return Array.from(users.values()).find((u) => u.email === email) ?? null;
    },
    findById: async (id: string): Promise<User | null> => {
      return users.get(id) ?? null;
    },
    create: async (data: { email: string; passwordHash: string }): Promise<User> => {
      const id = Math.random().toString(36).slice(2);
      const user: User = { id, ...data, createdAt: new Date(), updatedAt: new Date() };
      users.set(id, user);
      return user;
    },
    update: async (id: string, data: Partial<User>): Promise<User> => {
      const user = users.get(id);
      if (!user) throw new Error('User not found');
      const updated = { ...user, ...data, updatedAt: new Date() };
      users.set(id, updated);
      return updated;
    },
  },
  tokens: {
    save: async (token: string, userId: string, expiresAt: Date): Promise<void> => {
      tokens.set(token, { userId, expiresAt });
    },
    find: async (token: string): Promise<{ userId: string; expiresAt: Date } | null> => {
      return tokens.get(token) ?? null;
    },
    delete: async (token: string): Promise<void> => {
      tokens.delete(token);
    },
  },
};
