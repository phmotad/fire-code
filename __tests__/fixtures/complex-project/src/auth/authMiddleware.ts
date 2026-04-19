import { Session } from '../models/Session';
import { User } from '../models/User';
import { parseAuthHeader } from './authService';
import { isValid } from '../models/Session';

export interface AuthContext {
  user: User;
  session: Session;
  token: string;
}

export interface Request {
  headers: Record<string, string | undefined>;
  body: unknown;
  params: Record<string, string>;
  query: Record<string, string | undefined>;
  auth?: AuthContext;
}

export interface Response {
  status(code: number): this;
  json(body: unknown): void;
  send(body: string): void;
}

export type NextFn = (error?: Error) => void;
export type Middleware = (req: Request, res: Response, next: NextFn) => Promise<void> | void;

export function requireAuth(req: Request, res: Response, next: NextFn): void {
  if (!req.auth) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    return;
  }
  next();
}

export function requireRole(...roles: string[]): Middleware {
  return (req, res, next) => {
    if (!req.auth) { res.status(401).json({ error: 'Authentication required' }); return; }
    if (!roles.includes(req.auth.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions', required: roles });
      return;
    }
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFn): void {
  requireRole('admin')(req, res, next);
}

export function extractTokenMiddleware(req: Request, _res: Response, next: NextFn): void {
  const token = parseAuthHeader(req.headers['authorization']);
  if (token) req.query = { ...req.query, _token: token };
  next();
}

export function rateLimitMiddleware(maxRequests: number, windowMs: number): Middleware {
  const requests = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = req.headers['x-forwarded-for'] ?? req.headers['host'] ?? 'unknown';
    const now = Date.now();
    const entry = requests.get(key as string);
    if (!entry || entry.resetAt < now) {
      requests.set(key as string, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }
    if (entry.count >= maxRequests) {
      res.status(429).json({ error: 'Too many requests', retryAfter: Math.ceil((entry.resetAt - now) / 1000) });
      return;
    }
    entry.count++;
    next();
  };
}

export function corsMiddleware(allowedOrigins: string[]): Middleware {
  return (req, res, next) => {
    const origin = req.headers['origin'] ?? '';
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      next();
    } else {
      res.status(403).json({ error: 'Origin not allowed' });
    }
  };
}
