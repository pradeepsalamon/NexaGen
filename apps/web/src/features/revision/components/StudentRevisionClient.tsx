"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { AlarmClock, Brain, CalendarCheck, CheckCircle2, Flame, Sparkles } from "lucide-react";
import {
  REVISION_GRADE_LABELS,
  type RevisionCurrent,
  type RevisionGrade,
  type RevisionReviewResponse,
  type RevisionSummary
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { getRevisionSession, nextRevisionItem, reviewRevisionItem, skipRevisionItem } from "../api/revisionApi";
import { useRevisionSession } from "../hooks/useRevisionApi";
import { formatNextDue } from "../lib/revisionFormat";
import { RevisionItemBoard } from "./RevisionItemBoard";
import { RevisionReportPanel } from "./RevisionReportPanel";

type Done = { itemId: string; grade: RevisionGrade; solved: boolean };

/**
 * The student's revision: today's workload, a focused session that serves one
 * due item at a time (server-ordered, resumable — the open item lives on the
 * server), and the insights below. A session is at most 20 items; anything
 * beyond stays due for the next one, nothing is dropped.
 */
export function StudentRevisionClient() {
  const qc = useQueryClient();
  const toast = useToast();
  const params = useSearchParams();
  const session = useRevisionSession();

  const [active, setActive] = useState(false);
  const [current, setCurrent] = useState<RevisionCurrent | null>(null);
  const [reviewed, setReviewed] = useState<RevisionReviewResponse | null>(null);
  const [done, setDone] = useState<Done[]>([]);
  const [summary, setSummary] = useState<RevisionSummary | null>(null);
  const [finished, setFinished] = useState(false);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.revision.all });
    void qc.invalidateQueries({ queryKey: queryKeys.progress.mine });
  }, [qc]);

  const next = useMutation({
    mutationFn: nextRevisionItem,
    onError: (error) => toast.error({ message: (error as Error).message, title: "Couldn't load the next item" }),
    onSuccess: (res) => {
      setReviewed(null);
      setSummary(res.summary);
      setCurrent(res.current);
      if (!res.current) {
        setFinished(true);
        refresh();
      }
    }
  });
  const requestNext = next.mutate;

  const rate = useMutation({
    mutationFn: (grade: RevisionGrade) => reviewRevisionItem({ attemptId: current!.attemptId, grade }),
    onError: (error) => toast.error({ message: (error as Error).message, title: "Couldn't save your rating" }),
    onSuccess: (res) => {
      setReviewed(res);
      setSummary(res.summary);
      setDone((list) => [...list, { grade: res.grade, itemId: res.itemId, solved: res.outcome !== "FAILED" }]);
    }
  });

  const skip = useMutation({
    mutationFn: () => skipRevisionItem({ itemId: current!.itemId }),
    onError: (error) => toast.error({ message: (error as Error).message, title: "Couldn't skip" }),
    onSuccess: () => requestNext()
  });

  // The puzzle was just submitted: re-read the open item for the server's verdict (outcome + the ratings
  // it accepts). The client never decides which ratings are allowed.
  const attemptId = current?.attemptId;
  const onFinished = useCallback(() => {
    const read = (tries: number) =>
      getRevisionSession()
        .then((res) => {
          const next = res.current;
          if (next && next.attemptId === attemptId && next.pendingRating) setCurrent(next);
          else if (tries > 0) window.setTimeout(() => read(tries - 1), 800);
        })
        .catch((error: Error) => {
          if (tries > 0) window.setTimeout(() => read(tries - 1), 800);
          else toast.error({ message: error.message, title: "Couldn't load your result" });
        });
    read(3);
  }, [attemptId, toast]);

  const begin = useCallback(() => {
    setActive(true);
    setFinished(false);
    setDone([]);
    requestNext();
  }, [requestNext]);

  // Resume an open item straight away; `?start=1` (the dashboard button) starts a session.
  const autoStarted = useRef(false);
  const data = session.data;
  useEffect(() => {
    if (autoStarted.current || !data) return;
    if (data.current || (params.get("start") === "1" && data.summary.sessionSize > 0)) {
      autoStarted.current = true;
      begin();
    }
  }, [data, params, begin]);

  const exit = () => {
    setActive(false);
    setCurrent(null);
    setReviewed(null);
    refresh();
  };

  if (session.isLoading) return <Skeleton className="h-[32rem] w-full" />;
  if (session.isError || !data) {
    return <WidgetError message="Couldn't load your revision." onRetry={() => void session.refetch()} />;
  }

  const s = summary ?? data.summary;
  // Remaining comes from the server after every step, so an Again that comes back mid-session is counted honestly.
  const remaining = s.sessionSize - (current && !reviewed ? 1 : 0);
  const total = done.length + (current && !reviewed ? 1 : 0) + Math.max(0, remaining);
  const position = done.length + (reviewed ? 0 : 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Smart revision</h1>
          <p className="mt-1 max-w-2xl text-sm text-app-muted">
            Puzzles you missed and topics your coach picked come back just before you&apos;d forget them. Solve
            each one, then say how well you remembered it — the better you know it, the longer until it returns.
          </p>
        </div>
        {active ? (
          <Button onClick={exit} size="sm" type="button" variant="outline">
            End session
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={CalendarCheck} label="Due today" tone="primary" value={String(s.dueToday)} />
        <StatTile icon={AlarmClock} label="Overdue" tone="warm" value={String(s.overdue)} />
        <StatTile icon={Sparkles} label="New to learn" tone="secondary" value={String(s.newAvailable)} />
        <StatTile
          context={s.streakDays > 0 ? `${s.streakDays}-day streak` : undefined}
          icon={CheckCircle2}
          label="Done today"
          tone="accent"
          value={String(s.completedToday)}
        />
      </div>

      {active && current ? (
        <RevisionItemBoard
          current={current}
          key={current.attemptId}
          loadingNext={next.isPending}
          onFinished={onFinished}
          onNext={() => requestNext()}
          onRate={(grade) => rate.mutate(grade)}
          onSkip={() => skip.mutate()}
          position={Math.max(1, position)}
          rating={rate.isPending}
          reviewed={reviewed}
          total={Math.max(1, total)}
        />
      ) : active && next.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : finished && done.length > 0 ? (
        <SessionSummary done={done} onAgain={s.sessionSize > 0 ? begin : undefined} summary={s} />
      ) : s.sessionSize > 0 ? (
        <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-lg font-extrabold text-app-text">
              {s.sessionSize} {s.sessionSize === 1 ? "item" : "items"} ready · about {Math.max(1, s.estimatedMinutes)} min
            </p>
            <p className="text-sm text-app-muted">
              {s.dueToday + s.newAvailable > s.sessionSize
                ? `There are ${s.dueToday + s.newAvailable} waiting in all; a session takes the most urgent ${s.sessionSize}. The rest stay due.`
                : "Due and overdue reviews come first, then a few new ones."}
            </p>
          </div>
          <Button onClick={begin} type="button">
            <Brain aria-hidden="true" className="mr-1.5 size-4" strokeWidth={2.5} />
            Start Revision
          </Button>
        </Card>
      ) : (
        <NothingDue summary={s} />
      )}

      <section aria-label="Your revision" className="space-y-3">
        <h2 className="text-lg font-extrabold text-app-text">Your revision</h2>
        <RevisionReportPanel hideDue studentId={null} />
      </section>
    </div>
  );
}

function NothingDue({ summary }: { summary: RevisionSummary }) {
  const tz = useUserTimeZone();
  if (summary.activeItems === 0) {
    return (
      <EmptyState
        description="Puzzles you get wrong — in class, in homework or in training — and ones your coach recommends will appear here to revise."
        icon={Brain}
        title="Nothing to revise yet"
      />
    );
  }
  return (
    <EmptyState
      description={
        summary.nextDueAt
          ? `Your next item comes back ${formatNextDue(summary.nextDueAt, tz)}.`
          : "Everything you can revise right now is done."
      }
      icon={Flame}
      title="All caught up"
    />
  );
}

function SessionSummary({
  done,
  summary,
  onAgain
}: {
  done: Done[];
  summary: RevisionSummary;
  onAgain?: () => void;
}) {
  const tz = useUserTimeZone();
  const correct = done.filter((d) => d.solved).length;
  const counts = (["AGAIN", "HARD", "GOOD", "EASY"] as const)
    .map((g) => ({ count: done.filter((d) => d.grade === g).length, grade: g }))
    .filter((c) => c.count > 0);
  return (
    <Card className="space-y-4 p-5">
      <div>
        <p className="text-lg font-extrabold text-app-text">Session complete</p>
        <p className="text-sm text-app-muted">
          {done.length} reviewed · {correct} solved · {done.length - correct} not solved ·{" "}
          {summary.sessionSize} still due now
        </p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {counts.map((c) => (
          <li className="rounded-full border border-app-border px-3 py-1 text-xs font-bold text-app-text" key={c.grade}>
            {REVISION_GRADE_LABELS[c.grade]} × {c.count}
          </li>
        ))}
      </ul>
      {summary.sessionSize === 0 && summary.nextDueAt ? (
        <p className="text-sm text-app-muted">Next item comes back {formatNextDue(summary.nextDueAt, tz)}.</p>
      ) : null}
      {onAgain ? (
        <Button onClick={onAgain} type="button" variant="outline">
          Keep going
        </Button>
      ) : null}
    </Card>
  );
}
