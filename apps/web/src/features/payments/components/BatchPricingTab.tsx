"use client";

import { useState } from "react";
import { Archive, Pencil, Plus, Repeat, Tag } from "lucide-react";
import {
  BILLING_INTERVAL_LABELS,
  billingIntervalSchema,
  formatMoney,
  isRecurringInterval,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_LABELS,
  toMajorUnits,
  toMinorUnits,
  type BillingInterval,
  type PaymentMethodKind,
  type PlanItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import {
  useArchiveBatchPlan,
  useBatchPricing,
  useCreateBatchPlan,
  useUpdateBatchPlan
} from "../hooks/usePaymentsApi";

type Props = { batchId: string };

/**
 * What a batch costs.
 *
 * A batch can carry several price options at once — a monthly subscription
 * beside a one-time fee — each with its own tax and its own allowed payment
 * methods. They are ordinary plans under the hood, so everything downstream
 * (checkout, invoices, entitlements, the admin catalogue) sees them as normal.
 */
export function BatchPricingTab({ batchId }: Props) {
  const { data, isLoading } = useBatchPricing(batchId);
  const archive = useArchiveBatchPlan(batchId);

  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  const plans = data?.plans ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-muted">
          Set what this batch costs. Add more than one option to offer, say, a
          monthly subscription alongside a one-time fee.
        </p>
        <Button
          onClick={() => setCreating(true)}
          size="sm"
          type="button"
          variant="primary"
        >
          <Plus className="size-4" strokeWidth={2.5} />
          Add price option
        </Button>
      </div>

      {plans.length === 0 ? (
        <EmptyState
          description="This batch is free until you add a price option. Students can be enrolled manually as before."
          title="No price set"
        />
      ) : (
        <Card className="divide-y divide-app-border p-0">
          {plans.map((plan) => (
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              key={plan.id}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-app-text">
                  {plan.name}
                  <Badge variant={plan.isActive ? "success" : "secondary"}>
                    {plan.isActive ? "On sale" : "Archived"}
                  </Badge>
                  <Badge variant={isRecurringInterval(plan.interval) ? "info" : "outline"}>
                    {isRecurringInterval(plan.interval) ? (
                      <Repeat aria-hidden className="mr-1 inline size-3" strokeWidth={2.5} />
                    ) : null}
                    {BILLING_INTERVAL_LABELS[plan.interval]}
                  </Badge>
                </p>
                <p className="mt-0.5 text-xs text-app-muted">
                  {plan.allowedMethods.length === 0
                    ? "All available payment methods"
                    : plan.allowedMethods
                        .map((method) => PAYMENT_METHOD_LABELS[method])
                        .join(", ")}
                  {plan.activeSubscriptions > 0
                    ? ` · ${plan.activeSubscriptions} active subscriber(s)`
                    : ""}
                </p>
              </div>

              <p className="text-right text-sm font-bold text-app-text">
                {formatMoney(plan.amount, plan.currency)}
                {plan.taxPercent > 0 ? (
                  <span className="block text-xs font-normal text-app-muted">
                    +{plan.taxPercent}% tax
                  </span>
                ) : null}
              </p>

              <div className="flex gap-1.5">
                <SimpleTooltip label="Edit this price option">
                  <Button
                    aria-label={`Edit ${plan.name}`}
                    className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                    onClick={() => setEditing(plan)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil className="size-3.5" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>

                {plan.isActive ? (
                  <SimpleTooltip label="Stop selling — past invoices are kept">
                    <Button
                      aria-label={`Archive ${plan.name}`}
                      className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                      disabled={archive.isPending}
                      onClick={() => archive.mutate(plan.id)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Archive className="size-3.5" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                ) : null}
              </div>
            </div>
          ))}
        </Card>
      )}

      {creating || editing ? (
        <PriceOptionForm
          batchId={batchId}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          plan={editing}
        />
      ) : null}
    </div>
  );
}

function PriceOptionForm({
  batchId,
  plan,
  onClose
}: {
  batchId: string;
  plan: PlanItem | null;
  onClose: () => void;
}) {
  const create = useCreateBatchPlan(batchId);
  const update = useUpdateBatchPlan(batchId);

  const currency = plan?.currency ?? "INR";

  const [form, setForm] = useState({
    name: plan?.name ?? "Monthly",
    description: plan?.description ?? "",
    // The form works in major units; toMinorUnits is the single conversion.
    amountMajor: plan ? String(toMajorUnits(plan.amount, currency)) : "",
    currency,
    interval: (plan?.interval ?? "MONTHLY") as BillingInterval,
    taxPercent: String(plan?.taxPercent ?? 0),
    accessDays: plan?.accessDays ? String(plan.accessDays) : "",
    allowedMethods: plan?.allowedMethods ?? ([] as PaymentMethodKind[]),
    features: plan?.features.join("\n") ?? ""
  });

  const pending = create.isPending || update.isPending;
  const amountMinor = toMinorUnits(Number(form.amountMajor) || 0, form.currency);

  const toggleMethod = (method: PaymentMethodKind) =>
    setForm((current) => ({
      ...current,
      allowedMethods: current.allowedMethods.includes(method)
        ? current.allowedMethods.filter((existing) => existing !== method)
        : [...current.allowedMethods, method]
    }));

  const handleSubmit = () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      amount: amountMinor,
      currency: form.currency.toUpperCase(),
      interval: billingIntervalSchema.parse(form.interval),
      taxPercent: Number(form.taxPercent) || 0,
      accessDays: form.accessDays ? Number(form.accessDays) : null,
      allowedMethods: form.allowedMethods,
      features: form.features
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      isActive: plan?.isActive ?? true,
      sortOrder: plan?.sortOrder ?? 0
    };

    if (plan) {
      update.mutate({ planId: plan.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  };

  return (
    <Card className="space-y-4 border-primary p-5">
      <h3 className="text-sm font-bold text-app-text">
        {plan ? `Edit "${plan.name}"` : "New price option"}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="price-name">Label</Label>
          <Input
            id="price-name"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Monthly"
            value={form.name}
          />
        </div>

        <div>
          <Label htmlFor="price-interval">Billing</Label>
          <Select
            id="price-interval"
            onChange={(event) =>
              setForm({
                ...form,
                interval: event.target.value as BillingInterval
              })
            }
            options={billingIntervalSchema.options.map((interval) => ({
              label:
                interval === "ONE_TIME"
                  ? "One-time payment"
                  : `${BILLING_INTERVAL_LABELS[interval]} subscription`,
              value: interval
            }))}
            value={form.interval}
          />
        </div>

        <div>
          <Label htmlFor="price-amount">Price ({form.currency})</Label>
          <Input
            id="price-amount"
            inputMode="decimal"
            min={0}
            onChange={(event) =>
              setForm({ ...form, amountMajor: event.target.value })
            }
            step="0.01"
            type="number"
            value={form.amountMajor}
          />
        </div>

        <div>
          <Label htmlFor="price-tax">Tax %</Label>
          <Input
            id="price-tax"
            max={50}
            min={0}
            onChange={(event) =>
              setForm({ ...form, taxPercent: event.target.value })
            }
            step="0.5"
            type="number"
            value={form.taxPercent}
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="price-access-days">Access days</Label>
          <Input
            id="price-access-days"
            min={1}
            onChange={(event) =>
              setForm({ ...form, accessDays: event.target.value })
            }
            placeholder={
              isRecurringInterval(form.interval)
                ? "Blank = one billing cycle"
                : "Blank = access never expires"
            }
            type="number"
            value={form.accessDays}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-app-text">
          <Tag aria-hidden className="size-4" strokeWidth={2.5} />
          Payment methods
        </legend>
        <p className="mb-2 text-xs text-app-muted">
          Leave all unticked to accept every method the gateways can serve.
          Ticking some restricts this option to those only.
          {isRecurringInterval(form.interval)
            ? " A subscription also needs a method that can hold a mandate — usually UPI or cards."
            : ""}
        </p>
        <div className="flex flex-wrap gap-3">
          {PAYMENT_METHOD_KINDS.filter((method) => method !== "OTHER").map(
            (method) => (
              <label
                className="flex items-center gap-2 text-sm text-app-text"
                key={method}
              >
                <Checkbox
                  checked={form.allowedMethods.includes(method)}
                  onCheckedChange={() => toggleMethod(method)}
                />
                {PAYMENT_METHOD_LABELS[method]}
              </label>
            )
          )}
        </div>
      </fieldset>

      <div>
        <Label htmlFor="price-description">Description</Label>
        <Textarea
          id="price-description"
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
          rows={2}
          value={form.description}
        />
      </div>

      <div>
        <Label htmlFor="price-features">What it includes (one per line)</Label>
        <Textarea
          id="price-features"
          onChange={(event) => setForm({ ...form, features: event.target.value })}
          rows={3}
          value={form.features}
        />
      </div>

      {amountMinor > 0 ? (
        <p className="rounded-app bg-app-soft px-3 py-2 text-sm text-app-text">
          Students will see{" "}
          <strong>{formatMoney(amountMinor, form.currency)}</strong>
          {Number(form.taxPercent) > 0
            ? ` plus ${form.taxPercent}% tax`
            : ""}
          {isRecurringInterval(form.interval)
            ? `, charged ${BILLING_INTERVAL_LABELS[form.interval].toLowerCase()}.`
            : ", once."}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!form.name.trim() || amountMinor <= 0}
          isLoading={pending}
          onClick={handleSubmit}
          type="button"
          variant="primary"
        >
          {plan ? "Save option" : "Add option"}
        </Button>
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
      </div>

      {plan ? (
        <p className="text-xs text-app-muted">
          Changing the price never re-prices anything already sold — existing
          orders and subscribers keep what they agreed to.
        </p>
      ) : null}
    </Card>
  );
}
