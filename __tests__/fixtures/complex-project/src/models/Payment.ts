export type PaymentId = string;
export type Currency = 'USD' | 'EUR' | 'BRL' | 'GBP';

export interface Payment {
  id: PaymentId;
  userId: string;
  orderId: string;
  amount: number;
  currency: Currency;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerTransactionId?: string;
  createdAt: Date;
  updatedAt: Date;
  refundedAt?: Date;
  metadata: Record<string, unknown>;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'partially_refunded'
  | 'cancelled';

export type PaymentProvider = 'stripe' | 'paypal' | 'mercadopago' | 'manual';

export interface PaymentMethod {
  id: string;
  userId: string;
  type: 'credit_card' | 'debit_card' | 'pix' | 'boleto' | 'bank_transfer';
  last4?: string;
  brand?: string;
  expiresAt?: Date;
  isDefault: boolean;
}

export interface Refund {
  id: string;
  paymentId: PaymentId;
  amount: number;
  reason: string;
  status: 'pending' | 'processed' | 'failed';
  createdAt: Date;
}

export function isPending(payment: Payment): boolean {
  return payment.status === 'pending';
}

export function isCompleted(payment: Payment): boolean {
  return payment.status === 'completed';
}

export function isRefundable(payment: Payment): boolean {
  return payment.status === 'completed' && !payment.refundedAt;
}

export function calculateFee(amount: number, provider: PaymentProvider): number {
  const fees: Record<PaymentProvider, number> = {
    stripe: 0.029,
    paypal: 0.034,
    mercadopago: 0.0499,
    manual: 0,
  };
  return Math.round(amount * fees[provider] * 100) / 100;
}

export function formatAmount(amount: number, currency: Currency): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
}

export function toMinorUnits(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinorUnits(amount: number): number {
  return amount / 100;
}
