"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { PLAN_FEATURES, type PlanFeatureKey } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { useAuthStore } from "@/stores/authStore";

/** Shown in place of a page whose plan feature the academy doesn't have. */
export function PlanUpgradeNotice({ feature }: { feature: PlanFeatureKey }) {
  const role = useAuthStore((state) => state.user?.role);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const definition = PLAN_FEATURES[feature];

  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center rounded-app border-2 border-dashed border-app-border bg-app-surface/50 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
        <Sparkles aria-hidden="true" className="size-6 text-primary-ink" strokeWidth={2.25} />
      </div>
      <h2 className="mt-4 text-lg font-bold text-app-text">{definition.label} isn&apos;t in your plan</h2>
      <p className="mt-1 max-w-md text-sm text-app-muted">{definition.description}</p>
      <p className="mt-3 max-w-md text-sm text-app-muted">
        {isAdmin
          ? "Upgrade your academy's subscription to turn it on."
          : "Ask your academy to upgrade its subscription to use it."}
      </p>
      {isAdmin ? (
        <Button asChild className="mt-5">
          <Link href="/admin/subscription">View plans</Link>
        </Button>
      ) : null}
    </div>
  );
}
