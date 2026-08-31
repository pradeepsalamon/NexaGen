"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Eye, Plus, X } from "lucide-react";
import type {
  CreateBatchScheduleRequest,
  PreviewBatchScheduleResponse
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { useAssignableUsersQuery, useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import {
  useCreateScheduleMutation,
  usePreviewScheduleMutation
} from "../hooks/useBatchScheduleApi";
import { WeeklyRuleRow, type RuleDraft } from "./WeeklyRuleRow";
import { SchedulePreviewPanel } from "./SchedulePreviewPanel";
import {
  addMonthsISO,
  endDateForClassCount,
  isoDateToLocalDate,
  localDateToISODate,
  TIMEZONE_OPTIONS,
  todayISODate
} from "../lib/scheduleFormat";

let ruleCounter = 0;
const newRule = (coachId = ""): RuleDraft => ({
  key: `r${(ruleCounter += 1)}`,
  dayOfWeek: 1,
  startTime: "18:00",
  endTime: "19:00",
  coachId
});

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (Array.isArray(m)) return m.join(", ");
    if (typeof m === "string") return m;
  }
  return "Something went wrong.";
}

export function ScheduleBuilderClient() {
  const router = useRouter();
  const toast = useToast();

  const { data: batchesData } = useBatchesQuery({ pageSize: 100 });
  const { data: assignable } = useAssignableUsersQuery();
  const previewMutation = usePreviewScheduleMutation();
  const createMutation = useCreateScheduleMutation();

  const coaches = useMemo(
    () =>
      (assignable?.coaches ?? []).map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName ?? ""}`.trim()
      })),
    [assignable]
  );
  const batches = batchesData?.batches ?? [];

  const [batchId, setBatchId] = useState("");
  const [title, setTitle] = useState("");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [startDate, setStartDate] = useState(todayISODate());
  const [endDate, setEndDate] = useState(addMonthsISO(todayISODate(), 3));
  const [endMode, setEndMode] = useState<"date" | "count">("date");
  const [classCount, setClassCount] = useState("12");
  const [rules, setRules] = useState<RuleDraft[]>([newRule()]);
  const [exceptions, setExceptions] = useState<string[]>([]);
  const [exceptionDraft, setExceptionDraft] = useState("");
  const [confirmConflicts, setConfirmConflicts] = useState(false);
  const [preview, setPreview] = useState<PreviewBatchScheduleResponse | null>(null);

  const buildPayload = (): CreateBatchScheduleRequest => ({
    batchId,
    title: title.trim() || undefined,
    timezone,
    startDate,
    endDate,
    rules: rules.map((r) => ({
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      coachId: r.coachId
    })),
    exceptions: exceptions.length ? exceptions : undefined
  });

  const parsedCount = Number.parseInt(classCount, 10);
  const computedEndDate = useMemo(
    () =>
      endDateForClassCount(
        startDate,
        rules.map((r) => ({ dayOfWeek: r.dayOfWeek })),
        exceptions,
        parsedCount
      ),
    [startDate, rules, exceptions, parsedCount]
  );

  useEffect(() => {
    if (endMode !== "count") return;
    setPreview(null);
    if (computedEndDate) setEndDate(computedEndDate);
  }, [endMode, computedEndDate]);

  const countModeValid =
    endMode !== "count" ||
    (parsedCount >= 1 && parsedCount <= 500 && Boolean(computedEndDate));

  const canPreview =
    Boolean(batchId) &&
    Boolean(startDate) &&
    Boolean(endDate) &&
    countModeValid &&
    rules.length > 0 &&
    rules.every((r) => r.coachId && r.startTime && r.endTime);

  const runPreview = async () => {
    try {
      setConfirmConflicts(false);
      const result = await previewMutation.mutateAsync(buildPayload());
      setPreview(result);
    } catch (error) {
      toast.error({ title: "Preview failed", message: getErrorMessage(error) });
    }
  };

  const submit = async () => {
    try {
      const result = await createMutation.mutateAsync({
        ...buildPayload(),
        force: confirmConflicts
      });
      toast.success({
        title: "Schedule created",
        message: `${result.generatedCount ?? 0} classes generated.`
      });
      router.push(`/admin/schedule/${result.schedule.id}`);
    } catch (error) {
      toast.error({ title: "Could not create schedule", message: getErrorMessage(error) });
    }
  };

  const patchRule = (key: string, patch: Partial<RuleDraft>) =>
    setRules((prev) => {
      setPreview(null);
      return prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
    });

  const addException = () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exceptionDraft)) return;
    setPreview(null);
    setExceptions((prev) => [...new Set([...prev, exceptionDraft])].sort());
    setExceptionDraft("");
  };

  const hasBlockingConflicts = Boolean(preview && preview.conflicts.length > 0);

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-5">
        <header>
          <p className="text-xs font-extrabold uppercase text-primary">Class Scheduler</p>
          <h1 className="mt-2 text-3xl font-extrabold text-app-text">Create batch class plan</h1>
          <p className="mt-1 text-sm text-app-muted">
            Define a recurring weekly schedule and NexaGen generates every class for the period.
          </p>
        </header>

        <Card className="grid gap-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-app-muted">
              Batch
              <Select
                value={batchId}
                onChange={(e) => {
                  setBatchId(e.target.value);
                  setPreview(null);
                }}
                placeholder="Select a batch"
                options={batches.map((b) => ({ label: b.name, value: b.id }))}
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-app-muted">
              Plan title (optional)
              <Input
                value={title}
                placeholder="e.g. Intermediate Chess — Term 1"
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-app-muted">
              Timezone
              <Select
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  setPreview(null);
                }}
                options={TIMEZONE_OPTIONS.map((tz) => ({ label: tz, value: tz }))}
              />
            </label>
            <div className="grid content-start gap-3">
              <label className="grid gap-1 text-xs font-bold text-app-muted">
                Start date
                <DatePicker
                  className="w-full"
                  value={isoDateToLocalDate(startDate)}
                  onChange={(date) => {
                    setStartDate(date ? localDateToISODate(date) : "");
                    setPreview(null);
                  }}
                />
              </label>
              <div className="grid gap-1 text-xs font-bold text-app-muted">
                <div className="flex items-center justify-between gap-2">
                  <span>Ends</span>
                  <div className="flex rounded-control border border-app-border p-0.5">
                    {(["date", "count"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEndMode(mode)}
                        className={cn(
                          "rounded-[6px] px-2 py-0.5 text-[11px] font-bold transition",
                          endMode === mode
                            ? "bg-primary text-white"
                            : "text-app-muted hover:text-app-text"
                        )}
                      >
                        {mode === "date" ? "By date" : "By count"}
                      </button>
                    ))}
                  </div>
                </div>
                {endMode === "date" ? (
                  <DatePicker
                    className="w-full"
                    value={isoDateToLocalDate(endDate)}
                    onChange={(date) => {
                      setEndDate(date ? localDateToISODate(date) : "");
                      setPreview(null);
                    }}
                  />
                ) : (
                  <div className="grid gap-1">
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      value={classCount}
                      placeholder="Total number of classes"
                      onChange={(e) => {
                        setClassCount(e.target.value);
                        setPreview(null);
                      }}
                    />
                    <span className="font-normal text-app-muted">
                      {computedEndDate
                        ? `Ends ${isoDateToLocalDate(computedEndDate)?.toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric"
                          })}`
                        : "Add a weekly class to estimate the end date"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-extrabold text-app-text">Weekly classes</p>
            {rules.map((rule) => (
              <WeeklyRuleRow
                key={rule.key}
                rule={rule}
                coaches={coaches}
                canRemove={rules.length > 1}
                onChange={(patch) => patchRule(rule.key, patch)}
                onRemove={() =>
                  setRules((prev) => {
                    setPreview(null);
                    return prev.filter((r) => r.key !== rule.key);
                  })
                }
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              onClick={() =>
                setRules((prev) => {
                  setPreview(null);
                  return [...prev, newRule(prev[prev.length - 1]?.coachId ?? "")];
                })
              }
            >
              <Plus className="size-4" aria-hidden="true" />
              Add another day
            </Button>
          </div>

          <div className="grid gap-2">
            <p className="text-sm font-extrabold text-app-text">
              Excluded dates <span className="font-normal text-app-muted">(holidays / breaks)</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                className="w-52"
                placeholder="Pick a date"
                value={isoDateToLocalDate(exceptionDraft)}
                onChange={(date) =>
                  setExceptionDraft(date ? localDateToISODate(date) : "")
                }
              />
              <Button variant="outline" size="sm" onClick={addException}>
                Add
              </Button>
              {exceptions.map((date) => (
                <Badge key={date} variant="secondary" className="gap-1">
                  {date}
                  <button
                    aria-label={`Remove ${date}`}
                    onClick={() => {
                      setPreview(null);
                      setExceptions((prev) => prev.filter((d) => d !== date));
                    }}
                  >
                    <X className="size-3" aria-hidden="true" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 border-t border-app-border pt-4">
            <Button
              variant="outline"
              onClick={runPreview}
              disabled={!canPreview}
              isLoading={previewMutation.isPending}
            >
              <Eye className="size-4" aria-hidden="true" />
              Preview plan
            </Button>
            <Button
              onClick={submit}
              disabled={!preview || (hasBlockingConflicts && !confirmConflicts)}
              isLoading={createMutation.isPending}
            >
              <CalendarPlus className="size-4" aria-hidden="true" />
              Generate {preview ? `${preview.futureCount} classes` : "class plan"}
            </Button>
            {hasBlockingConflicts && (
              <label className="flex items-center gap-2 text-xs font-bold text-app-danger">
                <Checkbox
                  checked={confirmConflicts}
                  onCheckedChange={(v) => setConfirmConflicts(Boolean(v))}
                />
                Create despite conflicts
              </label>
            )}
          </div>
        </Card>

        {preview && (
          <SchedulePreviewPanel preview={preview} timezone={timezone} />
        )}
      </div>
    </main>
  );
}
