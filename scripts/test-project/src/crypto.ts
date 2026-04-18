import { createHash, randomBytes } from 'crypto';

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const hash = createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${hash}`;
}

export async function comparePassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  const computed = createHash('sha256').update(password + salt).digest('hex');
  return computed === hash;
}

export function generateToken(length = 32): string {
  return randomBytes(length).toString('hex');
}
