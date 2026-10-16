import type { DiagramCandidateStatus } from "@nexa-chess/types";

export function statusBadgeVariant(status: DiagramCandidateStatus): "success" | "warning" | "destructive" | "info" {
  switch (status) {
    case "confirmed":
      return "success";
    case "valid":
      return "info";
    case "invalid":
      return "destructive";
    default:
      return "warning";
  }
}
