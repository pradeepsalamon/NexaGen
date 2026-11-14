"use client";

import {
  Building2,
  CreditCard,
  Smartphone,
  Wallet,
  type LucideIcon
} from "lucide-react";
import type { CheckoutMethodOption, PaymentMethodKind } from "@nexa-chess/types";
import { cn } from "@/lib/utils";

const METHOD_ICONS: Partial<Record<PaymentMethodKind, LucideIcon>> = {
  UPI: Smartphone,
  CARD: CreditCard,
  NET_BANKING: Building2,
  WALLET: Wallet,
  EMI: CreditCard,
  PAY_LATER: Wallet,
  APPLE_PAY: CreditCard,
  GOOGLE_PAY: CreditCard
};

type Props = {
  methods: CheckoutMethodOption[];
  value: PaymentMethodKind | null;
  onChange: (method: PaymentMethodKind) => void;
  disabled?: boolean;
};

/**
 * The payment-method list. Every option here came from the server, which only
 * lists what a configured, healthy gateway can actually serve — so the screen
 * never offers something that would fail at the handoff.
 *
 * It deliberately names no UPI app. Which apps a customer sees is the gateway's
 * answer at checkout time, not a promise we can make here.
 */
export function PaymentMethodPicker({
  methods,
  value,
  onChange,
  disabled
}: Props) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-semibold text-app-text">
        Payment Method
      </legend>

      {methods.map((method) => {
        const Icon = METHOD_ICONS[method.kind] ?? CreditCard;
        const selected = value === method.kind;

        return (
          <label
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-app border p-3 transition sm:p-4",
              selected
                ? "border-primary bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)]"
                : "border-app-border bg-app-surface hover:bg-app-soft"
            )}
            key={method.kind}
          >
            <input
              checked={selected}
              className="mt-1 size-4 accent-[rgb(var(--rgb-primary))]"
              name="payment-method"
              onChange={() => onChange(method.kind)}
              type="radio"
              value={method.kind}
            />

            <Icon
              aria-hidden
              className={cn(
                "mt-0.5 size-5 shrink-0",
                selected ? "text-primary-ink" : "text-app-muted"
              )}
              strokeWidth={2.5}
            />

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-app-text">
                {method.label}
              </span>
              <span className="block text-xs text-app-muted">{method.hint}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
