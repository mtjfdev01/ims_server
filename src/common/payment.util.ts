import { BadRequestException } from '@nestjs/common';

export const SERVICE_KINDS = ['repair', 'consultancy', 'accessory', 'other'] as const;
export type ServiceKind = (typeof SERVICE_KINDS)[number];

export const PAYMENT_STATUSES = ['completed', 'pending', 'partial'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INSTALLMENT_FREQUENCIES = ['none', 'daily', 'weekly', 'monthly'] as const;
export type InstallmentFrequency = (typeof INSTALLMENT_FREQUENCIES)[number];

export function money(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parseFloat(parsed.toFixed(2)) : 0;
}

export function derivePaymentStatus(totalAmount: number, amountPaid: number): PaymentStatus {
  const total = money(totalAmount);
  const paid = money(amountPaid);
  if (paid <= 0) {
    return 'pending';
  }
  if (paid + 0.001 >= total) {
    return 'completed';
  }
  return 'partial';
}

export function remainingBalance(totalAmount: number, amountPaid: number): number {
  return Math.max(0, money(money(totalAmount) - money(amountPaid)));
}

export function toDateOnly(value?: string | Date | null): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

export function todayDate(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function advanceDueDate(from: Date, frequency: InstallmentFrequency): Date {
  const next = new Date(from);
  next.setHours(0, 0, 0, 0);
  if (frequency === 'daily') {
    next.setDate(next.getDate() + 1);
  } else if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  } else if (frequency === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export function initialNextDueDate(params: {
  paymentStatus: PaymentStatus;
  frequency: InstallmentFrequency;
  promiseDate?: string | Date | null;
}): Date | null {
  if (params.paymentStatus === 'completed' || params.frequency === 'none') {
    return params.paymentStatus === 'completed' ? null : toDateOnly(params.promiseDate);
  }
  return toDateOnly(params.promiseDate) || todayDate();
}

export function toIsoDate(date: Date | null): string | null {
  if (!date) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type CreditFields = {
  amountPaid: number | null;
  paymentStatus: PaymentStatus;
  installmentFrequency: InstallmentFrequency;
  installmentAmount: number | null;
  promiseDate: string | null;
  nextDueDate: string | null;
};

export type CreditTermsInput = {
  amountPaid?: number;
  promiseDate?: string | null;
  installmentFrequency?: InstallmentFrequency;
  installmentAmount?: number | null;
};

export function applyCreditTerms<T extends CreditFields>(record: T, totalAmount: number, input: CreditTermsInput): T {
  const total = money(totalAmount);
  const paid = input.amountPaid == null
    ? (record.amountPaid == null ? total : money(record.amountPaid))
    : money(input.amountPaid);
  if (paid > total + 0.001) {
    throw new BadRequestException('Amount paid cannot exceed the charged amount');
  }
  const status = derivePaymentStatus(total, paid);
  const frequency = input.installmentFrequency || record.installmentFrequency || 'none';
  const promiseDate = input.promiseDate === undefined ? record.promiseDate : input.promiseDate;
  const remaining = remainingBalance(total, paid);

  if (status !== 'completed' && frequency === 'none' && !promiseDate) {
    throw new BadRequestException('Promise date is required when payment is pending or partial');
  }
  if (status !== 'completed' && frequency !== 'none') {
    const installment = input.installmentAmount == null ? money(record.installmentAmount) : money(input.installmentAmount);
    if (installment <= 0) {
      throw new BadRequestException('Installment amount is required for daily, weekly, or monthly plans');
    }
    if (installment > remaining + 0.001) {
      throw new BadRequestException('Installment amount cannot exceed remaining balance');
    }
    record.installmentAmount = installment;
  } else {
    record.installmentAmount = status === 'completed'
      ? null
      : (input.installmentAmount === undefined ? record.installmentAmount : input.installmentAmount);
  }

  record.amountPaid = paid;
  record.paymentStatus = status;
  record.installmentFrequency = status === 'completed' ? 'none' : frequency;
  record.promiseDate = status === 'completed' ? null : (promiseDate || null);
  record.nextDueDate = toIsoDate(initialNextDueDate({
    paymentStatus: status,
    frequency: record.installmentFrequency,
    promiseDate: record.promiseDate,
  }));
  if (status === 'completed') {
    record.installmentAmount = null;
    record.nextDueDate = null;
    record.promiseDate = null;
  }
  return record;
}

export const INSTALLMENT_SCHEDULES = ['first_of_month', 'monthly_on_day'] as const;
export type InstallmentSchedule = (typeof INSTALLMENT_SCHEDULES)[number];

export const DUE_STATUSES = ['pending', 'upcoming', 'completed'] as const;
export type DueStatus = (typeof DUE_STATUSES)[number];

export function clampDayOfMonth(year: number, monthIndex: number, day: number): number {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return Math.min(Math.max(1, day), last);
}

export function dateOnDay(year: number, monthIndex: number, day: number): Date {
  const date = new Date(year, monthIndex, clampDayOfMonth(year, monthIndex, day));
  date.setHours(0, 0, 0, 0);
  return date;
}

export function nextOnOrAfter(from: Date, dayOfMonth: number): Date {
  const start = toDateOnly(from) || todayDate();
  const sameMonth = dateOnDay(start.getFullYear(), start.getMonth(), dayOfMonth);
  if (sameMonth.getTime() >= start.getTime()) {
    return sameMonth;
  }
  return dateOnDay(start.getFullYear(), start.getMonth() + 1, dayOfMonth);
}

export function generateMonthlyDueDates(count: number, dayOfMonth: number, firstDueDate: Date): Date[] {
  const first = toDateOnly(firstDueDate) || todayDate();
  const dates: Date[] = [];
  for (let index = 0; index < count; index += 1) {
    dates.push(dateOnDay(first.getFullYear(), first.getMonth() + index, dayOfMonth));
  }
  return dates;
}

export function splitInstallmentAmounts(total: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }
  const each = money(Math.floor((money(total) / count) * 100) / 100);
  const amounts = Array.from({ length: count }, () => each);
  amounts[count - 1] = money(money(total) - money(each * (count - 1)));
  return amounts;
}

export function deriveDueStatus(dueDate: string | Date | null, amount: number, paidAmount: number, today = todayDate()): DueStatus {
  if (money(amount) <= 0 || money(paidAmount) + 0.001 >= money(amount)) {
    return 'completed';
  }
  const due = toDateOnly(dueDate);
  if (!due) {
    return 'pending';
  }
  return due.getTime() <= today.getTime() ? 'pending' : 'upcoming';
}

export function startOfWeek(from = todayDate()): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  const weekday = date.getDay();
  const mondayOffset = weekday === 0 ? 6 : weekday - 1;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

export function endOfWeek(from = todayDate()): Date {
  const start = startOfWeek(from);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
}

export function addDays(from: Date, days: number): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

export function presentCredit<T extends CreditFields & { balance?: number }>(record: T, totalAmount: number): T {
  const total = money(totalAmount);
  const paid = record.amountPaid == null ? total : money(record.amountPaid);
  record.amountPaid = paid;
  record.paymentStatus = record.paymentStatus || derivePaymentStatus(total, paid);
  record.balance = remainingBalance(total, paid);
  return record;
}
