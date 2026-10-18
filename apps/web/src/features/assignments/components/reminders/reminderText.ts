import type { AssignmentRemindersResponse } from "@nexa-chess/types";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "2 overdue assignments and 1 due today" — the parts that are non-zero. */
export function describeReminderCounts(counts: AssignmentRemindersResponse["counts"]): string {
  const parts: string[] = [];
  if (counts.overdue) parts.push(`${plural(counts.overdue, "overdue assignment")}`);
  if (counts.dueToday) parts.push(`${counts.dueToday} due today`);
  if (counts.dueSoon) parts.push(`${counts.dueSoon} due soon`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
