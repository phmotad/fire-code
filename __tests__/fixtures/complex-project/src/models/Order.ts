import { UserId } from './User';
import { PaymentId } from './Payment';

export type OrderId = string;

export interface Order {
  id: OrderId;
  userId: UserId;
  paymentId?: PaymentId;
  items: OrderItem[];
  status: OrderStatus;
  total: number;
  discount: number;
  tax: number;
  shippingAddress: Address;
  billingAddress: Address;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

export interface OrderItem {
  id: string;
  orderId: OrderId;
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  discount: number;
}

export interface Address {
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
}

export type OrderStatus =
  | 'draft'
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export function calculateSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.totalPrice, 0);
}

export function calculateTotal(order: Order): number {
  return calculateSubtotal(order.items) - order.discount + order.tax;
}

export function isCancellable(order: Order): boolean {
  return ['draft', 'pending_payment', 'paid'].includes(order.status);
}

export function isShipped(order: Order): boolean {
  return ['shipped', 'delivered'].includes(order.status);
}

export function isPaid(order: Order): boolean {
  return order.paymentId !== undefined && ['paid', 'processing', 'shipped', 'delivered'].includes(order.status);
}

export function applyDiscount(order: Order, discountAmount: number): Order {
  return { ...order, discount: order.discount + discountAmount };
}
