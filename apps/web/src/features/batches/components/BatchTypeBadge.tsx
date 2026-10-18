import { Handshake, User, Users, type LucideIcon } from "lucide-react";
import { BATCH_TYPE_LABELS, type BatchType } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";

const BATCH_TYPE_STYLE: Record<BatchType, { icon: LucideIcon; variant: "default" | "info" | "secondary" }> = {
  BUDDY: { icon: Handshake, variant: "secondary" },
  GROUP: { icon: Users, variant: "info" },
  INDIVIDUAL: { icon: User, variant: "default" }
};

/** Group / Individual / Buddy label for a class or batch. */
export function BatchTypeBadge({ className, type }: { className?: string; type: BatchType }) {
  const { icon: Icon, variant } = BATCH_TYPE_STYLE[type];
  return (
    <Badge className={className} variant={variant}>
      <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
      {BATCH_TYPE_LABELS[type]}
    </Badge>
  );
}
