import { PaymentProvider } from '../models/Payment';

export interface ProcessorConfig {
  apiKey: string;
  webhookSecret: string;
  sandbox: boolean;
}

export interface ChargeRequest {
  amount: number;
  currency: string;
  customerId?: string;
  paymentMethodId: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface ChargeResponse {
  transactionId: string;
  status: 'succeeded' | 'pending' | 'failed';
  amount: number;
  currency: string;
  providerResponse: unknown;
}

export interface RefundRequest {
  transactionId: string;
  amount?: number;
  reason?: string;
}

export interface WebhookEvent {
  id: string;
  type: string;
  provider: PaymentProvider;
  payload: unknown;
  signature: string;
  timestamp: number;
}

export interface PaymentProcessor {
  charge(request: ChargeRequest): Promise<ChargeResponse>;
  refund(request: RefundRequest): Promise<ChargeResponse>;
  verifyWebhook(event: WebhookEvent): boolean;
  createCustomer(email: string, metadata?: Record<string, string>): Promise<string>;
}

export function buildProcessorConfig(provider: PaymentProvider, env: NodeJS.ProcessEnv): ProcessorConfig {
  const prefix = provider.toUpperCase().replace(/-/g, '_');
  const apiKey = env[`${prefix}_API_KEY`] ?? '';
  const webhookSecret = env[`${prefix}_WEBHOOK_SECRET`] ?? '';
  const sandbox = env[`${prefix}_SANDBOX`] !== 'false';
  return { apiKey, webhookSecret, sandbox };
}

export function normalizeAmount(amount: number, currency: string): number {
  const zeroCurrencies = ['JPY', 'KRW', 'VND', 'CLP'];
  return zeroCurrencies.includes(currency.toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

export function parseCurrency(value: string): { amount: number; currency: string } | null {
  const match = value.match(/^([A-Z]{3})\s*(\d+(?:\.\d{1,2})?)$/);
  if (!match) return null;
  return { currency: match[1], amount: parseFloat(match[2]) };
}

export function isIdempotencyKey(key: string): boolean {
  return /^[a-zA-Z0-9\-_]{8,64}$/.test(key);
}

export function buildIdempotencyKey(orderId: string, attempt: number): string {
  return `${orderId.slice(0, 20)}-attempt-${attempt}`;
}

export function maskCardNumber(number: string): string {
  const digits = number.replace(/\D/g, '');
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}
