import type { ChatConversationType } from "@nexa-chess/types";
import { formatDayMonth, formatRelativeDay, formatTime } from "@/lib/datetime";

/** List timestamp: the time today, the date otherwise. */
export function chatListStamp(iso: string | null, timeZone: string): string {
  if (!iso) return "";
  return formatRelativeDay(iso, timeZone) === "Today" ? formatTime(iso, timeZone) : formatDayMonth(iso, timeZone);
}

/** Day separator inside a thread. */
export function chatDayLabel(iso: string, timeZone: string): string {
  return formatRelativeDay(iso, timeZone) === "Today" ? "Today" : formatDayMonth(iso, timeZone);
}

export const CHAT_TYPE_LABELS: Record<ChatConversationType, string> = {
  BATCH: "Batch",
  DIRECT: "Direct",
  GROUP: "Group",
};

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "")).toUpperCase() || "?";
}

/** A send id that survives a retry, so the API never stores the message twice. */
export function newChatClientId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
