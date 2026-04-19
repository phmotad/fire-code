import { Request, Response, NextFn, Middleware, requireAuth, requireRole } from '../auth/authMiddleware';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Route {
  method: HttpMethod;
  path: string;
  middlewares: Middleware[];
  handler: (req: Request, res: Response) => Promise<void> | void;
}

export interface RouterGroup {
  prefix: string;
  middlewares: Middleware[];
  routes: Route[];
}

export class Router {
  private routes: Route[] = [];

  get(path: string, ...handlers: Array<Middleware | ((req: Request, res: Response) => void)>): this {
    return this.register('GET', path, handlers);
  }

  post(path: string, ...handlers: Array<Middleware | ((req: Request, res: Response) => void)>): this {
    return this.register('POST', path, handlers);
  }

  put(path: string, ...handlers: Array<Middleware | ((req: Request, res: Response) => void)>): this {
    return this.register('PUT', path, handlers);
  }

  patch(path: string, ...handlers: Array<Middleware | ((req: Request, res: Response) => void)>): this {
    return this.register('PATCH', path, handlers);
  }

  delete(path: string, ...handlers: Array<Middleware | ((req: Request, res: Response) => void)>): this {
    return this.register('DELETE', path, handlers);
  }

  private register(method: HttpMethod, path: string, handlers: Function[]): this {
    const middlewares = handlers.slice(0, -1) as Middleware[];
    const handler = handlers[handlers.length - 1] as (req: Request, res: Response) => void;
    this.routes.push({ method, path, middlewares, handler });
    return this;
  }

  getRoutes(): Route[] {
    return [...this.routes];
  }

  group(prefix: string, middlewares: Middleware[], fn: (r: Router) => void): this {
    const sub = new Router();
    fn(sub);
    for (const route of sub.getRoutes()) {
      this.routes.push({ ...route, path: prefix + route.path, middlewares: [...middlewares, ...route.middlewares] });
    }
    return this;
  }
}

export function buildUserRoutes(router: Router): void {
  router.group('/users', [requireAuth], r => {
    r.get('/', requireRole('admin'), async (req, res) => {
      res.json({ users: [] });
    });
    r.get('/:id', async (req, res) => {
      res.json({ user: null });
    });
    r.patch('/:id', async (req, res) => {
      res.json({ user: null });
    });
    r.delete('/:id', requireRole('admin'), async (req, res) => {
      res.json({ success: true });
    });
  });
}

export function buildOrderRoutes(router: Router): void {
  router.group('/orders', [requireAuth], r => {
    r.get('/', async (req, res) => { res.json({ orders: [] }); });
    r.post('/', async (req, res) => { res.json({ order: null }); });
    r.get('/:id', async (req, res) => { res.json({ order: null }); });
    r.post('/:id/cancel', async (req, res) => { res.json({ order: null }); });
  });
}

export function buildPaymentRoutes(router: Router): void {
  router.group('/payments', [requireAuth], r => {
    r.post('/', async (req, res) => { res.json({ payment: null }); });
    r.get('/:id', async (req, res) => { res.json({ payment: null }); });
    r.post('/:id/refund', async (req, res) => { res.json({ refund: null }); });
  });
}
