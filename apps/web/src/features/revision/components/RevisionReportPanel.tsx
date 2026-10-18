"use client";

import { useState } from "react";
import { Brain, CalendarClock, Plus, Target, Trash2, Trophy } from "lucide-react";
import {
  REVISION_DUE_STATUS_LABELS,
  REVISION_GRADES,
  REVISION_GRADE_LABELS,
  REVISION_POLICY,
  type RevisionDueStatus,
  type RevisionItemReport,
  type RevisionReportResponse
} from "@nexa-chess/types";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDayMonth, formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { removeRevisionRecommendation } from "../api/revisionApi";
import { useRevisionReport } from "../hooks/useRevisionApi";
import { RecommendRevisionDialog } from "./RecommendRevisionDialog";

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const DUE_VARIANT: Record<RevisionDueStatus, BadgeVariant> = {
  DUE: "default",
  LATER_TODAY: "info",
  NEW: "secondary",
  OVERDUE: "warning",
  SCHEDULED: "outline"
};

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : "—");

/**
 * One student's revision: what is scheduled, how reviews went, and what keeps
 * being missed. `studentId` null = the signed-in student (read-only); a coach
 * or admin also recommends items and removes their own recommendations.
 */
export function RevisionReportPanel({
  hideDue = false,
  studentId
}: {
  /** The student's own revision page already shows due/overdue above this panel. */
  hideDue?: boolean;
  studentId: string | null;
}) {
  const report = useRevisionReport(studentId);
  const [recommendOpen, setRecommendOpen] = useState(false);

  if (report.isLoading) return <Skeleton className="h-72 w-full rounded-app" />;
  if (report.isError || !report.data) {
    return <WidgetError message={report.error?.message ?? "Couldn't load revision."} onRetry={() => void report.refetch()} />;
  }
  const staff = studentId !== null;
  return (
    <div className="space-y-5">
      <RevisionInsights hideDue={hideDue} report={report.data} />
      <RevisionItemsTable
        items={report.data.items}
        onRecommend={staff ? () => setRecommendOpen(true) : undefined}
        studentId={studentId}
      />
      {staff ? (
        <RecommendRevisionDialog onOpenChange={setRecommendOpen} open={recommendOpen} studentId={studentId} />
      ) : null}
    </div>
  );
}

function RevisionInsights({ hideDue, report }: { hideDue: boolean; report: RevisionReportResponse }) {
  const s = report.summary;
  const graded30 = REVISION_GRADES.reduce((n, g) => n + report.gradeCounts[g], 0);
  const recalled30 = graded30 - report.gradeCounts.AGAIN;
  const hasReviews = report.weeks.some((w) => w.reviews > 0);

  return (
    <div className="space-y-5">
      <div className={hideDue ? "grid grid-cols-2 gap-3 lg:grid-cols-3" : "grid grid-cols-2 gap-3 lg:grid-cols-4"}>
        <StatTile
          context={s.unavailableItems > 0 ? `${s.unavailableItems} unavailable` : undefined}
          icon={Brain}
          label="Items in revision"
          tone="primary"
          value={String(s.activeItems)}
        />
        {hideDue ? null : (
          <StatTile
            context={`${s.overdue} overdue`}
            icon={CalendarClock}
            label="Due today"
            tone="warm"
            value={String(s.dueToday)}
          />
        )}
        <StatTile
          context="last 30 days"
          icon={Target}
          label="Recall rate"
          tone="accent"
          value={pct(recalled30, graded30)}
        />
        <StatTile
          context={`${REVISION_POLICY.longTermRepetitions}× · ${REVISION_POLICY.longTermIntervalDays}d+`}
          icon={Trophy}
          label="Long-term recall"
          tone="secondary"
          value={String(s.longTermRecall)}
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <SectionCard
          description="The last 8 weeks. Recall = reviews rated Hard, Good or Easy. Accuracy = revision puzzles solved, whatever the rating."
          title="Reviews by week"
        >
          {hasReviews ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Week of</TableHead>
                  <TableHead>Reviews</TableHead>
                  <TableHead>Recalled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.weeks.map((w) => (
                  <TableRow key={w.weekStart}>
                    {/* Date-only value: formatted in UTC so it can't drift a day. */}
                    <TableCell className="text-left">{formatDayMonth(`${w.weekStart}T00:00:00Z`, "UTC")}</TableCell>
                    <TableCell className="tabular-nums">{w.reviews}</TableCell>
                    <TableCell className="tabular-nums">{w.reviews ? `${w.recalled} (${pct(w.recalled, w.reviews)})` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-4 text-center text-sm text-app-muted">No reviews in the last 8 weeks.</p>
          )}
          <p className="mt-3 text-sm text-app-muted">
            Attempt accuracy (all time): {report.attempts.solved} of {report.attempts.graded} solved
            {report.attempts.graded ? ` (${pct(report.attempts.solved, report.attempts.graded)})` : ""}, {report.attempts.clean} without a
            hint or wrong move.
          </p>
        </SectionCard>

        <SectionCard description="From reviews rated Again in the last 90 days." title="Needs attention">
          <div className="space-y-4">
            <div>
              <h3 className="mb-2 text-xs font-bold text-app-muted">Most missed themes</h3>
              {report.missedThemes.length ? (
                <ul className="flex flex-wrap gap-2">
                  {report.missedThemes.map((t) => (
                    <li key={t.theme}>
                      <Badge variant="warning">
                        {t.label} × {t.count}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-app-muted">Nothing missed recently.</p>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-bold text-app-muted">Concepts that keep coming back</h3>
              {report.strugglingConcepts.length ? (
                <ul className="space-y-1 text-sm text-app-text">
                  {report.strugglingConcepts.map((c) => (
                    <li key={c.itemId}>
                      {c.title} — rated Again {c.lapses} times
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-app-muted">None so far.</p>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

function RevisionItemsTable({
  items,
  studentId,
  onRecommend
}: {
  items: RevisionItemReport[];
  studentId: string | null;
  onRecommend?: () => void;
}) {
  const tz = useUserTimeZone();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { run: remove } = useUndoableMutation({
    invalidates: [queryKeys.revision.all],
    mutationFn: (item: RevisionItemReport) => removeRevisionRecommendation(studentId as string, item.itemId),
    onCancel: (item) =>
      setHidden((set) => {
        const next = new Set(set);
        next.delete(item.itemId);
        return next;
      }),
    onSchedule: (item) => setHidden((set) => new Set(set).add(item.itemId)),
    strategy: "defer",
    toast: (item) => ({
      message:
        item.source === "COACH"
          ? "It leaves the student's revision."
          : "It stays in their revision as one of their own mistakes.",
      title: `Removing the recommendation "${item.title}"`
    }),
    undo: async () => {}
  });
  const rows = items.filter((i) => !hidden.has(i.itemId));

  return (
    <SectionCard
      actions={
        onRecommend ? (
          <Button onClick={onRecommend} size="sm" type="button">
            <Plus aria-hidden="true" className="mr-1.5 size-4" strokeWidth={2.5} />
            Recommend
          </Button>
        ) : null
      }
      description={`Each item's next review is set by how well it was remembered last time. Long-term recall = ${REVISION_POLICY.longTermRepetitions}+ successful reviews in a row, now ${REVISION_POLICY.longTermIntervalDays}+ days apart.`}
      title="Revision items"
    >
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-muted">
          No revision items yet. Missed puzzles are added automatically
          {onRecommend ? "; use Recommend to add puzzles or a folder." : "."}
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-left">Item</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Next review</TableHead>
                <TableHead>Reviews</TableHead>
                <TableHead>Again</TableHead>
                <TableHead>Last rating</TableHead>
                {onRecommend ? <TableHead>Actions</TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((item) => (
                <TableRow className={item.available ? undefined : "opacity-60"} key={item.itemId}>
                  <TableCell className="min-w-48 text-left">
                    <p className="font-semibold text-app-text">{item.title}</p>
                    <p className="text-xs text-app-muted">
                      {item.kind === "TOPIC" ? "Folder · " : ""}
                      {item.source === "MISTAKE"
                        ? "Missed before"
                        : item.source === "GAME"
                          ? studentId === null ? "From your game" : "From the student's game"
                          : "Recommended"}
                      {item.recommendedByName ? ` by ${item.recommendedByName}` : ""}
                      {item.longTermRecall ? " · long-term recall" : ""}
                    </p>
                  </TableCell>
                  <TableCell>
                    {item.available ? (
                      <Badge variant={DUE_VARIANT[item.dueStatus]}>{REVISION_DUE_STATUS_LABELS[item.dueStatus]}</Badge>
                    ) : (
                      <Badge variant="outline">Unavailable</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatFullDate(item.dueAt, tz)}
                    {item.intervalDays > 0 ? (
                      <span className="block text-xs text-app-muted">every {item.intervalDays}d</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="tabular-nums">{item.reviewCount}</TableCell>
                  <TableCell className="tabular-nums">{item.lapses}</TableCell>
                  <TableCell>{item.lastGrade ? REVISION_GRADE_LABELS[item.lastGrade] : "—"}</TableCell>
                  {onRecommend ? (
                    <TableCell>
                      {item.canRemove ? (
                        <RowActions
                          actions={[
                            {
                              ariaLabel: `Remove recommendation ${item.title}`,
                              icon: Trash2,
                              label: "Remove recommendation",
                              onSelect: () => remove(item),
                              tone: "danger"
                            }
                          ]}
                        />
                      ) : (
                        <span className="text-xs text-app-muted">—</span>
                      )}
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}
