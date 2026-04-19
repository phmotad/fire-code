import { Payment, PaymentId, PaymentProvider, PaymentStatus, Refund, calculateFee, isRefundable } from '../models/Payment';
import { OrderId } from '../models/Order';
import { UserId } from '../models/User';
import { Cache, buildCacheKey } from '../core/cache';

export class PaymentNotFoundError extends Error {
  constructor(id: string) { super(`Payment not found: ${id}`); this.name = 'PaymentNotFoundError'; }
}

export class PaymentError extends Error {
  constructor(message: string, public readonly code: string) { super(message); this.name = 'PaymentError'; }
}

export interface PaymentIntent {
  orderId: OrderId;
  userId: UserId;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  metadata?: Record<string, unknown>;
}

export interface PaymentRepository {
  findById(id: PaymentId): Promise<Payment | null>;
  findByOrderId(orderId: OrderId): Promise<Payment | null>;
  findByUserId(userId: UserId, page?: number, pageSize?: number): Promise<Payment[]>;
  create(intent: PaymentIntent): Promise<Payment>;
  updateStatus(id: PaymentId, status: PaymentStatus, providerTxId?: string): Promise<Payment | null>;
  createRefund(paymentId: PaymentId, amount: number, reason: string): Promise<Refund>;
}

export class PaymentService {
  private static readonly CACHE_TTL = 60;

  constructor(
    private readonly repo: PaymentRepository,
    private readonly cache: Cache,
  ) {}

  async initiatePayment(intent: PaymentIntent): Promise<Payment> {
    if (intent.amount <= 0) throw new PaymentError('Amount must be positive', 'INVALID_AMOUNT');
    const fee = calculateFee(intent.amount, intent.provider);
    const payment = await this.repo.create({ ...intent, metadata: { ...intent.metadata, fee } });
    return payment;
  }

  async findById(id: PaymentId): Promise<Payment> {
    const key = buildCacheKey('payment', id);
    const cached = await this.cache.get<Payment>(key);
    if (cached) return cached;
    const payment = await this.repo.findById(id);
    if (!payment) throw new PaymentNotFoundError(id);
    await this.cache.set(key, payment, { ttl: PaymentService.CACHE_TTL });
    return payment;
  }

  async completePayment(id: PaymentId, providerTransactionId: string): Promise<Payment> {
    const updated = await this.repo.updateStatus(id, 'completed', providerTransactionId);
    if (!updated) throw new PaymentNotFoundError(id);
    await this.cache.delete(buildCacheKey('payment', id));
    return updated;
  }

  async failPayment(id: PaymentId): Promise<Payment> {
    const updated = await this.repo.updateStatus(id, 'failed');
    if (!updated) throw new PaymentNotFoundError(id);
    await this.cache.delete(buildCacheKey('payment', id));
    return updated;
  }

  async refundPayment(id: PaymentId, amount: number, reason: string): Promise<Refund> {
    const payment = await this.findById(id);
    if (!isRefundable(payment)) throw new PaymentError('Payment is not refundable', 'NOT_REFUNDABLE');
    if (amount > payment.amount) throw new PaymentError('Refund exceeds payment amount', 'REFUND_EXCEEDS_AMOUNT');
    const refund = await this.repo.createRefund(id, amount, reason);
    const newStatus: PaymentStatus = amount === payment.amount ? 'refunded' : 'partially_refunded';
    await this.repo.updateStatus(id, newStatus);
    await this.cache.delete(buildCacheKey('payment', id));
    return refund;
  }

  async getUserPayments(userId: UserId, page = 1, pageSize = 20): Promise<Payment[]> {
    return this.repo.findByUserId(userId, page, pageSize);
  }
}
