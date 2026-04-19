export type UserId = string;
export type Email = string;

export interface User {
  id: UserId;
  email: Email;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  metadata: Record<string, unknown>;
}

export type UserRole = 'admin' | 'moderator' | 'user' | 'guest';
export type UserStatus = 'active' | 'suspended' | 'deleted' | 'pending';

export interface UserProfile {
  userId: UserId;
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  socialLinks: SocialLink[];
}

export interface SocialLink {
  platform: 'twitter' | 'github' | 'linkedin' | 'website';
  url: string;
}

export function isAdmin(user: User): boolean {
  return user.role === 'admin';
}

export function isModerator(user: User): boolean {
  return user.role === 'moderator' || user.role === 'admin';
}

export function isActive(user: User): boolean {
  return user.status === 'active';
}

export function isGuest(user: User): boolean {
  return user.role === 'guest';
}

export function canModerate(user: User): boolean {
  return isModerator(user) && isActive(user);
}

export function sanitizeUser(user: User): Omit<User, 'passwordHash' | 'metadata'> {
  const { passwordHash: _ph, metadata: _m, ...safe } = user;
  return safe;
}

export function createGuestUser(): User {
  return {
    id: 'guest-' + Math.random().toString(36).slice(2),
    email: '',
    username: 'guest',
    passwordHash: '',
    role: 'guest',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: {},
  };
}
