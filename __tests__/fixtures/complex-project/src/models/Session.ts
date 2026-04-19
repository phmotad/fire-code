import { UserId } from './User';

export type SessionId = string;

export interface Session {
  id: SessionId;
  userId: UserId;
  token: string;
  refreshToken: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  createdAt: Date;
  lastUsedAt: Date;
  revoked: boolean;
  revokedAt?: Date;
  revokedReason?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export function isExpired(session: Session): boolean {
  return session.expiresAt < new Date();
}

export function isRefreshExpired(session: Session): boolean {
  return session.refreshExpiresAt < new Date();
}

export function isRevoked(session: Session): boolean {
  return session.revoked;
}

export function isValid(session: Session): boolean {
  return !isExpired(session) && !isRevoked(session);
}

export function canRefresh(session: Session): boolean {
  return !isRefreshExpired(session) && !isRevoked(session);
}

export function expiresInSeconds(session: Session): number {
  return Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));
}
