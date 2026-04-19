import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

export function hash(input: string, algorithm: 'sha256' | 'sha512' | 'md5' = 'sha256'): string {
  return createHash(algorithm).update(input).digest('hex');
}

export function hmac(input: string, secret: string, algorithm: 'sha256' | 'sha512' = 'sha256'): string {
  return createHmac(algorithm, secret).update(input).digest('hex');
}

export function hashPassword(password: string, salt: string): string {
  return hmac(password, salt, 'sha512');
}

export function generateSalt(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function generateToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}

export function generateShortId(bytes = 8): string {
  return randomBytes(bytes).toString('hex');
}

export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function encodeBase64(input: string): string {
  return Buffer.from(input).toString('base64');
}

export function decodeBase64(input: string): string {
  return Buffer.from(input, 'base64').toString('utf8');
}

export function encodeBase64Url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

export function checksumMD5(data: string): string {
  return createHash('md5').update(data).digest('hex');
}

export function sha256(input: string): string {
  return hash(input, 'sha256');
}

export function sha512(input: string): string {
  return hash(input, 'sha512');
}
