"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageCircle, Pencil, RotateCcw, Search } from "lucide-react";
import {
  DAILY_PUZZLE_BANDS,
  DAILY_PUZZLE_LEVEL_LABELS,
  DAILY_PUZZLE_LEVELS,
  type DailyPuzzleScheduleSlot,
  type DailyPuzzleSource,
  type DailyPuzzleWhatsAppSummary
} from "@nexa-chess/types";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { formatLongDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { titleWithoutRating } from "../lib/puzzleTitle";
import { useDailyPuzzleSchedule, useSetDailyPuzzleOverride, useUpdateDailyPuzzleSwitch } from "../hooks/useDailyPuzzle";

const SOURCE_LABELS: Record<DailyPuzzleSource, string> = {
  ACADEMY: "Academy pick",
  AUTO: "Automatic",
  BATCH: "Batch pick"
};

type Scope = { id: string | null; label: string };

/**
 * The next 14 days of Puzzle of the Day for the academy (admins) or one batch
 * (admins and the batch's coaches): what each level shows and where it comes
 * from, with Change / Reset per slot and the on/off switch. Days are the
 * academy's calendar days, shown as dates (docs/PUZZLE_OF_THE_DAY.md).
 */
export function DailyPuzzleScheduleManager({ scopes }: { scopes: Scope[] }) {
  const [scopeId, setScopeId] = useState<string | null>(scopes[0]?.id ?? null);
  const schedule = useDailyPuzzleSchedule(scopeId, { enabled: scopes.length > 0 });
  const toggle = useUpdateDailyPuzzleSwitch();
  const setOverride = useSetDailyPuzzleOverride();
  const [editing, setEditing] = useState<DailyPuzzleScheduleSlot | null>(null);

  if (scopes.length === 0) {
    return <EmptyState description="Puzzle of the Day is set per batch; you have no batches yet." title="No batches" />;
  }

  const data = schedule.data;
  const scopeEnabled = data ? (data.batchId ? data.batchEnabled : data.academyEnabled) : null;
  const days = data ? [...new Set(data.slots.map((s) => s.day))] : [];

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end justify-between gap-4 p-4">
        {scopes.length > 1 ? (
          <FormField id="dailyPuzzleScope" label="Schedule for">
            <Select
              className="w-auto min-w-56"
              id="dailyPuzzleScope"
              onChange={(event) => setScopeId(event.target.value || null)}
              options={scopes.map((s) => ({ label: s.label, value: s.id ?? "" }))}
              value={scopeId ?? ""}
            />
          </FormField>
        ) : (
          <p className="font-bold text-app-text">{scopes[0].label}</p>
        )}
        {data && scopeEnabled !== null ? (
          <Switch
            checked={scopeEnabled}
            disabled={toggle.isPending}
            id="dailyPuzzleEnabled"
            label={scopeEnabled ? "Puzzle of the Day is on" : "Puzzle of the Day is off"}
            onCheckedChange={(enabled) => toggle.mutate({ batchId: data.batchId, enabled })}
          />
        ) : null}
      </Card>

      {data?.whatsapp ? <WhatsAppSummary summary={data.whatsapp} /> : null}

      {data && data.batchId && !data.academyEnabled ? (
        <p className="text-sm text-app-muted">The academy has Puzzle of the Day off, so no batch gets it right now.</p>
      ) : null}

      {schedule.isError ? (
        <WidgetError message="Couldn't load the schedule." onRetry={() => void schedule.refetch()} />
      ) : !data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="space-y-3">
          {days.map((day) => (
            <Card className="p-4" key={day}>
              <p className="mb-3 text-sm font-bold text-app-text">
                {formatLongDate(`${day}T00:00:00Z`, "UTC")}
                {day === data.today ? <span className="ml-2 text-xs font-medium text-app-muted">Today</span> : null}
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                {DAILY_PUZZLE_LEVELS.map((level) => {
                  const slot = data.slots.find((s) => s.day === day && s.level === level)!;
                  return (
                    <SlotCell
                      key={level}
                      onChange={() => setEditing(slot)}
                      onReset={() =>
                        setOverride.mutate({ batchId: data.batchId ?? undefined, day, level, puzzleId: null })
                      }
                      slot={slot}
                    />
                  );
                })}
              </div>
            </Card>
          ))}
        </div>
      )}

      <PickPuzzleDialog
        batchId={data?.batchId ?? null}
        onClose={() => setEditing(null)}
        onPick={async (puzzleId) => {
          if (!editing) return;
          try {
            await setOverride.mutateAsync({
              batchId: data?.batchId ?? undefined,
              day: editing.day,
              level: editing.level,
              puzzleId
            });
            setEditing(null);
          } catch {
            // The hook's toast says why; the dialog stays open.
          }
        }}
        slot={editing}
      />
    </div>
  );
}

function SlotCell({
  onChange,
  onReset,
  slot
}: {
  onChange: () => void;
  onReset: () => void;
  slot: DailyPuzzleScheduleSlot;
}) {
  const label = DAILY_PUZZLE_LEVEL_LABELS[slot.level];
  return (
    <div className="flex items-start justify-between gap-2 rounded-control border border-app-border bg-app-soft p-3">
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold text-app-muted">{label}</p>
        {slot.puzzle ? (
          <p className="truncate text-sm font-medium text-app-text">
            {titleWithoutRating(slot.puzzle.title, slot.puzzle.rating)}
            {slot.puzzle.rating ? <span className="text-app-muted"> · {slot.puzzle.rating}</span> : null}
          </p>
        ) : (
          <p className="text-sm text-app-muted">Picked automatically on the day</p>
        )}
        {slot.source ? (
          <Badge variant={slot.overridden ? "accent" : "secondary"}>{SOURCE_LABELS[slot.source]}</Badge>
        ) : null}
      </div>
      <div className="flex shrink-0 gap-1">
        <SimpleTooltip label={`Choose the ${label.toLowerCase()} puzzle`}>
          <Button aria-label={`Choose the ${label.toLowerCase()} puzzle`} className="size-8" onClick={onChange} size="icon" type="button" variant="neutral">
            <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
        {slot.overridden ? (
          <SimpleTooltip label="Back to the automatic pick">
            <Button aria-label={`Reset the ${label.toLowerCase()} puzzle`} className="size-8" onClick={onReset} size="icon" type="button" variant="neutral">
              <RotateCcw aria-hidden="true" className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        ) : null}
      </div>
    </div>
  );
}

/** Search the library for a published puzzle to use for one day and level. */
function PickPuzzleDialog({
  batchId,
  onClose,
  onPick,
  slot
}: {
  batchId: string | null;
  onClose: () => void;
  onPick: (puzzleId: string) => Promise<void>;
  slot: DailyPuzzleScheduleSlot | null;
}) {
  const [search, setSearch] = useState("");
  const results = useQuery({
    enabled: slot !== null,
    queryFn: () => getPuzzles({ pageSize: 20, search: search.trim() || undefined, status: "PUBLISHED" }),
    queryKey: queryKeys.dailyPuzzle.pick(search.trim())
  });
  const band = slot ? DAILY_PUZZLE_BANDS[slot.level] : null;

  return (
    <Dialog onOpenChange={(open) => (open ? undefined : onClose())} open={slot !== null}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose a puzzle</DialogTitle>
          <DialogDescription>
            {slot && band
              ? `${DAILY_PUZZLE_LEVEL_LABELS[slot.level]} on ${formatLongDate(`${slot.day}T00:00:00Z`, "UTC")}. This level is usually rated ${band[0]}–${band[1] - 1}.`
              : null}
            {batchId ? " Only this batch's students get it." : " Every batch gets it unless its coach picks another."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" strokeWidth={2.5} />
          <Input
            aria-label="Search puzzles"
            className="pl-9"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by title"
            value={search}
          />
        </div>
        {results.isError ? (
          <WidgetError message="Couldn't search the library." onRetry={() => void results.refetch()} />
        ) : !results.data ? (
          <Skeleton className="h-40 w-full" />
        ) : results.data.puzzles.length === 0 ? (
          <p className="text-sm text-app-muted">No published puzzles match.</p>
        ) : (
          <ul className="divide-y divide-app-border">
            {results.data.puzzles.map((p) => {
              const inBand = band && p.rating !== null && p.rating >= band[0] && p.rating < band[1];
              return (
                <li className="flex items-center justify-between gap-3 py-2" key={p.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-app-text">{titleWithoutRating(p.title, p.rating)}</p>
                    <p className={cn("text-xs", inBand ? "text-success-ink" : "text-app-muted")}>
                      {p.rating ? `Rated ${p.rating}` : "No rating"} · {p.topicName}
                      {p.visibility === "PRIVATE" ? " · private" : ""}
                    </p>
                  </div>
                  <Button onClick={() => void onPick(p.id)} size="sm" type="button" variant="outline">
                    Use
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Step 2 at a glance: whether the WhatsApp send is on and how many numbers it
 * reaches (each message costs the academy). Settings live with the other
 * messaging rules.
 */
function WhatsAppSummary({ summary }: { summary: DailyPuzzleWhatsAppSummary }) {
  const numbers = summary.appStudents + summary.keywordNumbers;
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-start gap-3">
        <MessageCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-app-muted" strokeWidth={2.5} />
        <div className="min-w-0">
          <p className="font-bold text-app-text">
            On WhatsApp: {summary.sending ? summary.schedule : "off"}
          </p>
          <p className="text-sm text-app-muted">
            {summary.appStudents} {summary.appStudents === 1 ? "student" : "students"} turned it on in the app,{" "}
            {summary.keywordNumbers} {summary.keywordNumbers === 1 ? "number" : "numbers"} sent PUZZLE.
            {summary.sending ? ` Up to ${numbers} ${numbers === 1 ? "message" : "messages"} a send day.` : ""}
          </p>
        </div>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/admin/messaging">WhatsApp settings</Link>
      </Button>
    </Card>
  );
}
