import { User, UserStatus } from '../models/User';
import { Session, TokenPair } from '../models/Session';
import { hashPassword, generateSalt, generateToken, constantTimeCompare } from '../utils/crypto';
import { validateEmail, validatePassword } from '../utils/validators';

export interface LoginCredentials {
  email: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  username: string;
}

export interface AuthResult {
  user: User;
  session: Session;
  tokens: TokenPair;
}

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_CREDENTIALS' | 'ACCOUNT_SUSPENDED' | 'EMAIL_NOT_VERIFIED' | 'TOKEN_EXPIRED' | 'TOKEN_INVALID',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

export function validateLoginCredentials(credentials: LoginCredentials): string[] {
  const errors: string[] = [];
  if (!validateEmail(credentials.email)) errors.push('Invalid email address');
  if (!credentials.password || credentials.password.length < 1) errors.push('Password is required');
  return errors;
}

export function validateRegistration(input: RegisterInput): string[] {
  const errors: string[] = [];
  if (!validateEmail(input.email)) errors.push('Invalid email address');
  const pwResult = validatePassword(input.password);
  if (!pwResult.valid) errors.push(...pwResult.errors);
  if (!/^[a-zA-Z0-9_\-]{3,32}$/.test(input.username)) errors.push('Invalid username');
  return errors;
}

export function hashUserPassword(password: string): { hash: string; salt: string } {
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  return { hash, salt };
}

export function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const computed = hashPassword(password, salt);
  return constantTimeCompare(computed, storedHash);
}

export function generateSessionTokens(): TokenPair {
  return {
    accessToken: generateToken(48),
    refreshToken: generateToken(64),
    expiresIn: 3600,
    refreshExpiresIn: 2592000,
  };
}

export function buildSessionExpiry(tokens: TokenPair): { expiresAt: Date; refreshExpiresAt: Date } {
  const now = Date.now();
  return {
    expiresAt: new Date(now + tokens.expiresIn * 1000),
    refreshExpiresAt: new Date(now + tokens.refreshExpiresIn * 1000),
  };
}

export function isAccountSuspended(user: User): boolean {
  return user.status === 'suspended';
}

export function isAccountDeleted(user: User): boolean {
  return user.status === 'deleted';
}

export function isAccountPending(user: User): boolean {
  return user.status === 'pending';
}

export function canLogin(user: User): { allowed: boolean; reason?: string } {
  if (isAccountDeleted(user)) return { allowed: false, reason: 'Account not found' };
  if (isAccountSuspended(user)) return { allowed: false, reason: 'Account is suspended' };
  if (isAccountPending(user)) return { allowed: false, reason: 'Email not verified' };
  return { allowed: true };
}

export function parseAuthHeader(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}
