"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CalendarPlus, PencilLine, Percent, Plus, Power, PowerOff, Ticket, Trash2 } from "lucide-react";
import {
  formatReferralPoints,
  formatReferralVoucherValue,
  REFERRAL_VOUCHER_TYPE_LABELS,
  REFERRAL_VOUCHER_TYPES,
  referralVoucherProblem,
  toMajorUnits,
  type CreateReferralVoucherRequest,
  type ReferralVoucherItem
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { useAdminPlans } from "@/features/payments/hooks/usePaymentsApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { referralAdminApi } from "../../api/referralAdminApi";
import { useReferralAdminMutation, useReferralSettings, useReferralVouchers } from "../../hooks/useReferralAdmin";
import { parseMajorAmount, parseWhole } from "../../lib/referralFormat";

const TYPE_ICON = { FIXED_DISCOUNT: Ticket, FREE_DAYS: CalendarPlus, PERCENT_DISCOUNT: Percent } as const;

/** The rewards students buy with points: discounts (with a cap and a minimum fee) and free days. */
export function VouchersPanel() {
  const timeZone = useUserTimeZone();
  const { data: vouchers, isLoading } = useReferralVouchers();
  const currency = useReferralSettings().data?.currency ?? "INR";
  const [editing, setEditing] = useState<ReferralVoucherItem | "new" | null>(null);
  const [deleting, setDeleting] = useState<ReferralVoucherItem | null>(null);
  const remove = useReferralAdminMutation(referralAdminApi.deleteVoucher, { failure: "Could not delete the voucher", success: "Voucher removed" });
  const toggle = useReferralAdminMutation(
    (voucher: ReferralVoucherItem) => referralAdminApi.updateVoucher(voucher.id, { isActive: !voucher.isActive }),
    { failure: "Could not update the voucher", success: "Voucher updated" }
  );

  return (
    <SectionCard
      actions={
        <Button onClick={() => setEditing("new")}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New voucher
        </Button>
      }
      description="Rewards students buy with their points. A discount becomes a one-use code only that student can apply at checkout; free days extend their access to a plan."
      title="Vouchers"
    >
      {isLoading ? (
        <Skeleton className="h-40 rounded-app" />
      ) : vouchers?.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Voucher</TableHead>
              <TableHead>Gives</TableHead>
              <TableHead>Limits</TableHead>
              <TableHead>Redeemed</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead pin="end">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vouchers.map((voucher) => {
              const Icon = TYPE_ICON[voucher.type];
              return (
                <TableRow key={voucher.id}>
                  <TableCell>
                    <p className="flex items-center gap-2 font-bold text-app-text">
                      <Icon aria-hidden="true" className="size-4 shrink-0 text-accent-ink" strokeWidth={2.5} />
                      {voucher.name}
                      {voucher.isActive ? null : <Badge variant="secondary">Off</Badge>}
                    </p>
                    <p className="text-xs text-app-muted">{REFERRAL_VOUCHER_TYPE_LABELS[voucher.type]}</p>
                  </TableCell>
                  <TableCell className="max-w-64 text-sm">
                    {formatReferralVoucherValue(voucher, currency)}
                    {voucher.planNames.length ? <span className="block text-xs text-app-muted">{voucher.planNames.join(", ")}</span> : null}
                  </TableCell>
                  <TableCell className="text-xs text-app-muted">
                    <span className="block">{voucher.stock === null ? "Unlimited stock" : `${voucher.stock} in stock`}</span>
                    <span className="block">{voucher.perUserLimit === null ? "No per-student limit" : `${voucher.perUserLimit} per student`}</span>
                    {voucher.endsAt ? <span className="block">Until {formatFullDate(voucher.endsAt, timeZone)}</span> : null}
                    {voucher.requiresApproval ? <Badge variant="warning">Admin approves</Badge> : null}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {voucher.redeemedCount}
                    {voucher.pendingCount ? <span className="block text-xs text-warning-ink">{voucher.pendingCount} waiting</span> : null}
                  </TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{formatReferralPoints(voucher.pointsCost)}</TableCell>
                  <TableCell pin="end">
                    <RowActions
                      actions={[
                        { icon: PencilLine, label: "Edit voucher", onSelect: () => setEditing(voucher) },
                        {
                          disabled: toggle.isPending,
                          icon: voucher.isActive ? PowerOff : Power,
                          label: voucher.isActive ? "Switch off" : "Switch on",
                          onSelect: () => toggle.mutate(voucher)
                        },
                        { icon: Trash2, label: "Delete voucher", onSelect: () => setDeleting(voucher), tone: "danger" }
                      ]}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <EmptyState
          description="For example: 20% off a term fee (up to ₹500) for 1,000 points, or a free week for 300 points."
          icon={Ticket}
          title="No vouchers yet"
          variant="inline"
        />
      )}

      {editing ? <VoucherDialog currency={currency} onClose={() => setEditing(null)} voucher={editing === "new" ? null : editing} /> : null}

      <ConfirmationModal
        confirmLabel="Delete voucher"
        isConfirming={remove.isPending}
        isOpen={!!deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}
        title="Delete this voucher?"
      >
        {deleting?.redeemedCount || deleting?.pendingCount
          ? "Students have redeemed it, so it is switched off instead. What they already got is kept."
          : "No one has redeemed it yet."}
      </ConfirmationModal>
    </SectionCard>
  );
}

const optional = z.string().max(20);
const voucherFormSchema = z.object({
  amountOff: optional,
  codeValidDays: optional,
  description: z.string().max(1000),
  endsAt: z.string(),
  freeDays: optional,
  isActive: z.boolean(),
  maxDiscount: optional,
  minOrder: optional,
  name: z.string().trim().min(1, "Name is required.").max(120),
  percentOff: optional,
  perUserLimit: optional,
  planIds: z.array(z.string()),
  pointsCost: z.string().refine((value) => parseWhole(value) !== null, "Enter a whole number of points."),
  requiresApproval: z.boolean(),
  sortOrder: optional,
  startsAt: z.string(),
  stock: optional,
  type: z.enum(REFERRAL_VOUCHER_TYPES)
});
type VoucherForm = z.infer<typeof voucherFormSchema>;

const blankOr = (value: number | null) => (value === null ? "" : String(value));

function VoucherDialog({ currency, onClose, voucher }: { voucher: ReferralVoucherItem | null; currency: string; onClose: () => void }) {
  const { data: planData } = useAdminPlans();
  const plans = planData?.plans ?? [];
  const major = (minor: number | null) => (minor === null ? "" : String(toMajorUnits(minor, currency)));
  const form = useForm<VoucherForm>({
    defaultValues: {
      amountOff: major(voucher?.amountOffMinor ?? null),
      codeValidDays: blankOr(voucher?.codeValidDays ?? null),
      description: voucher?.description ?? "",
      endsAt: voucher?.endsAt ?? "",
      freeDays: blankOr(voucher?.freeDays ?? null),
      isActive: voucher?.isActive ?? true,
      maxDiscount: major(voucher?.maxDiscountMinor ?? null),
      minOrder: major(voucher?.minOrderMinor ?? null),
      name: voucher?.name ?? "",
      percentOff: blankOr(voucher?.percentOff ?? null),
      perUserLimit: voucher ? blankOr(voucher.perUserLimit) : "1",
      planIds: voucher?.planIds ?? [],
      pointsCost: voucher ? String(voucher.pointsCost) : "",
      requiresApproval: voucher?.requiresApproval ?? false,
      sortOrder: voucher ? String(voucher.sortOrder) : "0",
      startsAt: voucher?.startsAt ?? "",
      stock: blankOr(voucher?.stock ?? null),
      type: voucher?.type ?? "PERCENT_DISCOUNT"
    },
    resolver: zodResolver(voucherFormSchema)
  });
  const { errors } = form.formState;
  const type = form.watch("type");
  const planIds = form.watch("planIds");
  const [problem, setProblem] = useState<string | null>(null);

  const save = useReferralAdminMutation(
    (body: CreateReferralVoucherRequest) => (voucher ? referralAdminApi.updateVoucher(voucher.id, body) : referralAdminApi.createVoucher(body)),
    { failure: "Could not save the voucher", success: voucher ? "Voucher updated" : "Voucher created" }
  );

  const submit = (values: VoucherForm) => {
    const money = (input: string) => (input.trim() ? parseMajorAmount(input, currency) : null);
    const whole = (input: string) => (input.trim() ? parseWhole(input) : null);
    const body: CreateReferralVoucherRequest = {
      amountOffMinor: type === "FIXED_DISCOUNT" ? money(values.amountOff) : null,
      codeValidDays: type === "FREE_DAYS" ? null : whole(values.codeValidDays),
      description: values.description.trim() || null,
      endsAt: values.endsAt || null,
      freeDays: type === "FREE_DAYS" ? whole(values.freeDays) : null,
      isActive: values.isActive,
      maxDiscountMinor: type === "PERCENT_DISCOUNT" ? money(values.maxDiscount) : null,
      minOrderMinor: type === "FREE_DAYS" ? null : money(values.minOrder),
      name: values.name,
      percentOff: type === "PERCENT_DISCOUNT" ? whole(values.percentOff) : null,
      perUserLimit: whole(values.perUserLimit),
      planIds: values.planIds,
      pointsCost: parseWhole(values.pointsCost) ?? 0,
      requiresApproval: values.requiresApproval,
      sortOrder: Number(values.sortOrder) || 0,
      startsAt: values.startsAt || null,
      stock: whole(values.stock),
      type
    };
    const shape = referralVoucherProblem(body);
    if (shape) return setProblem(shape.message);
    if (body.percentOff !== null && body.percentOff !== undefined && body.percentOff > 100) return setProblem("A discount is at most 100%.");
    setProblem(null);
    save.mutate(body, { onSuccess: onClose });
  };

  const togglePlan = (id: string, checked: boolean) =>
    form.setValue("planIds", checked ? [...planIds, id] : planIds.filter((planId) => planId !== id), { shouldDirty: true });

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{voucher ? "Edit voucher" : "New voucher"}</DialogTitle>
          <DialogDescription>Changes apply to redemptions from now on; what students already got keeps its terms.</DialogDescription>
        </DialogHeader>
        <form className="grid max-h-[65dvh] gap-4 overflow-y-auto pr-1" id="voucher-form" onSubmit={form.handleSubmit(submit)}>
          <FormField error={errors.name?.message} id="voucher-name" label="Name" required>
            <Input id="voucher-name" placeholder="A free month" {...form.register("name")} />
          </FormField>
          <FormField hint="Students see this." id="voucher-description" label="Description">
            <Textarea id="voucher-description" rows={2} {...form.register("description")} />
          </FormField>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField id="voucher-type" label="Type">
              <Select
                id="voucher-type"
                options={REFERRAL_VOUCHER_TYPES.map((value) => ({ label: REFERRAL_VOUCHER_TYPE_LABELS[value], value }))}
                {...form.register("type")}
              />
            </FormField>
            <FormField error={errors.pointsCost?.message} id="voucher-cost" label="Cost (points)" required>
              <Input id="voucher-cost" inputMode="numeric" {...form.register("pointsCost")} />
            </FormField>
          </div>

          {type === "PERCENT_DISCOUNT" ? (
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <FormField id="voucher-percent" label="Percent off" required>
                <Input id="voucher-percent" inputMode="numeric" {...form.register("percentOff")} />
              </FormField>
              <FormField hint="Blank = no cap" id="voucher-max" label={`At most (${currency})`}>
                <Input id="voucher-max" inputMode="decimal" {...form.register("maxDiscount")} />
              </FormField>
              <FormField hint="Blank = any fee" id="voucher-min" label={`Minimum fee (${currency})`}>
                <Input id="voucher-min" inputMode="decimal" {...form.register("minOrder")} />
              </FormField>
            </div>
          ) : type === "FIXED_DISCOUNT" ? (
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <FormField id="voucher-amount" label={`Amount off (${currency})`} required>
                <Input id="voucher-amount" inputMode="decimal" {...form.register("amountOff")} />
              </FormField>
              <FormField hint="Blank = any fee" id="voucher-min" label={`Minimum fee (${currency})`}>
                <Input id="voucher-min" inputMode="decimal" {...form.register("minOrder")} />
              </FormField>
            </div>
          ) : (
            <FormField hint="7 = a week, 30 = a month" id="voucher-days" label="Free days" required>
              <Input className="w-32" id="voucher-days" inputMode="numeric" {...form.register("freeDays")} />
            </FormField>
          )}

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-semibold text-app-text">{type === "FREE_DAYS" ? "Extends access to" : "Works on"}</legend>
            <p className="text-xs text-app-muted">
              {type === "FREE_DAYS"
                ? "Leave all unticked for any plan the student holds. With exactly one plan, a student without it gets new access."
                : "Leave all unticked for every plan."}
            </p>
            {plans.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {plans.map((plan) => (
                  <label className="flex items-center gap-2 text-sm text-app-text" htmlFor={`voucher-plan-${plan.id}`} key={plan.id}>
                    <Checkbox
                      checked={planIds.includes(plan.id)}
                      id={`voucher-plan-${plan.id}`}
                      onCheckedChange={(checked) => togglePlan(plan.id, checked === true)}
                    />
                    {plan.name}
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-app-muted">No plans yet.</p>
            )}
          </fieldset>

          <div className="grid items-start gap-4 sm:grid-cols-3">
            <FormField hint="Blank = unlimited" id="voucher-stock" label="Stock">
              <Input id="voucher-stock" inputMode="numeric" {...form.register("stock")} />
            </FormField>
            <FormField hint="Blank = unlimited" id="voucher-per-user" label="Per student">
              <Input id="voucher-per-user" inputMode="numeric" {...form.register("perUserLimit")} />
            </FormField>
            {type === "FREE_DAYS" ? null : (
              <FormField hint="Blank = never expires" id="voucher-valid" label="Code valid (days)">
                <Input id="voucher-valid" inputMode="numeric" {...form.register("codeValidDays")} />
              </FormField>
            )}
          </div>
          <div className="grid items-start gap-4 sm:grid-cols-2">
            <FormField hint="Blank = straight away" id="voucher-starts" label="Available from">
              <DatePicker
                id="voucher-starts"
                onChange={(date) => form.setValue("startsAt", date ? date.toISOString() : "", { shouldDirty: true })}
                value={form.watch("startsAt") ? new Date(form.watch("startsAt")) : undefined}
                withTime
              />
            </FormField>
            <FormField hint="Blank = no end" id="voucher-ends" label="Available until">
              <DatePicker
                id="voucher-ends"
                onChange={(date) => form.setValue("endsAt", date ? date.toISOString() : "", { shouldDirty: true })}
                value={form.watch("endsAt") ? new Date(form.watch("endsAt")) : undefined}
                withTime
              />
            </FormField>
          </div>
          <FormField hint="Lower numbers show first." id="voucher-order" label="Order in the store">
            <Input className="w-28" id="voucher-order" inputMode="numeric" {...form.register("sortOrder")} />
          </FormField>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="voucher-approval">
            <span>
              Admin approves each redemption
              <span className="block text-xs text-app-muted">The student&rsquo;s points are held until you approve or reject.</span>
            </span>
            <Switch
              checked={form.watch("requiresApproval")}
              id="voucher-approval"
              onCheckedChange={(checked) => form.setValue("requiresApproval", checked, { shouldDirty: true })}
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-app-text" htmlFor="voucher-active">
            Voucher is in the store
            <Switch
              checked={form.watch("isActive")}
              id="voucher-active"
              onCheckedChange={(checked) => form.setValue("isActive", checked, { shouldDirty: true })}
            />
          </label>
          {problem ? <p className="text-sm text-app-danger-ink">{problem}</p> : null}
        </form>
        <DialogFooter>
          <Button onClick={onClose} variant="neutral">
            Cancel
          </Button>
          <Button form="voucher-form" isLoading={save.isPending} type="submit">
            {voucher ? "Save voucher" : "Create voucher"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
