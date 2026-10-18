"use client";

import {
  ACCURACY_MIN_SAMPLE,
  STUDENT_ACTIVITY_TYPE_LABELS,
  THEME_MIN_SAMPLE,
  type ActivityGranularity,
  type ActivityTrend,
  type StudentActivitySummary
} from "@nexa-chess/types";
import { CheckCircle2, ListChecks, Puzzle, Target } from "lucide-react";
import { BarChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { useChartColors } from "@/components/charts/useChartColors";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/SectionCard";
import { StatTile } from "@/components/ui/StatTile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDate, formatDayMonth, formatFullDate, formatRelativeDay } from "@/lib/datetime";

const pct = (value: number | null) => (value === null ? "—" : `${value}%`);

/** Bucket labels are calendar days already in the viewer's zone — format as UTC so they don't shift. */
function bucketLabel(bucket: string, granularity: ActivityGranularity): string {
  const iso = `${bucket}T00:00:00Z`;
  if (granularity === "month") return formatDate(iso, "UTC", { month: "short", year: "2-digit" });
  return granularity === "week" ? `wk ${formatDayMonth(iso, "UTC")}` : formatDayMonth(iso, "UTC");
}

function trendSentence(trend: ActivityTrend, tz: string): { text: string; variant: "success" | "warning" | "secondary" | "outline" } {
  const since = formatFullDate(trend.splitAt, tz);
  const e = trend.earlier;
  const r = trend.recent;
  switch (trend.status) {
    case "IMPROVING":
      return { text: `Accuracy rose from ${e.accuracyPercent}% (${e.gradedAttempts} tries) to ${r.accuracyPercent}% (${r.gradedAttempts} tries) since ${since}.`, variant: "success" };
    case "DECLINING":
      return { text: `Accuracy fell from ${e.accuracyPercent}% (${e.gradedAttempts} tries) to ${r.accuracyPercent}% (${r.gradedAttempts} tries) since ${since}.`, variant: "warning" };
    case "STEADY":
      return { text: `Accuracy has held steady: ${e.accuracyPercent}% before ${since}, ${r.accuracyPercent}% after.`, variant: "secondary" };
    default:
      return {
        text: `Not enough graded tries to compare yet (${e.gradedAttempts} before ${since}, ${r.gradedAttempts} after).`,
        variant: "outline"
      };
  }
}

function InsightBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-control border border-app-border bg-app-soft/40 p-4">
      <h3 className="mb-2 text-sm font-extrabold text-app-text">{title}</h3>
      {children}
    </div>
  );
}

export function ActivitySummaryPanel({ summary }: { summary: StudentActivitySummary }) {
  const tz = useUserTimeZone();
  const colors = useChartColors();
  const { accuracy, firstTry, insights, puzzles, totals } = summary;
  const chartData = summary.series.map((p) => ({
    Correct: p.correctAttempts,
    Incorrect: p.gradedAttempts - p.correctAttempts,
    bucket: p.bucket
  }));
  const trend = trendSentence(insights.trend, tz);
  const unfinished = totals.incomplete + totals.notStarted + totals.unanswered + totals.skipped;

  if (totals.activities === 0) {
    return (
      <Alert variant="info">
        No activity in this period. Pick a longer period, or check back once puzzles, class questions or
        assignments have been attempted.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          context={`${totals.completed} completed`}
          icon={ListChecks}
          label="Activities attempted"
          tone="primary"
          value={String(totals.attempted)}
        />
        <StatTile
          context={`${accuracy.correctAttempts} / ${accuracy.gradedAttempts} graded tries`}
          icon={Target}
          label="Accuracy"
          progress={accuracy.accuracyPercent ?? undefined}
          tone="accent"
          value={pct(accuracy.accuracyPercent)}
        />
        <StatTile
          context={`${firstTry.firstTryCorrect} / ${firstTry.gradedActivities} activities`}
          icon={CheckCircle2}
          label="Right first try"
          tone="secondary"
          value={pct(firstTry.percent)}
        />
        <StatTile
          context="distinct puzzles"
          icon={Puzzle}
          label="Puzzles solved"
          tone="warm"
          value={`${puzzles.uniqueSolved} / ${puzzles.uniqueAttempted}`}
        />
      </div>

      <div className="space-y-1 text-xs text-app-muted">
        <p>
          <span className="font-semibold text-app-text">Accuracy</span> = correct graded tries ÷ all graded tries.
          Retries each count; ungraded work, skipped and unanswered activities don&apos;t.{" "}
          <span className="font-semibold text-app-text">Puzzles solved</span> counts each puzzle once, however many
          tries or settings.
        </p>
        {summary.lastActivityAt ? (
          <p>
            Last activity {formatRelativeDay(summary.lastActivityAt, tz)} ·{" "}
            {totals.activities} {totals.activities === 1 ? "activity" : "activities"} in this period
          </p>
        ) : null}
      </div>

      {accuracy.smallSample && accuracy.gradedAttempts > 0 ? (
        <Alert variant="info">
          Accuracy is based on only {accuracy.gradedAttempts} graded {accuracy.gradedAttempts === 1 ? "try" : "tries"}{" "}
          (fewer than {ACCURACY_MIN_SAMPLE}) — treat it as a rough signal, not a verdict.
        </Alert>
      ) : null}

      <SectionCard
        description="Graded tries per period — right and wrong. Ungraded work isn't shown here."
        title="Results over time"
      >
        <ChartContainer
          emptyMessage="No graded tries in this period yet."
          isEmpty={summary.series.every((p) => p.gradedAttempts === 0)}
        >
          <BarChartCard
            data={chartData}
            series={[
              { color: colors.accent, key: "Correct", label: "Correct" },
              { color: colors.warm, key: "Incorrect", label: "Incorrect" }
            ]}
            stacked
            xFormat={(b) => bucketLabel(b, summary.granularity)}
            xKey="bucket"
          />
        </ChartContainer>
      </SectionCard>

      <SectionCard description="Evidence from this period's records only." title="Areas to work on">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <InsightBlock title="Trend">
            <div className="flex flex-wrap items-start gap-2">
              <Badge variant={trend.variant}>
                {insights.trend.status === "INSUFFICIENT_DATA"
                  ? "Too early to tell"
                  : insights.trend.status.charAt(0) + insights.trend.status.slice(1).toLowerCase()}
              </Badge>
              <p className="min-w-0 flex-1 text-sm text-app-muted">{trend.text}</p>
            </div>
          </InsightBlock>

          <InsightBlock title="Weaker puzzle themes">
            {insights.weakThemes.length > 0 ? (
              <ul className="space-y-1.5">
                {insights.weakThemes.map((t) => (
                  <li className="flex items-center justify-between gap-3 text-sm" key={`${t.kind}:${t.key}`}>
                    <span className="min-w-0 truncate text-app-text">
                      {t.label}
                      <span className="text-app-muted"> · {t.kind === "TYPE" ? "type" : t.kind === "FOLDER" ? "folder" : "theme"}</span>
                    </span>
                    <span className="shrink-0 text-app-muted">
                      <span className="font-bold text-warm-ink">{pct(t.accuracyPercent)}</span> of {t.gradedAttempts}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-app-muted">
                {insights.comparableThemes === 0
                  ? `Not enough graded puzzles per theme yet (each needs at least ${THEME_MIN_SAMPLE}).`
                  : `None of the ${insights.comparableThemes} themes with enough tries is clearly below the overall accuracy.`}
              </p>
            )}
          </InsightBlock>

          <InsightBlock title="Repeated mistakes">
            {insights.repeatedMistakes.length > 0 ? (
              <ul className="space-y-1.5">
                {insights.repeatedMistakes.map((m) => (
                  <li className="flex items-center justify-between gap-3 text-sm" key={m.puzzleId}>
                    <span className="min-w-0 truncate text-app-text">{m.title}</span>
                    <span className="flex shrink-0 items-center gap-2 text-app-muted">
                      wrong {m.incorrectAttempts} of {m.gradedAttempts}
                      <Badge variant={m.eventuallySolved ? "success" : "warning"}>
                        {m.eventuallySolved ? "Solved later" : "Not solved yet"}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-app-muted">No puzzle was got wrong more than once in this period.</p>
            )}
          </InsightBlock>

          <InsightBlock title="Left unfinished">
            {unfinished > 0 ? (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-app-muted">
                <li>
                  <span className="font-bold text-app-text">{totals.incomplete}</span> started, not finished
                </li>
                <li>
                  <span className="font-bold text-app-text">{totals.notStarted}</span> not started
                </li>
                <li>
                  <span className="font-bold text-app-text">{totals.unanswered}</span> unanswered in class
                </li>
                <li>
                  <span className="font-bold text-app-text">{totals.skipped}</span> skipped
                </li>
              </ul>
            ) : (
              <p className="text-sm text-app-muted">Everything in this period was finished.</p>
            )}
          </InsightBlock>
        </div>
      </SectionCard>

      {summary.byType.length > 0 ? (
        <SectionCard title="By activity type">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Type</TableHead>
                  <TableHead className="text-right">Activities</TableHead>
                  <TableHead className="text-right">Attempted</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Graded tries</TableHead>
                  <TableHead className="text-right">Accuracy</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.byType.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="text-left font-semibold">{STUDENT_ACTIVITY_TYPE_LABELS[row.type]}</TableCell>
                    <TableCell className="text-right">{row.activities}</TableCell>
                    <TableCell className="text-right">{row.attempted}</TableCell>
                    <TableCell className="text-right">{row.completed}</TableCell>
                    <TableCell className="text-right">{row.gradedAttempts}</TableCell>
                    <TableCell className="text-right">
                      {row.gradedAttempts === 0 ? "Ungraded" : pct(row.accuracyPercent)}
                      {row.gradedAttempts > 0 && row.gradedAttempts < ACCURACY_MIN_SAMPLE ? (
                        <span className="text-app-muted"> · small sample</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
