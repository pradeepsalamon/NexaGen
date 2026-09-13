"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  BILLING_INTERVAL_LABELS,
  formatMoney,
  isRecurringInterval
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { usePlans } from "../hooks/usePaymentsApi";

/** The public catalogue. Choosing a plan opens the checkout for it. */
export function PlansClient() {
  const router = useRouter();
  const { data, isLoading } = usePlans();

  if (isLoading) return <Skeleton className="h-80 w-full" />;

  if (!data || data.plans.length === 0) {
    return (
      <EmptyState
        description="The academy has not published any plans yet."
        title="Nothing available yet"
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Pick a plan to get started. You can pay by UPI, card, net banking or wallet."
        title="Plans"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.plans.map((plan) => (
          <Card className="flex flex-col p-5" key={plan.id}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-app-text">{plan.name}</h2>
              {isRecurringInterval(plan.interval) ? (
                <Badge variant="info">
                  {BILLING_INTERVAL_LABELS[plan.interval]}
                </Badge>
              ) : null}
            </div>

            <p className="mt-3 text-2xl font-bold text-primary">
              {formatMoney(plan.amount, plan.currency)}
              {isRecurringInterval(plan.interval) ? (
                <span className="text-sm font-semibold text-app-muted">
                  {" / "}
                  {BILLING_INTERVAL_LABELS[plan.interval].toLowerCase()}
                </span>
              ) : null}
            </p>

            {plan.description ? (
              <p className="mt-2 text-sm text-app-muted">{plan.description}</p>
            ) : null}

            {plan.features.length > 0 ? (
              <ul className="mt-4 flex-1 space-y-1.5">
                {plan.features.map((feature) => (
                  <li
                    className="flex items-start gap-2 text-sm text-app-text"
                    key={feature}
                  >
                    <Check
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      strokeWidth={2.5}
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="flex-1" />
            )}

            <Button
              className="mt-5"
              fullWidth
              onClick={() => router.push(`/checkout/${plan.id}`)}
              type="button"
              variant="primary"
            >
              Choose {plan.name}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
