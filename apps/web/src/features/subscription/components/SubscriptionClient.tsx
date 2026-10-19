"use client";

import { Check, GraduationCap, Layers3, Minus, UserRoundCheck, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  PLAN_FEATURE_KEYS,
  PLAN_FEATURES,
  PLAN_LIMIT_KEYS,
  PLAN_LIMITS,
  formatMoney,
  type AdminSubscriptionResponse,
  type PlanLimitKey,
  type PlatformPlanSummary,
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import type { Tone } from "@/lib/tone";
import { cn, enumLabel } from "@/lib/utils";
import { useAdminSubscription } from "../hooks/useSubscription";

const LIMIT_TILES: Record<PlanLimitKey, { icon: LucideIcon; tone: Tone }> = {
  maxBatches: { icon: Layers3, tone: "primary" },
  maxCoaches: { icon: UserRoundCheck, tone: "accent" },
  maxConcurrentLiveClasses: { icon: Video, tone: "warm" },
  maxStudents: { icon: GraduationCap, tone: "secondary" },
};

const formatLimit = (value: number | null) => (value === null ? "Unlimited" : value.toLocaleString("en-IN"));

function formatPrice(plan: PlatformPlanSummary) {
  if (plan.priceMonthlyMinor === null) return "Contact us";
  return `${formatMoney(plan.priceMonthlyMinor, plan.currency)} / month`;
}

function StatusAlert({ data }: { data: AdminSubscriptionResponse }) {
  if (data.accessMode === "LOCKED") {
    return (
      <Alert title="Your subscription has ended" variant="error">
        Only sign-in, this page and data export work until it is renewed. Nothing has been deleted.
      </Alert>
    );
  }
  if (data.accessMode === "READ_ONLY") {
    return (
      <Alert title="Grace period: changes are paused" variant="warning">
        Everyone can still sign in and view everything. Renew the subscription to make changes again.
      </Alert>
    );
  }
  if (data.status === "PAST_DUE") {
    return (
      <Alert title="Payment is overdue" variant="warning">
        Everything still works. Settle the payment before the grace period starts.
      </Alert>
    );
  }
  return null;
}

function CurrentPlan({ data }: { data: AdminSubscriptionResponse }) {
  const timeZone = useUserTimeZone();
  const sub = data.subscription;
  const dates = [
    sub?.status === "TRIALING" && sub.trialEndsAt ? `Trial ends ${formatFullDate(sub.trialEndsAt, timeZone)}` : null,
    sub?.currentPeriodEnd
      ? `${sub.status === "CANCEL_SCHEDULED" ? "Ends" : "Renews"} ${formatFullDate(sub.currentPeriodEnd, timeZone)}`
      : null,
    sub?.status === "GRACE" && sub.graceEndsAt ? `Grace ends ${formatFullDate(sub.graceEndsAt, timeZone)}` : null,
  ].filter(Boolean);

  return (
    <section className="rounded-app border border-app-border bg-app-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold text-app-text">{data.plan?.name ?? "No plan"}</h2>
        {data.status ? (
          <Badge variant={data.accessMode === "FULL" ? "success" : data.accessMode === "READ_ONLY" ? "warning" : "destructive"}>
            {enumLabel(data.status)}
          </Badge>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-app-muted">
        {data.tenant.name ? `${data.tenant.name} · ` : ""}
        {data.features.length} of {PLAN_FEATURE_KEYS.length} features included
        {dates.length ? ` · ${dates.join(" · ")}` : ""}
      </p>
      <p className="mt-3 text-sm text-app-muted">
        To change your plan, contact the NexaChess team. Downgrading never deletes data: anything over a new limit
        stays visible, only adding more is blocked.
      </p>
    </section>
  );
}

function Usage({ data }: { data: AdminSubscriptionResponse }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {PLAN_LIMIT_KEYS.map((key) => {
        const limit = data.limits[key];
        const used = data.usage[key];
        const tile = LIMIT_TILES[key];
        return (
          <StatTile
            context={limit === null ? "Unlimited" : `of ${formatLimit(limit)}`}
            icon={tile.icon}
            key={key}
            label={PLAN_LIMITS[key].label}
            progress={limit === null || limit === 0 ? undefined : Math.min(100, Math.round((used / limit) * 100))}
            tone={tile.tone}
            value={used.toLocaleString("en-IN")}
          />
        );
      })}
    </div>
  );
}

function PlanComparison({ data }: { data: AdminSubscriptionResponse }) {
  const currentCode = data.plan?.code;
  const highlight = (plan: PlatformPlanSummary) => (plan.code === currentCode ? "bg-primary/[0.06]" : undefined);

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-app-text">Compare plans</h2>
      <div className="overflow-x-auto rounded-app border border-app-border bg-app-surface shadow-card">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Feature</TableHead>
              {data.plans.map((plan) => (
                <TableHead className="text-center" key={plan.id}>
                  {plan.name}
                  {plan.code === currentCode ? " (current)" : ""}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="text-left font-semibold">Price</TableCell>
              {data.plans.map((plan) => (
                <TableCell className={cn("text-center", highlight(plan))} key={plan.id}>
                  {formatPrice(plan)}
                </TableCell>
              ))}
            </TableRow>
            {PLAN_LIMIT_KEYS.map((key) => (
              <TableRow key={key}>
                <TableCell className="text-left font-semibold">{PLAN_LIMITS[key].label}</TableCell>
                {data.plans.map((plan) => (
                  <TableCell className={cn("text-center tabular-nums", highlight(plan))} key={plan.id}>
                    {formatLimit(plan.limits[key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
            {PLAN_FEATURE_KEYS.map((key) => (
              <TableRow key={key}>
                <TableCell className="text-left">
                  <p className="font-semibold text-app-text">{PLAN_FEATURES[key].label}</p>
                  <p className="text-xs text-app-muted">{PLAN_FEATURES[key].description}</p>
                </TableCell>
                {data.plans.map((plan) => {
                  const included = plan.features.includes(key);
                  return (
                    <TableCell className={cn("text-center", highlight(plan))} key={plan.id}>
                      {included ? (
                        <Check aria-label="Included" className="mx-auto size-4 text-accent-ink" strokeWidth={2.5} />
                      ) : (
                        <Minus aria-label="Not included" className="mx-auto size-4 text-app-muted" strokeWidth={2.5} />
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-sm text-app-muted">
        Every plan includes batches, scheduling, live classes, attendance, assignments, the puzzle library,
        announcements and notifications.
      </p>
    </section>
  );
}

export function SubscriptionClient() {
  const { data, error, isLoading, refetch } = useAdminSubscription();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Your academy's NexaChess plan, what it includes and how much of it you use."
        title="Subscription"
      />
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-28 rounded-app" />
          <Skeleton className="h-32 rounded-app" />
        </div>
      ) : error || !data ? (
        <WidgetError message="Couldn't load the subscription." onRetry={() => void refetch()} />
      ) : (
        <>
          <StatusAlert data={data} />
          <CurrentPlan data={data} />
          <Usage data={data} />
          <PlanComparison data={data} />
        </>
      )}
    </div>
  );
}
