import { randomBytes } from "node:crypto";
import {
  BILLING_INTERVAL_MONTHS,
  percentOf,
  type BillingInterval,
  type PaymentMethodKind,
  type PlanItem
} from "@nexa-chess/types";
import { Prisma, type Plan } from "@prisma/client";

/** Order numbers are human handles: NEXA-2026-7F3K9Q. */
export function generateOrderNumber(prefix: string, now: Date = new Date()): string {
  const year = now.getUTCFullYear();
  // Crockford-ish alphabet: no I, O, 0 or 1, so support can read it aloud.
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const bytes = randomBytes(6);
  const suffix = Array.from(bytes)
    .map((byte) => alphabet[byte % alphabet.length])
    .join("");
  return `${prefix}-${year}-${suffix}`;
}

export type PricedOrder = {
  subtotal: number;
  taxAmount: number;
  total: number;
};

/**
 * The single place an order's money is computed. Always server-side: a client
 * that posts its own amount is ignored entirely.
 */
export function priceOrder(amount: number, taxPercent: number): PricedOrder {
  const taxAmount = taxPercent > 0 ? percentOf(amount, taxPercent) : 0;
  return { subtotal: amount, taxAmount, total: amount + taxAmount };
}

/**
 * When access bought by a plan runs out. `accessDays` wins when the plan sets
 * one; otherwise a recurring plan grants exactly its billing interval and a
 * one-time plan grants perpetual access.
 */
export function computeAccessEnd(
  plan: { interval: BillingInterval; accessDays: number | null },
  from: Date
): Date | null {
  if (plan.accessDays) {
    return new Date(from.getTime() + plan.accessDays * 24 * 60 * 60 * 1000);
  }

  const months = BILLING_INTERVAL_MONTHS[plan.interval];
  if (months === null) return null;

  return addMonths(from, months);
}

/**
 * Calendar-safe month addition. Adding a month to 31 Jan lands on 28/29 Feb
 * rather than rolling into March, which is what a billing cycle must do.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Phone numbers reach providers as E.164 digits with no separators or "+". */
export function normalizePhone(
  raw: string | null | undefined,
  defaultCountryCode?: string
): string | undefined {
  if (!raw) return undefined;

  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 0) return undefined;

  // A national number with a leading trunk 0 needs the country code prepended;
  // a "+" number is already international.
  if (defaultCountryCode && !raw.trim().startsWith("+") && digits.length <= 11) {
    const national = digits.replace(/^0+/, "");
    if (national.length >= 6 && national.length <= 10) {
      return `${defaultCountryCode}${national}`;
    }
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : undefined;
}

/**
 * A UPI intent string, used only to render a QR for a provider that gave us a
 * VPA but no QR image. We never construct a UPI *request* — the payment itself
 * always goes through the gateway.
 */
export function buildUpiIntent(input: {
  vpa: string;
  payeeName: string;
  amountMajor: number;
  currency: string;
  note: string;
  transactionRef: string;
}): string {
  const params = new URLSearchParams({
    pa: input.vpa,
    pn: input.payeeName,
    am: input.amountMajor.toFixed(2),
    cu: input.currency.toUpperCase(),
    tn: input.note.slice(0, 50),
    tr: input.transactionRef
  });
  return `upi://pay?${params.toString()}`;
}

/** Masks a provider handle for a UI that does not need the whole thing. */
export function maskHandle(value: string | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

/**
 * Whether a method can be mandated for recurring billing. UPI autopay and
 * cards can; net banking and most wallets cannot, which is why §13 warns
 * against assuming every method recurs the same way.
 */
export function supportsRecurringMethod(
  method: PaymentMethodKind | null
): boolean {
  return method === "UPI" || method === "CARD" || method === "OTHER";
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
  );
}

/** A P2002 whose violated unique index covers `field`. */
export function isUniqueViolationOn(error: unknown, field: string): boolean {
  if (!isUniqueViolation(error)) return false;
  const target = (error as Prisma.PrismaClientKnownRequestError).meta?.target;
  return Array.isArray(target) ? target.includes(field) : String(target ?? "").includes(field);
}

/** Provider payloads are stored verbatim; anything unserialisable is dropped. */
export function toJson(raw: unknown): Prisma.InputJsonValue {
  try {
    return JSON.parse(JSON.stringify(raw ?? {})) as Prisma.InputJsonValue;
  } catch {
    return {};
  }
}

/** One mapping from a Plan row to the shared PlanItem, used by every read. */
export function toPlanItem(
  plan: Plan & { batch?: { name: string } | null; _count?: { subscriptions: number } }
): PlanItem {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    description: plan.description,
    amount: plan.amount,
    currency: plan.currency,
    interval: plan.interval,
    accessDays: plan.accessDays,
    taxPercent: plan.taxPercent,
    batchId: plan.batchId,
    batchName: plan.batch?.name ?? null,
    allowedMethods: plan.allowedMethods,
    features: plan.features,
    isActive: plan.isActive,
    sortOrder: plan.sortOrder,
    activeSubscriptions: plan._count?.subscriptions ?? 0,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString()
  };
}
