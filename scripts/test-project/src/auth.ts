import { hashPassword, comparePassword } from './crypto';
import { db } from './db';
import type { User } from './types';

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): { valid: boolean; reason?: string } {
  if (password.length < 8) return { valid: false, reason: 'Password must be at least 8 characters' };
  if (!/[A-Z]/.test(password)) return { valid: false, reason: 'Password must contain an uppercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, reason: 'Password must contain a number' };
  return { valid: true };
}

export async function loginUser(email: string, password: string): Promise<User | null> {
  if (!validateEmail(email)) return null;
  const user = await db.users.findByEmail(email);
  if (!user) return null;
  const match = await comparePassword(password, user.passwordHash);
  return match ? user : null;
}

export async function registerUser(email: string, password: string): Promise<User> {
  if (!validateEmail(email)) throw new Error('Invalid email format');
  const validation = validatePassword(password);
  if (!validation.valid) throw new Error(validation.reason);
  const exists = await db.users.findByEmail(email);
  if (exists) throw new Error('Email already registered');
  const passwordHash = await hashPassword(password);
  return db.users.create({ email, passwordHash });
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  const user = await db.users.findById(userId);
  if (!user) throw new Error('User not found');
  const match = await comparePassword(oldPassword, user.passwordHash);
  if (!match) throw new Error('Invalid current password');
  const validation = validatePassword(newPassword);
  if (!validation.valid) throw new Error(validation.reason);
  const newHash = await hashPassword(newPassword);
  await db.users.update(userId, { passwordHash: newHash });
}
