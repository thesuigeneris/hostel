/** DTO mappers for seeker/tenant routes. Shapes match `@hostels/shared` schemas. */
import type * as T from '@hostels/shared';
import { isOverdue } from '@hostels/shared';
import type { schema } from '../db';
import { iso, isoOrNull } from './serialize';

type Row<K extends keyof typeof schema> = (typeof schema)[K] extends { $inferSelect: infer R } ? R : never;

export function toSubscription(s: Row<'subscriptions'>): T.Subscription {
  return {
    id: s.id,
    userId: s.userId,
    hostelId: s.hostelId,
    roomTypeId: s.roomTypeId,
    mealPlan: s.mealPlan,
    diet: s.diet,
    status: s.status,
    startDate: s.startDate,
    cancelAt: s.cancelAt,
    createdAt: iso(s.createdAt),
  };
}

export function toInvoice(i: Row<'invoices'>, today?: string): T.Invoice {
  return {
    id: i.id,
    subscriptionId: i.subscriptionId,
    userId: i.userId,
    hostelId: i.hostelId,
    periodStart: i.periodStart,
    periodEnd: i.periodEnd,
    rentAmount: i.rentAmount,
    foodAmount: i.foodAmount,
    creditAmount: i.creditAmount,
    totalAmount: i.totalAmount,
    status: i.status,
    dueDate: i.dueDate,
    overdue: i.status === 'due' && isOverdue(i.dueDate, today),
    razorpayOrderId: i.razorpayOrderId,
    paidAt: isoOrNull(i.paidAt),
  };
}

/** Owner software invoices are paid through the same checkout, so they are presented in the Invoice shape. */
export function saasAsInvoice(s: Row<'saasInvoices'>, today?: string): T.Invoice {
  const [y, m] = s.periodMonth.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    id: s.id,
    subscriptionId: '',
    userId: s.ownerId,
    hostelId: s.hostelId,
    periodStart: `${s.periodMonth}-01`,
    periodEnd: `${s.periodMonth}-${String(lastDay).padStart(2, '0')}`,
    rentAmount: 0,
    foodAmount: 0,
    creditAmount: 0,
    totalAmount: s.amount,
    status: s.status,
    dueDate: s.dueDate,
    overdue: s.status === 'due' && isOverdue(s.dueDate, today),
    razorpayOrderId: s.razorpayOrderId,
    paidAt: isoOrNull(s.paidAt),
  };
}

export function toMoveRequest(m: Row<'moveRequests'>): T.MoveRequest {
  return {
    id: m.id,
    subscriptionId: m.subscriptionId,
    fromHostelId: m.fromHostelId,
    fromRoomTypeId: m.fromRoomTypeId,
    toHostelId: m.toHostelId,
    toRoomTypeId: m.toRoomTypeId,
    moveDate: m.moveDate,
    status: m.status,
    createdAt: iso(m.createdAt),
  };
}

export function toMealSkip(s: Row<'mealSkips'>): T.MealSkip {
  return { id: s.id, date: s.date, meal: s.meal, creditAmount: s.creditAmount };
}

export function toVisitRequest(v: Row<'visitRequests'>): T.VisitRequest {
  return {
    id: v.id,
    hostelId: v.hostelId,
    userId: v.userId,
    preferredDate: v.preferredDate,
    message: v.message,
    status: v.status,
    createdAt: iso(v.createdAt),
  };
}
