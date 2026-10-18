"use client";

import { PAYMENT_PROVIDER_LABELS, type ProviderHealthItem } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useProviderHealth } from "../hooks/usePaymentsApi";

/**
 * Gateway health (§17).
 *
 * A provider that drops below the success-rate threshold is taken out of
 * routing automatically — but a failover is never allowed to *re-route a
 * payment* while it is unclear whether the original attempt debited the
 * customer. That reconciliation-first rule is enforced in the API; this panel
 * is the window onto it.
 */
export function ProviderHealthPanel() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useProviderHealth();

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      <p className="text-sm text-app-muted">
        Measured over the last {data.windowHours} hours. A gateway with too few
        attempts is never judged — it stays in rotation until there is enough
        evidence.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.providers.map((provider) => (
          <ProviderCard
            key={provider.provider}
            provider={provider}
            timeZone={timeZone}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderCard({
  provider,
  timeZone
}: {
  provider: ProviderHealthItem;
  timeZone: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-bold text-app-text">
          {PAYMENT_PROVIDER_LABELS[provider.provider]}
        </h3>
        <Badge
          variant={
            !provider.configured
              ? "outline"
              : provider.available
                ? "success"
                : "destructive"
          }
        >
          {!provider.configured
            ? "Not configured"
            : provider.available
              ? "In rotation"
              : "Degraded"}
        </Badge>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-xs text-app-muted">Success rate</dt>
          <dd className="font-semibold tabular-nums text-app-text">
            {provider.successRate === null ? "—" : `${provider.successRate}%`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-app-muted">Avg response</dt>
          <dd className="font-semibold tabular-nums text-app-text">
            {provider.avgResponseMs === null
              ? "—"
              : `${provider.avgResponseMs} ms`}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-app-muted">Calls</dt>
          <dd className="font-semibold tabular-nums text-app-text">
            {provider.succeeded}/{provider.attempts}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-app-muted">Webhook failures</dt>
          <dd className="font-semibold tabular-nums text-app-text">
            {provider.webhookFailures}
          </dd>
        </div>
      </dl>

      {provider.degradedReason ? (
        <p className="mt-3 rounded-app bg-app-soft px-3 py-2 text-xs text-app-muted">
          {provider.degradedReason}
        </p>
      ) : null}

      {provider.lastFailureAt ? (
        <p className="mt-2 text-xs text-app-muted">
          Last failure {formatDateTime(provider.lastFailureAt, timeZone)}
        </p>
      ) : null}
    </Card>
  );
}
