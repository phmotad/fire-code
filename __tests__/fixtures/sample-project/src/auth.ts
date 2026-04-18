import { hash } from './utils';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export async function loginUser(email: string, password: string): Promise<boolean> {
  const hashed = await hash(password);
  return hashed.length > 0;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
