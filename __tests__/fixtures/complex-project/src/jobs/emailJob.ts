import { User } from '../models/User';
import { Order } from '../models/Order';
import { Payment } from '../models/Payment';

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'retrying';

export interface Job<T = unknown> {
  id: string;
  type: string;
  payload: T;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  template: string;
  variables: Record<string, unknown>;
}

export interface EmailQueue {
  enqueue(payload: EmailPayload, opts?: { delay?: number; priority?: number }): Promise<string>;
  dequeue(): Promise<Job<EmailPayload> | null>;
  complete(jobId: string): Promise<void>;
  fail(jobId: string, error: Error): Promise<void>;
  retry(jobId: string): Promise<void>;
}

export function buildWelcomeEmail(user: User): EmailPayload {
  return {
    to: user.email,
    subject: 'Welcome to our platform!',
    template: 'welcome',
    variables: { username: user.username, createdAt: user.createdAt.toISOString() },
  };
}

export function buildOrderConfirmationEmail(user: User, order: Order): EmailPayload {
  return {
    to: user.email,
    subject: `Order #${order.id} confirmed`,
    template: 'order-confirmation',
    variables: {
      username: user.username,
      orderId: order.id,
      total: order.total,
      items: order.items.map(i => ({ name: i.name, qty: i.quantity, price: i.totalPrice })),
    },
  };
}

export function buildPaymentReceiptEmail(user: User, payment: Payment): EmailPayload {
  return {
    to: user.email,
    subject: `Payment receipt — ${payment.id}`,
    template: 'payment-receipt',
    variables: {
      username: user.username,
      amount: payment.amount,
      currency: payment.currency,
      provider: payment.provider,
      transactionId: payment.providerTransactionId,
      paidAt: payment.updatedAt.toISOString(),
    },
  };
}

export function buildPasswordResetEmail(email: string, resetToken: string, expiresInMinutes: number): EmailPayload {
  return {
    to: email,
    subject: 'Reset your password',
    template: 'password-reset',
    variables: { resetToken, expiresInMinutes },
  };
}

export function buildSuspensionNoticeEmail(user: User, reason: string): EmailPayload {
  return {
    to: user.email,
    subject: 'Your account has been suspended',
    template: 'account-suspension',
    variables: { username: user.username, reason },
  };
}

export function buildRefundNoticeEmail(user: User, payment: Payment, refundAmount: number): EmailPayload {
  return {
    to: user.email,
    subject: `Refund processed — ${payment.id}`,
    template: 'refund-notice',
    variables: {
      username: user.username,
      refundAmount,
      originalAmount: payment.amount,
      currency: payment.currency,
    },
  };
}
