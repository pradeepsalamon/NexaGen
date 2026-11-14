import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_CONVERSATION_STATUS_LABELS,
  SUPPORT_TICKET_STATUS_LABELS,
  SUPPORT_TICKET_STATUSES,
  type SupportConversationStatus,
  type SupportTicketStatus
} from "@nexa-chess/types";

type BadgeVariant = "default" | "secondary" | "success" | "warning" | "info" | "outline";

export const TICKET_STATUS_BADGE: Record<SupportTicketStatus, BadgeVariant> = {
  IN_PROGRESS: "info",
  OPEN: "warning",
  RESOLVED: "success"
};

export const CONVERSATION_STATUS_BADGE: Record<SupportConversationStatus, BadgeVariant> = {
  AGENT: "default",
  BOT: "secondary",
  CLOSED: "outline",
  WAITING_AGENT: "warning"
};

export const TICKET_STATUS_OPTIONS = SUPPORT_TICKET_STATUSES.map((value) => ({
  label: SUPPORT_TICKET_STATUS_LABELS[value],
  value
}));

export const CATEGORY_OPTIONS = SUPPORT_CATEGORIES.map((value) => ({ label: SUPPORT_CATEGORY_LABELS[value], value }));

export { SUPPORT_CATEGORY_LABELS, SUPPORT_CONVERSATION_STATUS_LABELS, SUPPORT_TICKET_STATUS_LABELS };

/** "+91 98765 43210" style for display; the API stores digits with the country code. */
export function formatWaNumber(waId: string): string {
  if (waId.startsWith("91") && waId.length === 12) return `+91 ${waId.slice(2, 7)} ${waId.slice(7)}`;
  return `+${waId}`;
}
