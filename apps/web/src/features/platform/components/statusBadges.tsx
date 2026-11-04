import type { TenantAccessMode, TenantStatusType, TenantSubscriptionStatusType } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { enumLabel } from "@/lib/utils";

const ACCESS_VARIANT: Record<TenantAccessMode, "destructive" | "success" | "warning"> = {
  FULL: "success",
  LOCKED: "destructive",
  READ_ONLY: "warning"
};

/** Subscription status, coloured by what it means for the academy's access. */
export function SubscriptionStatusBadge({
  accessMode,
  status
}: {
  accessMode: TenantAccessMode;
  status: TenantSubscriptionStatusType | null;
}) {
  if (!status) return <Badge variant="outline">No subscription</Badge>;
  return <Badge variant={ACCESS_VARIANT[accessMode]}>{enumLabel(status)}</Badge>;
}

export function TenantStatusBadge({ status }: { status: TenantStatusType }) {
  return (
    <Badge variant={status === "ACTIVE" ? "secondary" : "destructive"}>{enumLabel(status)}</Badge>
  );
}
