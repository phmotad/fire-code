import { Order, OrderId, OrderItem, OrderStatus, calculateTotal, isCancellable } from '../models/Order';
import { UserId } from '../models/User';
import { Cache, buildCacheKey } from '../core/cache';

export class OrderNotFoundError extends Error {
  constructor(id: string) { super(`Order not found: ${id}`); this.name = 'OrderNotFoundError'; }
}

export interface CreateOrderInput {
  userId: UserId;
  items: Array<{ productId: string; sku: string; name: string; quantity: number; unitPrice: number }>;
  shippingAddress: Order['shippingAddress'];
  billingAddress: Order['billingAddress'];
  notes?: string;
}

export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  findByUserId(userId: UserId, page?: number, pageSize?: number): Promise<Order[]>;
  create(input: CreateOrderInput): Promise<Order>;
  updateStatus(id: OrderId, status: OrderStatus): Promise<Order | null>;
  attachPayment(id: OrderId, paymentId: string): Promise<Order | null>;
  cancel(id: OrderId, reason?: string): Promise<Order | null>;
}

export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly cache: Cache,
  ) {}

  async createOrder(input: CreateOrderInput): Promise<Order> {
    if (input.items.length === 0) throw new Error('Order must have at least one item');
    const items: OrderItem[] = input.items.map((item, idx) => ({
      id: `item-${idx}`,
      orderId: '',
      productId: item.productId,
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.unitPrice * item.quantity,
      discount: 0,
    }));
    return this.repo.create({ ...input, items });
  }

  async findById(id: OrderId): Promise<Order> {
    const key = buildCacheKey('order', id);
    const cached = await this.cache.get<Order>(key);
    if (cached) return cached;
    const order = await this.repo.findById(id);
    if (!order) throw new OrderNotFoundError(id);
    await this.cache.set(key, order, { ttl: 120 });
    return order;
  }

  async cancelOrder(id: OrderId, reason?: string): Promise<Order> {
    const order = await this.findById(id);
    if (!isCancellable(order)) throw new Error(`Order ${id} cannot be cancelled in status: ${order.status}`);
    const cancelled = await this.repo.cancel(id, reason);
    if (!cancelled) throw new OrderNotFoundError(id);
    await this.cache.delete(buildCacheKey('order', id));
    return cancelled;
  }

  async markAsPaid(id: OrderId, paymentId: string): Promise<Order> {
    const updated = await this.repo.attachPayment(id, paymentId);
    if (!updated) throw new OrderNotFoundError(id);
    const withStatus = await this.repo.updateStatus(id, 'paid');
    await this.cache.delete(buildCacheKey('order', id));
    return withStatus ?? updated;
  }

  async getUserOrders(userId: UserId, page = 1, pageSize = 20): Promise<Order[]> {
    return this.repo.findByUserId(userId, page, pageSize);
  }

  async getOrderTotal(id: OrderId): Promise<number> {
    const order = await this.findById(id);
    return calculateTotal(order);
  }
}
