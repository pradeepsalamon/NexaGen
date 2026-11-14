import type { ReferralStageTone } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";

export function StageBadge({ name, tone }: { name: string; tone: ReferralStageTone }) {
  return <Badge variant={tone}>{name}</Badge>;
}
