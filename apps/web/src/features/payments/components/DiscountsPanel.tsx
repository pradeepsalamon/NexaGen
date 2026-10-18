"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  describeDiscount,
  discountTypeSchema,
  discountValueIssue,
  formatMoney,
  PAYMENT_METHOD_KINDS,
  PAYMENT_METHOD_LABELS,
  toMajorUnits,
  toMinorUnits,
  type DiscountItem,
  type DiscountType,
  type PaymentMethodKind
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
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import {
  useAdminPlans,
  useCreateDiscount,
  useDeleteDiscount,
  useDiscounts,
  useUpdateDiscount
} from "../hooks/usePaymentsApi";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { Switch } from "@/components/ui/Switch";

/**
 * Discount codes — the one mechanism that changes what someone pays.
 *
 * A launch code, a UPI-only offer and a batch-specific deal are the same object
 * with a different scope, so an admin learns one screen and every price change
 * is audited in one place.
 */
export function DiscountsPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useDiscounts();
  const remove = useDeleteDiscount();

  const [editing, setEditing] = useState<DiscountItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  const discounts = data?.discounts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-muted">
          A code is only counted when a payment actually succeeds, so an
          abandoned checkout never uses one up.
        </p>
        <Button onClick={() => setCreating(true)} type="button" variant="primary">
          <Plus className="size-4" strokeWidth={2.5} />
          New code
        </Button>
      </div>

      {creating || editing ? (
        <DiscountForm
          discount={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      ) : null}

      {discounts.length === 0 ? (
        <EmptyState
          description="Create a code to run an offer on a plan, a batch, or a single payment method."
          title="No discount codes yet"
        />
      ) : (
        <Card className="divide-y divide-app-border p-0">
          {discounts.map((discount) => (
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              key={discount.id}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-app-text">
                  <span className="font-mono">{discount.code}</span>
                  <Badge variant={discount.isActive ? "success" : "secondary"}>
                    {discount.isActive ? "Active" : "Inactive"}
                  </Badge>
                  <span className="font-normal text-app-muted">
                    {discount.name}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-app-muted">
                  {describeDiscount(discount)}
                  {discount.methods.length > 0
                    ? ` · ${discount.methods.map((m) => PAYMENT_METHOD_LABELS[m]).join(", ")} only`
                    : ""}
                  {discount.batchNames.length > 0
                    ? ` · ${discount.batchNames.join(", ")}`
                    : ""}
                  {discount.planNames.length > 0
                    ? ` · ${discount.planNames.join(", ")}`
                    : ""}
                  {discount.minOrderAmount
                    ? ` · min ${formatMoney(discount.minOrderAmount, discount.currency ?? "INR")}`
                    : ""}
                </p>
                {discount.startsAt || discount.endsAt ? (
                  <p className="text-xs text-app-muted">
                    {discount.startsAt
                      ? `From ${formatFullDate(discount.startsAt, timeZone)}`
                      : ""}
                    {discount.endsAt
                      ? `${discount.startsAt ? " · " : ""}Until ${formatFullDate(discount.endsAt, timeZone)}`
                      : ""}
                  </p>
                ) : null}
              </div>

              <p className="text-right text-xs text-app-muted">
                <span className="block text-sm font-bold text-app-text">
                  {discount.redemptionCount}
                  {discount.maxRedemptions ? ` / ${discount.maxRedemptions}` : ""}
                </span>
                used
              </p>

              <div className="flex gap-1.5">
                <SimpleTooltip label="Edit this code">
                  <Button
                    aria-label={`Edit ${discount.code}`}
                    className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                    onClick={() => setEditing(discount)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Pencil className="size-3.5" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>

                <SimpleTooltip
                  label={
                    discount.redemptionCount > 0
                      ? "Deactivate — used codes are kept for the record"
                      : "Delete this code"
                  }
                >
                  <Button
                    aria-label={`Remove ${discount.code}`}
                    className="size-8 rounded-full border border-app-danger bg-app-danger p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-danger)_75%,white)] hover:text-white"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(discount.id)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" strokeWidth={2.5} />
                  </Button>
                </SimpleTooltip>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

function DiscountForm({
  discount,
  onClose
}: {
  discount: DiscountItem | null;
  onClose: () => void;
}) {
  const create = useCreateDiscount();
  const update = useUpdateDiscount();
  const { data: batches } = useBatchesQuery();
  const { data: plans } = useAdminPlans();

  const currency = discount?.currency ?? "INR";

  const [form, setForm] = useState({
    code: discount?.code ?? "",
    name: discount?.name ?? "",
    description: discount?.description ?? "",
    type: (discount?.type ?? "PERCENTAGE") as DiscountType,
    // A percentage is a whole number; a fixed amount is entered in major units.
    value:
      discount == null
        ? "10"
        : discount.type === "PERCENTAGE"
          ? String(discount.value)
          : String(toMajorUnits(discount.value, currency)),
    currency,
    maxDiscountAmount: discount?.maxDiscountAmount
      ? String(toMajorUnits(discount.maxDiscountAmount, currency))
      : "",
    minOrderAmount: discount?.minOrderAmount
      ? String(toMajorUnits(discount.minOrderAmount, currency))
      : "",
    startsAt: discount?.startsAt?.slice(0, 10) ?? "",
    endsAt: discount?.endsAt?.slice(0, 10) ?? "",
    maxRedemptions: discount?.maxRedemptions ? String(discount.maxRedemptions) : "",
    maxPerUser: String(discount?.maxPerUser ?? 1),
    planIds: discount?.planIds ?? ([] as string[]),
    batchIds: discount?.batchIds ?? ([] as string[]),
    methods: discount?.methods ?? ([] as PaymentMethodKind[]),
    isActive: discount?.isActive ?? true
  });

  const pending = create.isPending || update.isPending;

  // A percentage stays a whole number; a fixed amount converts to minor units.
  const valueForApi =
    form.type === "PERCENTAGE"
      ? Math.round(Number(form.value) || 0)
      : toMinorUnits(Number(form.value) || 0, form.currency);

  const issue = discountValueIssue({
    type: form.type,
    value: valueForApi,
    currency: form.type === "FIXED" ? form.currency : null
  });

  const toggle = <T extends string>(list: T[], value: T): T[] =>
    list.includes(value)
      ? list.filter((existing) => existing !== value)
      : [...list, value];

  const handleSubmit = () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      type: form.type,
      value: valueForApi,
      currency: form.type === "FIXED" ? form.currency.toUpperCase() : null,
      maxDiscountAmount: form.maxDiscountAmount
        ? toMinorUnits(Number(form.maxDiscountAmount), form.currency)
        : null,
      minOrderAmount: form.minOrderAmount
        ? toMinorUnits(Number(form.minOrderAmount), form.currency)
        : null,
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
      maxPerUser: Number(form.maxPerUser) || 1,
      planIds: form.planIds,
      batchIds: form.batchIds,
      methods: form.methods,
      isActive: form.isActive
    };

    if (discount) {
      update.mutate({ id: discount.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(
        { ...payload, code: form.code.trim().toUpperCase() },
        { onSuccess: onClose }
      );
    }
  };

  return (
    <Card className="space-y-4 border-primary p-5">
      <h3 className="text-sm font-bold text-app-text">
        {discount ? `Edit ${discount.code}` : "New discount code"}
      </h3>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!discount ? (
          <div>
            <Label htmlFor="discount-code">Code</Label>
            <Input
              className="font-mono uppercase"
              id="discount-code"
              onChange={(event) =>
                setForm({ ...form, code: event.target.value.toUpperCase() })
              }
              placeholder="DIWALI25"
              value={form.code}
            />
          </div>
        ) : null}

        <div>
          <Label htmlFor="discount-name">Internal name</Label>
          <Input
            id="discount-name"
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Diwali 2026"
            value={form.name}
          />
        </div>

        <div>
          <Label htmlFor="discount-type">Type</Label>
          <Select
            id="discount-type"
            onChange={(event) =>
              setForm({ ...form, type: event.target.value as DiscountType })
            }
            options={discountTypeSchema.options.map((type) => ({
              label: type === "PERCENTAGE" ? "Percentage off" : "Fixed amount off",
              value: type
            }))}
            value={form.type}
          />
        </div>

        <div>
          <Label htmlFor="discount-value">
            {form.type === "PERCENTAGE" ? "Percent off" : `Amount off (${form.currency})`}
          </Label>
          <Input
            hasError={Boolean(issue)}
            id="discount-value"
            inputMode="decimal"
            min={0}
            onChange={(event) => setForm({ ...form, value: event.target.value })}
            step={form.type === "PERCENTAGE" ? "1" : "0.01"}
            type="number"
            value={form.value}
          />
          {issue ? (
            <p className="mt-1 text-xs text-app-danger-ink">{issue}</p>
          ) : null}
        </div>

        {form.type === "PERCENTAGE" ? (
          <div>
            <Label htmlFor="discount-cap">Cap the discount at ({form.currency})</Label>
            <Input
              id="discount-cap"
              inputMode="decimal"
              min={0}
              onChange={(event) =>
                setForm({ ...form, maxDiscountAmount: event.target.value })
              }
              placeholder="Optional"
              step="0.01"
              type="number"
              value={form.maxDiscountAmount}
            />
          </div>
        ) : (
          <div>
            <Label htmlFor="discount-currency">Currency</Label>
            <Input
              id="discount-currency"
              maxLength={3}
              onChange={(event) =>
                setForm({ ...form, currency: event.target.value.toUpperCase() })
              }
              value={form.currency}
            />
          </div>
        )}

        <div>
          <Label htmlFor="discount-min">Minimum order ({form.currency})</Label>
          <Input
            id="discount-min"
            inputMode="decimal"
            min={0}
            onChange={(event) =>
              setForm({ ...form, minOrderAmount: event.target.value })
            }
            placeholder="Optional"
            step="0.01"
            type="number"
            value={form.minOrderAmount}
          />
        </div>

        <div>
          <Label htmlFor="discount-starts">Valid from</Label>
          <DateStringPicker
            id="discount-starts"
            onChange={(value) => setForm({ ...form, startsAt: value })}
            
            value={form.startsAt}
          />
        </div>

        <div>
          <Label htmlFor="discount-ends">Valid until</Label>
          <DateStringPicker
            id="discount-ends"
            onChange={(value) => setForm({ ...form, endsAt: value })}
            
            value={form.endsAt}
          />
        </div>

        <div>
          <Label htmlFor="discount-max">Total uses</Label>
          <Input
            id="discount-max"
            min={1}
            onChange={(event) =>
              setForm({ ...form, maxRedemptions: event.target.value })
            }
            placeholder="Unlimited"
            type="number"
            value={form.maxRedemptions}
          />
        </div>

        <div>
          <Label htmlFor="discount-per-user">Uses per account</Label>
          <Input
            id="discount-per-user"
            min={1}
            onChange={(event) =>
              setForm({ ...form, maxPerUser: event.target.value })
            }
            type="number"
            value={form.maxPerUser}
          />
        </div>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-app-text">
          Payment methods
        </legend>
        <p className="mb-2 text-xs text-app-muted">
          Leave unticked to apply to every method. Ticking some is how a
          UPI-only offer is made — the code then only prices once the buyer has
          chosen that method.
        </p>
        <div className="flex flex-wrap gap-3">
          {PAYMENT_METHOD_KINDS.filter((method) => method !== "OTHER").map(
            (method) => (
              <label
                className="flex items-center gap-2 text-sm text-app-text"
                key={method}
              >
                <Checkbox
                  checked={form.methods.includes(method)}
                  onCheckedChange={() =>
                    setForm({ ...form, methods: toggle(form.methods, method) })
                  }
                />
                {PAYMENT_METHOD_LABELS[method]}
              </label>
            )
          )}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-app-text">
            Batches
          </legend>
          <p className="mb-2 text-xs text-app-muted">
            Unticked = every batch.
          </p>
          <div className="max-h-36 space-y-1.5 overflow-y-auto">
            {(batches?.batches ?? []).map((batch) => (
              <label
                className="flex items-center gap-2 text-sm text-app-text"
                key={batch.id}
              >
                <Checkbox
                  checked={form.batchIds.includes(batch.id)}
                  onCheckedChange={() =>
                    setForm({
                      ...form,
                      batchIds: toggle(form.batchIds, batch.id)
                    })
                  }
                />
                {batch.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-semibold text-app-text">
            Plans
          </legend>
          <p className="mb-2 text-xs text-app-muted">Unticked = every plan.</p>
          <div className="max-h-36 space-y-1.5 overflow-y-auto">
            {(plans?.plans ?? []).map((plan) => (
              <label
                className="flex items-center gap-2 text-sm text-app-text"
                key={plan.id}
              >
                <Checkbox
                  checked={form.planIds.includes(plan.id)}
                  onCheckedChange={() =>
                    setForm({ ...form, planIds: toggle(form.planIds, plan.id) })
                  }
                />
                {plan.name}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div>
        <Label htmlFor="discount-description">Description</Label>
        <Textarea
          id="discount-description"
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
          rows={2}
          value={form.description}
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-app-text">
        <Switch
          checked={form.isActive}
          onCheckedChange={(checked) =>
            setForm({ ...form, isActive: checked === true })
          }
        />
        Active
      </label>

      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            Boolean(issue) ||
            !form.name.trim() ||
            (!discount && !form.code.trim()) ||
            valueForApi <= 0
          }
          isLoading={pending}
          onClick={handleSubmit}
          type="button"
          variant="primary"
        >
          {discount ? "Save code" : "Create code"}
        </Button>
        <Button onClick={onClose} type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </Card>
  );
}
