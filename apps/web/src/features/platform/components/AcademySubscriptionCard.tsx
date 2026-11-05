"use client";

import { useState } from "react";
import {
  formatMoney,
  PLAN_FEATURE_KEYS,
  PLAN_FEATURES,
  PLAN_LIMIT_KEYS,
  PLAN_LIMITS,
  SUBSCRIPTION_TRANSITIONS,
  toMinorUnits,
  type PlanFeatureKey,
  type PlatformTenantSubscriptionResponse,
  type TenantSubscriptionStatusType
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatFullDate } from "@/lib/datetime";
import { enumLabel } from "@/lib/utils";
import {
  useChangePlatformTenantPlan,
  usePlatformContentPacks,
  usePlatformTenantSubscription,
  useRecordPlatformPayment,
  useSetPlatformTenantDeal,
  useTransitionPlatformTenant
} from "../hooks/usePlatformApi";
import { ReasonDialog } from "./ReasonDialog";
import { SubscriptionStatusBadge } from "./statusBadges";

type Data = PlatformTenantSubscriptionResponse;
type DialogKind = "deal" | "payment" | "plan" | "status" | null;

/** End of the picked calendar day, in UTC: a paid-up period runs through that whole date. */
const endOfDayIso = (date: Date) =>
  new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59)).toISOString();

function ChangePlanDialog({ data, onClose, tenantId }: { data: Data; onClose: () => void; tenantId: string }) {
  const change = useChangePlatformTenantPlan(tenantId);
  const [planCode, setPlanCode] = useState("");
  const [when, setWhen] = useState<"now" | "periodEnd">("now");
  const [note, setNote] = useState("");
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change plan</DialogTitle>
          <DialogDescription>
            Now: the new plan&apos;s features and limits apply at once. At period end: it switches when the paid
            period ends. Nothing is ever deleted on a downgrade.
          </DialogDescription>
        </DialogHeader>
        <FormField id="change-plan" label="New plan" required>
          <Select
            id="change-plan"
            onChange={(event) => setPlanCode(event.target.value)}
            options={data.plans
              .filter((plan) => plan.isActive && plan.code !== data.plan?.code)
              .map((plan) => ({ label: `${plan.name} (v${plan.version})`, value: plan.code }))}
            placeholder="Choose a plan"
            value={planCode}
          />
        </FormField>
        <FormField id="change-when" label="When">
          <Select
            id="change-when"
            onChange={(event) => setWhen(event.target.value as "now" | "periodEnd")}
            options={[
              { label: "Now", value: "now" },
              { disabled: !data.subscription?.currentPeriodEnd, label: "When the current period ends", value: "periodEnd" }
            ]}
            value={when}
          />
        </FormField>
        <FormField id="change-note" label="Note">
          <Textarea id="change-note" maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!planCode}
            isLoading={change.isPending}
            onClick={() => {
              change.mutateAsync({ note: note.trim() || undefined, planCode, when }).then(onClose, () => undefined);
            }}
            type="button"
          >
            Change plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusDialog({ data, onClose, tenantId }: { data: Data; onClose: () => void; tenantId: string }) {
  const transition = useTransitionPlatformTenant(tenantId);
  const current = data.subscription?.status;
  const options = current ? SUBSCRIPTION_TRANSITIONS[current] : [];
  const [status, setStatus] = useState<TenantSubscriptionStatusType | "">(options[0] ?? "");
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>(undefined);
  return (
    <ReasonDialog
      confirmLabel="Change status"
      description={`Only the allowed moves from ${current ? enumLabel(current) : "—"} are listed. Payments usually change the status for you.`}
      isPending={transition.isPending}
      label="Note"
      onClose={onClose}
      onConfirm={(note) =>
        status
          ? transition.mutateAsync({
              currentPeriodEnd: periodEnd ? endOfDayIso(periodEnd) : undefined,
              note,
              status
            })
          : Promise.reject(new Error("No status"))
      }
      title="Change subscription status"
    >
      <FormField id="status-to" label="New status" required>
        <Select
          id="status-to"
          onChange={(event) => setStatus(event.target.value as TenantSubscriptionStatusType)}
          options={options.map((value) => ({ label: enumLabel(value), value }))}
          value={status}
        />
      </FormField>
      {status === "ACTIVE" ? (
        <FormField hint="Leave empty to keep the current date." id="status-period-end" label="Paid until">
          <DatePicker id="status-period-end" onChange={setPeriodEnd} value={periodEnd} />
        </FormField>
      ) : null}
    </ReasonDialog>
  );
}

function PaymentDialog({ data, onClose, tenantId }: { data: Data; onClose: () => void; tenantId: string }) {
  const record = useRecordPlatformPayment(tenantId);
  const currency = data.plans.find((plan) => plan.code === data.plan?.code)?.currency ?? "INR";
  const [amount, setAmount] = useState("");
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>(undefined);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const amountOk = /^\d+(\.\d{1,2})?$/.test(amount.trim()) && Number(amount) > 0;
  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            A bank transfer or cheque received outside the gateway. The subscription becomes active until the date you
            pick.
          </DialogDescription>
        </DialogHeader>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField id="payment-amount" label={`Amount (${currency})`} required>
            <Input id="payment-amount" inputMode="decimal" onChange={(event) => setAmount(event.target.value)} value={amount} />
          </FormField>
          <FormField id="payment-period-end" label="Paid until" required>
            <DatePicker id="payment-period-end" onChange={setPeriodEnd} value={periodEnd} />
          </FormField>
        </div>
        <FormField hint="UTR, cheque number…" id="payment-reference" label="Reference">
          <Input id="payment-reference" maxLength={120} onChange={(event) => setReference(event.target.value)} value={reference} />
        </FormField>
        <FormField id="payment-note" label="Note" required>
          <Textarea id="payment-note" maxLength={500} onChange={(event) => setNote(event.target.value)} rows={2} value={note} />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!amountOk || !periodEnd || note.trim().length < 3}
            isLoading={record.isPending}
            onClick={() => {
              if (!periodEnd) return;
              record
                .mutateAsync({
                  amountMinor: toMinorUnits(Number(amount), currency),
                  currentPeriodEnd: endOfDayIso(periodEnd),
                  note: note.trim(),
                  reference: reference.trim() || undefined
                })
                .then(onClose, () => undefined);
            }}
            type="button"
          >
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DealDialog({ data, onClose, tenantId }: { data: Data; onClose: () => void; tenantId: string }) {
  const save = useSetPlatformTenantDeal(tenantId);
  const packs = usePlatformContentPacks().data?.packs ?? [];
  const plan = data.plans.find((item) => item.code === data.plan?.code);
  const currency = plan?.currency ?? "INR";
  const overrides = data.subscription?.overrides ?? { addFeatures: [], limits: {}, removeFeatures: [] };
  const factor = toMinorUnits(1, currency) || 1;
  const [price, setPrice] = useState(
    data.deal?.customPriceMinor === null || data.deal?.customPriceMinor === undefined
      ? ""
      : String(data.deal.customPriceMinor / factor)
  );
  const [note, setNote] = useState(data.deal?.note ?? "");
  const [addFeatures, setAddFeatures] = useState<PlanFeatureKey[]>(overrides.addFeatures ?? []);
  const [limits, setLimits] = useState<Record<string, string>>(
    Object.fromEntries(
      PLAN_LIMIT_KEYS.map((key) => {
        const value = overrides.limits?.[key];
        return [key, value === undefined ? "" : value === null ? "unlimited" : String(value)];
      })
    )
  );
  const [addPacks, setAddPacks] = useState<string[]>(overrides.addContentPacks ?? []);
  const missing = PLAN_FEATURE_KEYS.filter((key) => !plan?.features.includes(key));
  const limitsOk = Object.values(limits).every((value) => value === "" || value === "unlimited" || /^\d+$/.test(value));
  const priceOk = price.trim() === "" || /^\d+(\.\d{1,2})?$/.test(price.trim());

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Deal for {data.tenant.name}</DialogTitle>
          <DialogDescription>
            What this academy gets beyond its plan. Never shown to the academy except as the features and limits it
            ends up with.
          </DialogDescription>
        </DialogHeader>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField hint="Blank = the plan's price." id="deal-price" label={`Custom price per month (${currency})`}>
            <Input id="deal-price" inputMode="decimal" onChange={(event) => setPrice(event.target.value)} value={price} />
          </FormField>
        </div>
        <fieldset className="grid items-start gap-4 sm:grid-cols-4">
          <legend className="mb-2 text-sm font-semibold text-app-text">Limits (blank = plan, or “unlimited”)</legend>
          {PLAN_LIMIT_KEYS.map((key) => (
            <FormField id={`deal-limit-${key}`} key={key} label={PLAN_LIMITS[key].label}>
              <Input
                id={`deal-limit-${key}`}
                onChange={(event) => setLimits((current) => ({ ...current, [key]: event.target.value.trim().toLowerCase() }))}
                placeholder={plan ? (plan.limits[key] === null ? "∞" : String(plan.limits[key])) : ""}
                value={limits[key]}
              />
            </FormField>
          ))}
        </fieldset>
        {missing.length > 0 ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold text-app-text">Extra features</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {missing.map((key) => (
                <Checkbox
                  checked={addFeatures.includes(key)}
                  id={`deal-feature-${key}`}
                  key={key}
                  label={PLAN_FEATURES[key].label}
                  onCheckedChange={(checked) =>
                    setAddFeatures((current) => (checked === true ? [...current, key] : current.filter((value) => value !== key)))
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}
        {packs.length > 0 ? (
          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-semibold text-app-text">Extra content packs</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {packs
                .filter((pack) => !plan?.contentPackIds.includes(pack.id))
                .map((pack) => (
                  <Checkbox
                    checked={addPacks.includes(pack.id)}
                    id={`deal-pack-${pack.id}`}
                    key={pack.id}
                    label={pack.name}
                    onCheckedChange={(checked) =>
                      setAddPacks((current) => (checked === true ? [...current, pack.id] : current.filter((id) => id !== pack.id)))
                    }
                  />
                ))}
            </div>
          </fieldset>
        ) : null}
        <FormField id="deal-note" label="Note">
          <Textarea id="deal-note" maxLength={1000} onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
        </FormField>
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="neutral">
            Cancel
          </Button>
          <Button
            disabled={!limitsOk || !priceOk}
            isLoading={save.isPending}
            onClick={() => {
              const limitOverrides = Object.fromEntries(
                Object.entries(limits)
                  .filter(([, value]) => value !== "")
                  .map(([key, value]) => [key, value === "unlimited" ? null : Number(value)])
              );
              save
                .mutateAsync({
                  customPriceMinor: price.trim() === "" ? null : toMinorUnits(Number(price), currency),
                  lapse: null,
                  note: note.trim() || null,
                  overrides: {
                    addContentPacks: addPacks,
                    addFeatures,
                    limits: limitOverrides,
                    removeContentPacks: overrides.removeContentPacks,
                    removeFeatures: overrides.removeFeatures ?? []
                  }
                })
                .then(onClose, () => undefined);
            }}
            type="button"
          >
            Save deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Plan, status, payments and history for one academy, with the console's subscription actions. */
export function AcademySubscriptionCard({ tenantId }: { tenantId: string }) {
  const timeZone = useUserTimeZone();
  const query = usePlatformTenantSubscription(tenantId);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const data = query.data;

  if (query.isError) return <WidgetError message="Could not load the subscription." onRetry={() => void query.refetch()} />;
  if (!data) return <Skeleton className="h-64 w-full" />;

  const sub = data.subscription;
  const facts = [
    sub?.trialEndsAt && sub.status === "TRIALING" ? ["Trial ends", formatFullDate(sub.trialEndsAt, timeZone)] : null,
    sub?.currentPeriodEnd ? ["Paid until", formatFullDate(sub.currentPeriodEnd, timeZone)] : null,
    sub?.graceEndsAt && sub.status === "GRACE" ? ["Grace ends", formatFullDate(sub.graceEndsAt, timeZone)] : null,
    data.deal?.pendingPlanCode ? ["Switches at period end to", data.deal.pendingPlanCode] : null,
    data.deal?.customPriceMinor !== null && data.deal?.customPriceMinor !== undefined
      ? ["Custom price", formatMoney(data.deal.customPriceMinor, data.plans.find((plan) => plan.code === data.plan?.code)?.currency ?? "INR")]
      : null,
    data.deal ? ["Lapse", `${data.deal.lapse.pastDueDays} days past due, then ${data.deal.lapse.graceDays} days grace`] : null
  ].filter((fact): fact is [string, string] => fact !== null);

  return (
    <SectionCard
      actions={
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialog("payment")} size="sm" type="button" variant="neutral">
            Record payment
          </Button>
          <Button onClick={() => setDialog("plan")} size="sm" type="button" variant="neutral">
            Change plan
          </Button>
          <Button disabled={!sub} onClick={() => setDialog("status")} size="sm" type="button" variant="neutral">
            Change status
          </Button>
          <Button disabled={!sub} onClick={() => setDialog("deal")} size="sm" type="button" variant="neutral">
            Edit deal
          </Button>
        </div>
      }
      title="Subscription"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold text-app-text">{data.plan?.name ?? "No plan"}</span>
        {data.deal?.planVersion ? <Badge variant="outline">v{data.deal.planVersion}</Badge> : null}
        {data.deal?.planVersion && data.deal.currentPlanVersion && data.deal.planVersion < data.deal.currentPlanVersion ? (
          <Badge variant="info">v{data.deal.currentPlanVersion} available</Badge>
        ) : null}
        <SubscriptionStatusBadge accessMode={data.accessMode} status={data.status} />
      </div>
      {facts.length ? (
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div className="flex gap-2" key={label}>
              <dt className="text-app-muted">{label}:</dt>
              <dd className="text-app-text">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {data.deal?.note ? <p className="mt-2 text-sm text-app-muted">Deal: {data.deal.note}</p> : null}

      <h3 className="mt-5 text-sm font-semibold text-app-text">Payments</h3>
      {data.payments.length === 0 ? (
        <p className="mt-1 text-sm text-app-muted">None recorded.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Recorded</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Paid until</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(payment.createdAt, timeZone)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatMoney(payment.amountMinor, payment.currency)}</TableCell>
                  <TableCell>{enumLabel(payment.method)}</TableCell>
                  <TableCell>{payment.reference ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatFullDate(payment.periodEnd, timeZone)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <h3 className="mt-5 text-sm font-semibold text-app-text">History</h3>
      {data.events.length === 0 ? (
        <p className="mt-1 text-sm text-app-muted">No changes yet.</p>
      ) : (
        <ul className="mt-2 grid gap-2">
          {data.events.slice(0, 20).map((event) => (
            <li className="text-sm" key={event.id}>
              <span className="text-app-muted">{formatDateTime(event.createdAt, timeZone)} · </span>
              <span className="text-app-text">
                {event.fromStatus !== event.toStatus && event.toStatus
                  ? `${event.fromStatus ? enumLabel(event.fromStatus) : "New"} → ${enumLabel(event.toStatus)}`
                  : event.fromPlanCode !== event.toPlanCode
                    ? `${event.fromPlanCode ?? "—"} → ${event.toPlanCode ?? "—"}`
                    : "Updated"}
              </span>
              <span className="text-app-muted"> ({enumLabel(event.source)})</span>
              {event.note ? <span className="text-app-muted"> — {event.note}</span> : null}
            </li>
          ))}
        </ul>
      )}

      {dialog === "plan" ? <ChangePlanDialog data={data} onClose={() => setDialog(null)} tenantId={tenantId} /> : null}
      {dialog === "status" ? <StatusDialog data={data} onClose={() => setDialog(null)} tenantId={tenantId} /> : null}
      {dialog === "payment" ? <PaymentDialog data={data} onClose={() => setDialog(null)} tenantId={tenantId} /> : null}
      {dialog === "deal" ? <DealDialog data={data} onClose={() => setDialog(null)} tenantId={tenantId} /> : null}
    </SectionCard>
  );
}
