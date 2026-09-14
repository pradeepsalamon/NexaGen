"use client";

import { useEffect, useState } from "react";
import {
  isValidGstin,
  stateNameFromCode,
  stateCodeFromGstin,
  type BillingAddress
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  useBillingProfile,
  useUpdateBillingProfile
} from "../hooks/useInvoicesApi";

/**
 * The buyer's own billing identity (§5).
 *
 * Pre-filled with whoever actually pays — for a student account that is the
 * parent on their profile, not the student. Saving changes future invoices
 * only: a receipt already issued keeps the details it was issued with.
 */
export function BillingProfileForm() {
  const { data, isLoading } = useBillingProfile();
  const update = useUpdateBillingProfile();

  const [form, setForm] = useState<BillingAddress | null>(null);

  useEffect(() => {
    if (data) setForm(data.billingProfile);
  }, [data]);

  if (isLoading || !form) return <Skeleton className="h-72 w-full" />;

  const set = <K extends keyof BillingAddress>(
    key: K,
    value: BillingAddress[K]
  ) => setForm((current) => (current ? { ...current, [key]: value } : current));

  const gstinValid =
    !form.gstin || form.gstin.trim() === "" || isValidGstin(form.gstin);
  const placeOfSupply = stateNameFromCode(stateCodeFromGstin(form.gstin));

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-app-text">Billing details</h3>
        <p className="text-xs text-app-muted">
          Who invoices are addressed to. Changes apply to your next invoice —
          receipts already issued are never rewritten.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Billing name"
          onChange={(value) => set("name", value)}
          required
          value={form.name}
        />
        <Field
          hint="For a company or school, if the invoice should be in its name."
          label="Business name"
          onChange={(value) => set("businessName", value || null)}
          value={form.businessName ?? ""}
        />
        <Field
          label="Email"
          onChange={(value) => set("email", value || null)}
          type="email"
          value={form.email ?? ""}
        />
        <Field
          label="Phone"
          onChange={(value) => set("phone", value || null)}
          value={form.phone ?? ""}
        />
        <Field
          label="Address line 1"
          onChange={(value) => set("line1", value || null)}
          value={form.line1 ?? ""}
        />
        <Field
          label="Address line 2"
          onChange={(value) => set("line2", value || null)}
          value={form.line2 ?? ""}
        />
        <Field
          label="City"
          onChange={(value) => set("city", value || null)}
          value={form.city ?? ""}
        />
        <Field
          label="State"
          onChange={(value) => set("state", value || null)}
          value={form.state ?? ""}
        />
        <Field
          label="Postal code"
          onChange={(value) => set("postalCode", value || null)}
          value={form.postalCode ?? ""}
        />
        <Field
          hint="Two-letter country code, e.g. IN."
          label="Country"
          maxLength={2}
          onChange={(value) => set("country", value.toUpperCase())}
          value={form.country}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="billing-gstin">GSTIN (optional)</Label>
        <Input
          id="billing-gstin"
          maxLength={15}
          onChange={(event) =>
            set("gstin", event.target.value.toUpperCase() || null)
          }
          placeholder="29AABCU9603R1ZM"
          value={form.gstin ?? ""}
        />
        {!gstinValid ? (
          <p className="text-xs text-app-danger">
            That is not a valid 15-character GSTIN.
          </p>
        ) : placeOfSupply ? (
          <p className="text-xs text-app-muted">
            Place of supply: {placeOfSupply} — this is what decides whether your
            invoice shows CGST + SGST or IGST.
          </p>
        ) : (
          <p className="text-xs text-app-muted">
            Add your GSTIN to claim input credit on your invoices.
          </p>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!form.name.trim() || !gstinValid || update.isPending}
          onClick={() => update.mutate(form)}
          variant="primary"
        >
          Save billing details
        </Button>
      </div>
    </Card>
  );
}

function Field({
  hint,
  label,
  maxLength,
  onChange,
  required,
  type,
  value
}: {
  hint?: string;
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  value: string;
}) {
  const id = `billing-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-app-danger"> *</span> : null}
      </Label>
      <Input
        id={id}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        type={type}
        value={value}
      />
      {hint ? <p className="text-xs text-app-muted">{hint}</p> : null}
    </div>
  );
}
