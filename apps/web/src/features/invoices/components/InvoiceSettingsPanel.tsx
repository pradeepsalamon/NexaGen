"use client";

import { useEffect, useState } from "react";
import {
  invoiceSettingsSchema,
  isValidGstin,
  stateNameFromCode,
  stateCodeFromGstin,
  type InvoiceSettings
} from "@nexa-chess/types";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import {
  useInvoiceSettings,
  useUpdateInvoiceSettings
} from "../hooks/useInvoicesApi";

/**
 * Admin → Settings → Billing & Invoicing (§4).
 *
 * These details are never hard-coded into the PDF template. Each invoice
 * snapshots them at issue time, so editing here changes what future invoices
 * say and leaves every already-issued receipt exactly as it was.
 */
export function InvoiceSettingsPanel() {
  const { data, isLoading } = useInvoiceSettings();
  const update = useUpdateInvoiceSettings();

  const [form, setForm] = useState<InvoiceSettings | null>(null);

  useEffect(() => {
    if (data) setForm(data.settings);
  }, [data]);

  if (isLoading || !form) return <Skeleton className="h-96 w-full" />;

  const set = <K extends keyof InvoiceSettings>(
    key: K,
    value: InvoiceSettings[K]
  ) => setForm((current) => (current ? { ...current, [key]: value } : current));

  const gstinValid =
    !form.gstin || form.gstin.trim() === "" || isValidGstin(form.gstin);
  const parsed = invoiceSettingsSchema.safeParse(form);

  const sellerState = stateNameFromCode(stateCodeFromGstin(form.gstin));

  return (
    <div className="space-y-4">
      {!data?.configured ? (
        <Card className="flex items-start gap-2 border-primary/40 bg-primary/[0.06] p-4">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={2.5} />
          <p className="text-sm text-app-text">
            These are placeholder values taken from the server environment. Save
            them once and invoices will carry your registered details.
          </p>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <SectionTitle
          subtitle="Printed as the seller on every invoice and credit note."
          title="Business identity"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Legal business name"
            onChange={(value) => set("legalName", value)}
            required
            value={form.legalName}
          />
          <Field
            hint="The short name shown as the masthead, if different."
            label="Trading name"
            onChange={(value) => set("tradeName", value || null)}
            value={form.tradeName ?? ""}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Address line 1"
            onChange={(value) => set("addressLine1", value || null)}
            value={form.addressLine1 ?? ""}
          />
          <Field
            label="Address line 2"
            onChange={(value) => set("addressLine2", value || null)}
            value={form.addressLine2 ?? ""}
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

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Billing email"
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
            label="Website"
            onChange={(value) => set("website", value || null)}
            value={form.website ?? ""}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <SectionTitle
          subtitle="Your GSTIN decides how every sale is taxed — CGST + SGST within your state, IGST outside it."
          title="Tax registration"
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="settings-gstin">GSTIN</Label>
            <Input
              id="settings-gstin"
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
            ) : sellerState ? (
              <p className="text-xs text-app-muted">
                Place of supply: {sellerState}
              </p>
            ) : (
              <p className="text-xs text-app-muted">
                Leave blank if you are not GST-registered — no GST will be
                charged.
              </p>
            )}
          </div>

          <Field
            label="PAN"
            maxLength={10}
            onChange={(value) => set("pan", value.toUpperCase() || null)}
            placeholder="AABCU9603R"
            value={form.pan ?? ""}
          />

          <Field
            hint="How the tax is named on the invoice."
            label="Tax label"
            onChange={(value) => set("taxLabel", value)}
            value={form.taxLabel}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="settings-default-tax">Default tax percent</Label>
            <Input
              id="settings-default-tax"
              max={100}
              min={0}
              onChange={(event) =>
                set("defaultTaxPercent", Number(event.target.value))
              }
              step="0.01"
              type="number"
              value={form.defaultTaxPercent}
            />
            <p className="text-xs text-app-muted">
              Used when a plan does not set its own rate.
            </p>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <SectionTitle
          subtitle="Changing a prefix affects only documents issued afterwards — numbers already allocated are never reused."
          title="Numbering"
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            hint={`Produces ${form.invoicePrefix}-${new Date().getUTCFullYear()}-000001`}
            label="Invoice prefix"
            onChange={(value) => set("invoicePrefix", value)}
            value={form.invoicePrefix}
          />
          <Field
            hint={`Produces ${form.creditNotePrefix}-${new Date().getUTCFullYear()}-000001`}
            label="Credit note prefix"
            onChange={(value) => set("creditNotePrefix", value)}
            value={form.creditNotePrefix}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <SectionTitle
          subtitle="Printed at the foot of every invoice."
          title="Footer and terms"
        />

        <div className="space-y-1.5">
          <Label htmlFor="settings-footer">Footer text</Label>
          <Input
            id="settings-footer"
            onChange={(event) => set("footerText", event.target.value || null)}
            placeholder="This is a computer-generated invoice…"
            value={form.footerText ?? ""}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="settings-terms">Terms &amp; conditions</Label>
          <Textarea
            id="settings-terms"
            onChange={(event) => set("termsText", event.target.value || null)}
            rows={4}
            value={form.termsText ?? ""}
          />
        </div>

        <Field
          label="Support email"
          onChange={(value) => set("supportEmail", value || null)}
          type="email"
          value={form.supportEmail ?? ""}
        />
      </Card>

      <Card className="space-y-4">
        <SectionTitle
          subtitle="Sent only after a payment is verified, and never twice for the same invoice."
          title="Invoice email"
        />

        <div className="flex items-center gap-2">
          <Checkbox
            checked={form.emailOnIssue}
            id="settings-email-on-issue"
            onCheckedChange={(checked) => set("emailOnIssue", checked === true)}
          />
          <Label htmlFor="settings-email-on-issue">
            Email the invoice automatically when a payment succeeds
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            checked={form.attachPdfToEmail}
            disabled={!form.emailOnIssue}
            id="settings-attach-pdf"
            onCheckedChange={(checked) =>
              set("attachPdfToEmail", checked === true)
            }
          />
          <Label htmlFor="settings-attach-pdf">
            Attach the PDF (otherwise a secure link that expires in 7 days)
          </Label>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          disabled={update.isPending}
          onClick={() => data && setForm(data.settings)}
          variant="ghost"
        >
          Reset
        </Button>
        <Button
          disabled={!parsed.success || !gstinValid || update.isPending}
          onClick={() => parsed.success && update.mutate(parsed.data)}
          variant="primary"
        >
          Save billing details
        </Button>
      </div>
    </div>
  );
}

function SectionTitle({
  subtitle,
  title
}: {
  subtitle: string;
  title: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-bold text-app-text">{title}</h3>
      <p className="text-xs text-app-muted">{subtitle}</p>
    </div>
  );
}

function Field({
  hint,
  label,
  maxLength,
  onChange,
  placeholder,
  required,
  type,
  value
}: {
  hint?: string;
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  value: string;
}) {
  const id = `settings-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;

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
        placeholder={placeholder}
        type={type}
        value={value}
      />
      {hint ? <p className="text-xs text-app-muted">{hint}</p> : null}
    </div>
  );
}
