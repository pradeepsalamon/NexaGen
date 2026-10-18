"use client";

import { useState } from "react";
import { Archive, Pencil, Plus } from "lucide-react";
import {
  BILLING_INTERVAL_LABELS,
  billingIntervalSchema,
  formatMoney,
  toMajorUnits,
  toMinorUnits,
  type BillingInterval,
  type PlanItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import {
  useAdminPlans,
  useArchivePlan,
  useCreatePlan,
  useUpdatePlan
} from "../hooks/usePaymentsApi";

/** The sellable catalogue. Archiving keeps every invoice that points at a plan. */
export function PlansPanel() {
  const { data, isLoading } = useAdminPlans();
  const archive = useArchivePlan();
  const [editing, setEditing] = useState<PlanItem | null>(null);
  const [creating, setCreating] = useState(false);

  if (isLoading) return <Skeleton className="h-72 w-full" />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} type="button" variant="primary">
          <Plus className="size-4" strokeWidth={2.5} />
          New plan
        </Button>
      </div>

      {!data || data.plans.length === 0 ? (
        <EmptyState
          description="Create a plan so students have something to buy."
          title="No plans yet"
        />
      ) : (
        <Card className="divide-y divide-app-border p-0">
          {data.plans.map((plan) => (
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"
              key={plan.id}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-app-text">
                  {plan.name}
                  <Badge variant={plan.isActive ? "success" : "secondary"}>
                    {plan.isActive ? "Active" : "Archived"}
                  </Badge>
                  <Badge variant="outline">
                    {BILLING_INTERVAL_LABELS[plan.interval]}
                  </Badge>
                </p>
                <p className="text-xs text-app-muted">
                  <span className="font-mono">{plan.code}</span>
                  {plan.batchName ? ` · enrols into ${plan.batchName}` : ""}
                  {plan.activeSubscriptions > 0
                    ? ` · ${plan.activeSubscriptions} active subscriber(s)`
                    : ""}
                </p>
              </div>

              <p className="text-sm font-bold text-app-text">
                {formatMoney(plan.amount, plan.currency)}
                {plan.taxPercent > 0 ? (
                  <span className="block text-xs font-normal text-app-muted">
                    +{plan.taxPercent}% tax
                  </span>
                ) : null}
              </p>

              <div className="flex gap-1.5">
                <SimpleTooltip label="Edit this plan">
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
                  <SimpleTooltip label="Archive — past invoices are kept">
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
        <PlanFormDialog
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

function PlanFormDialog({
  plan,
  onClose
}: {
  plan: PlanItem | null;
  onClose: () => void;
}) {
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const { data: batches } = useBatchesQuery();

  const currency = plan?.currency ?? "INR";

  const [form, setForm] = useState({
    code: plan?.code ?? "",
    name: plan?.name ?? "",
    description: plan?.description ?? "",
    // The form works in major units; toMinorUnits is the one conversion.
    amountMajor: plan ? String(toMajorUnits(plan.amount, currency)) : "",
    currency,
    interval: (plan?.interval ?? "ONE_TIME") as BillingInterval,
    taxPercent: String(plan?.taxPercent ?? 0),
    batchId: plan?.batchId ?? "",
    features: plan?.features.join("\n") ?? "",
    accessDays: plan?.accessDays ? String(plan.accessDays) : ""
  });

  const pending = create.isPending || update.isPending;

  const handleSubmit = () => {
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      amount: toMinorUnits(Number(form.amountMajor) || 0, form.currency),
      currency: form.currency.toUpperCase(),
      interval: billingIntervalSchema.parse(form.interval),
      taxPercent: Number(form.taxPercent) || 0,
      batchId: form.batchId || null,
      accessDays: form.accessDays ? Number(form.accessDays) : null,
      // A standalone plan accepts every method; per-method restriction is set
      // on a batch's price options, where it belongs.
      allowedMethods: [],
      features: form.features
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
      isActive: plan?.isActive ?? true,
      sortOrder: plan?.sortOrder ?? 0
    };

    if (plan) {
      update.mutate({ id: plan.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(
        { ...payload, code: form.code.trim() },
        { onSuccess: onClose }
      );
    }
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{plan ? `Edit ${plan.name}` : "New plan"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!plan ? (
            <div>
              <Label htmlFor="plan-code">Code</Label>
              <Input
                id="plan-code"
                onChange={(event) =>
                  setForm({ ...form, code: event.target.value })
                }
                placeholder="premium-monthly"
                value={form.code}
              />
              <p className="mt-1 text-xs text-app-muted">
                Permanent. Lowercase letters, digits, - and _.
              </p>
            </div>
          ) : null}

          <div>
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Premium Membership"
              value={form.name}
            />
          </div>

          <div>
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              onChange={(event) =>
                setForm({ ...form, description: event.target.value })
              }
              rows={2}
              value={form.description}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan-amount">Price ({form.currency})</Label>
              <Input
                id="plan-amount"
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
              <Label htmlFor="plan-currency">Currency</Label>
              <Input
                id="plan-currency"
                maxLength={3}
                onChange={(event) =>
                  setForm({ ...form, currency: event.target.value.toUpperCase() })
                }
                value={form.currency}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plan-interval">Billing</Label>
              <Select
                id="plan-interval"
                onChange={(event) =>
                  setForm({
                    ...form,
                    interval: event.target.value as BillingInterval
                  })
                }
                options={billingIntervalSchema.options.map((interval) => ({
                  label: BILLING_INTERVAL_LABELS[interval],
                  value: interval
                }))}
                value={form.interval}
              />
            </div>
            <div>
              <Label htmlFor="plan-tax">Tax %</Label>
              <Input
                id="plan-tax"
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
          </div>

          <div>
            <Label htmlFor="plan-batch">Enrols into batch</Label>
            <Select
              id="plan-batch"
              onChange={(event) =>
                setForm({ ...form, batchId: event.target.value })
              }
              options={(batches?.batches ?? []).map((batch) => ({
                label: batch.name,
                value: batch.id
              }))}
              placeholder="No batch"
              value={form.batchId}
            />
            <p className="mt-1 text-xs text-app-muted">
              A successful payment enrols the student here automatically.
            </p>
          </div>

          <div>
            <Label htmlFor="plan-access-days">Access days</Label>
            <Input
              id="plan-access-days"
              min={1}
              onChange={(event) =>
                setForm({ ...form, accessDays: event.target.value })
              }
              placeholder="Leave blank to use the billing interval"
              type="number"
              value={form.accessDays}
            />
          </div>

          <div>
            <Label htmlFor="plan-features">Features (one per line)</Label>
            <Textarea
              id="plan-features"
              onChange={(event) =>
                setForm({ ...form, features: event.target.value })
              }
              rows={4}
              value={form.features}
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={
              !form.name.trim() ||
              (!plan && !form.code.trim()) ||
              toMinorUnits(Number(form.amountMajor) || 0, form.currency) <= 0
            }
            isLoading={pending}
            onClick={handleSubmit}
            type="button"
            variant="primary"
          >
            {plan ? "Save plan" : "Create plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
