import type { AssignmentDifficulty, AssignmentStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

const DIFFICULTY_STYLE: Record<AssignmentDifficulty, string> = {
  BEGINNER: "border-green-200 bg-green-50 text-green-700",
  INTERMEDIATE: "border-yellow-200 bg-yellow-50 text-yellow-700",
  ADVANCED: "border-red-200 bg-red-50 text-red-700"
};

const DIFFICULTY_LABEL: Record<AssignmentDifficulty, string> = {
  BEGINNER: "Beginner",
  INTERMEDIATE: "Intermediate",
  ADVANCED: "Advanced"
};

const STATUS_STYLE: Record<AssignmentStatus, string> = {
  PENDING: "border-app-border bg-app-background text-app-muted",
  IN_PROGRESS: "border-yellow-200 bg-yellow-50 text-yellow-700",
  COMPLETED: "border-green-200 bg-green-50 text-green-700"
};

const STATUS_LABEL: Record<AssignmentStatus, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed"
};

export function DifficultyBadge({ difficulty }: { difficulty: AssignmentDifficulty }) {
  return (
    <Badge variant="outline" className={DIFFICULTY_STYLE[difficulty]}>
      {DIFFICULTY_LABEL[difficulty]}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: AssignmentStatus }) {
  return (
    <Badge variant="outline" className={STATUS_STYLE[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function DueBadge({ dueDate, formatted }: { dueDate: string; formatted: string }) {
  const overdue = new Date(dueDate).getTime() < Date.now();
  return (
    <span
      className={cn(
        "rounded border px-2 py-0.5 text-xs font-medium",
        overdue
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-app-border bg-app-background text-app-muted"
      )}
    >
      {overdue ? "Overdue · " : "Due "}
      {formatted}
    </span>
  );
}
