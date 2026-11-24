"use client";

import { useRevealFormErrors } from "@/hooks/useRevealFormErrors";
import { FieldError, fieldErrorId } from "@/components/ui/FieldError";
import { getErrorMessage } from "@/lib/errors";
import { useState } from "react";
import { Check, Tag, X } from "lucide-react";
import {
  formatMoney,
  type AppliedDiscount,
  type PaymentMethodKind
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { usePreviewDiscount } from "../hooks/usePaymentsApi";

/** An applied code with the server's own figures for the order (FE review P1). */
export type DiscountQuote = {
  discount: AppliedDiscount;
  taxAmount: number;
  total: number;
};

type Props = {
  planId: string;
  currency: string;
  method: PaymentMethodKind | null;
  applied: AppliedDiscount | null;
  onApply: (quote: DiscountQuote | null) => void;
  disabled?: boolean;
};

/**
 * The coupon field.
 *
 * Applying here is only a preview — the server re-resolves the code at
 * checkout, so a code that expires or hits its limit in between is caught
 * there. The price shown is always the server's answer, never computed here.
 */
export function DiscountField({
  planId,
  currency,
  method,
  applied,
  onApply,
  disabled
}: Props) {
  const preview = usePreviewDiscount();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // A refused code: the field turns red and one toast says why (UI_RULES § "Form errors").
  useRevealFormErrors(error);
  const [open, setOpen] = useState(false);

  const submit = () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setError(null);
    preview.mutate(
      { planId, code: trimmed, currency, method: method ?? undefined },
      {
        onSuccess: (result) => {
          if (result.valid) {
            onApply({ discount: result.discount, taxAmount: result.taxAmount, total: result.total });
            setCode("");
          } else {
            setError(result.message);
            onApply(null);
          }
        },
        onError: (mutationError) => setError(getErrorMessage(mutationError))
      }
    );
  };

  if (applied) {
    return (
      <div className="flex items-center gap-2 rounded-app border border-success bg-success/10 px-3 py-2">
        <Check aria-hidden className="size-4 shrink-0 text-success-ink" strokeWidth={2.5} />
        <span className="min-w-0 flex-1 text-sm text-success-ink">
          <span className="font-mono font-bold">{applied.code}</span> applied —{" "}
          {formatMoney(applied.amount, currency)} off
        </span>
        <SimpleTooltip label="Remove this code">
          <Button
            aria-label={`Remove discount code ${applied.code}`}
            className="size-7 hover:bg-app-soft"
            disabled={disabled}
            onClick={() => {
              onApply(null);
              setOpen(true);
            }}
            size="icon"
            type="button"
            variant="neutral"
          >
            <X className="size-3.5" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        className="flex items-center gap-1.5 text-sm font-semibold text-primary-ink underline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Tag aria-hidden className="size-3.5" strokeWidth={2.5} />
        Have a discount code?
      </button>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <Input
          aria-describedby={error ? fieldErrorId("discount-code") : undefined}
          aria-invalid={Boolean(error)}
          aria-label="Discount code"
          className="font-mono uppercase"
          disabled={disabled}
          maxLength={40}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="Enter code"
          value={code}
        />
        <Button
          disabled={disabled || !code.trim()}
          isLoading={preview.isPending}
          onClick={submit}
          type="button"
          variant="outline"
        >
          Apply
        </Button>
      </div>

      <FieldError id="discount-code" message={error} />
    </div>
  );
}
