import type {
  AssignmentActivityType,
  AssignmentDifficulty,
  AssignmentStatus
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

export const ACTIVITY_LABEL: Record<AssignmentActivityType, string> = {
  REPLAY: "Study PGN",
  SOLVE_LINE: "Solve position",
  PLAY_VS_ENGINE: "Play vs engine",
  FREE_ANALYSIS: "Free analysis"
};

const ACTIVITY_STYLE: Record<AssignmentActivityType, string> = {
  REPLAY: "border-sky-200 bg-sky-50 text-sky-700",
  SOLVE_LINE: "border-violet-200 bg-violet-50 text-violet-700",
  PLAY_VS_ENGINE: "border-amber-200 bg-amber-50 text-amber-700",
  FREE_ANALYSIS: "border-slate-200 bg-slate-50 text-slate-700"
};

export function ActivityBadge({ activityType }: { activityType: AssignmentActivityType }) {
  return (
    <Badge variant="outline" className={ACTIVITY_STYLE[activityType]}>
      {ACTIVITY_LABEL[activityType]}
    </Badge>
  );
}

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
