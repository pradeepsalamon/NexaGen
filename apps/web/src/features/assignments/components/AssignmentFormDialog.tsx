"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
  resolvePuzzleLeaderboard,
  resolvePuzzleScoring,
  type AssignmentActivityType,
  type AssignmentLibraryItem,
  type CoachBatch,
  type CreateAssignmentRequest,
  type PuzzleLeaderboardOverride,
  type PuzzleScoringOverride,
  type SolutionMove,
  type UpdateAssignmentRequest
} from "@nexa-chess/types";
import { ChevronDown, Trophy, Upload } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { PositionEditor } from "@/features/chessboard/components/board/PositionEditor";
import { START_FEN } from "@/features/chessboard/lib/fen";
import { createAssignment, deleteAssignment, updateAssignment } from "../api/assignmentApi";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";
import { SolutionEditor } from "./SolutionEditor";
import { Switch } from "@/components/ui/Switch";
import {
  PuzzleLeaderboardFields,
  PuzzleScoringFields,
  PuzzleScoringPreview
} from "@/features/puzzles/components/scoring/PuzzleScoringFields";
import { usePuzzleScoringSettings } from "@/features/puzzles/hooks/usePuzzlesApi";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { PuzzleSetEditor, type SelectedSetPuzzle } from "./puzzle-set/PuzzleSetEditor";

function toUpdatePayload(assignment: AssignmentLibraryItem): UpdateAssignmentRequest {
  if (assignment.activityType === "PUZZLE_SET") {
    return {
      title: assignment.title,
      description: assignment.description,
      difficulty: assignment.difficulty,
      timeLimitMinutes: assignment.timeLimitMinutes ?? undefined,
      activityType: "PUZZLE_SET",
      puzzleIds: (assignment.puzzles ?? []).map((p) => p.puzzleId),
      scoring: assignment.scoring ?? {},
      leaderboard: assignment.leaderboard ?? {},
      maxAttempts: assignment.maxAttempts,
      allowHints: assignment.allowHints,
      allowRetry: assignment.allowRetry
    };
  }
  return {
    title: assignment.title,
    description: assignment.description,
    pgn: assignment.pgn,
    difficulty: assignment.difficulty,
    timeLimitMinutes: assignment.timeLimitMinutes ?? undefined,
    activityType: assignment.activityType,
    startFen: assignment.startFen ?? undefined,
    solutionMoves: assignment.solutionMoves ?? undefined,
    orientation: assignment.orientation ?? undefined,
    studentColor: assignment.studentColor ?? undefined,
    engineLevel: assignment.engineLevel ?? undefined,
    passThresholdPercent: assignment.passThresholdPercent,
    maxAttempts: assignment.maxAttempts,
    allowHints: assignment.allowHints,
    allowRetry: assignment.allowRetry,
    requiredCompletionPercent: assignment.requiredCompletionPercent
  };
}

type FormValues = {
  title: string;
  description: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  timeLimitMinutes: string;
  pgn: string;
  batchIds: string[];
  dueDate: string;
  activityType: AssignmentActivityType;
  startFen: string;
  solutionMoves: SolutionMove[];
  studentColor: "white" | "black";
  engineLevel: string;
  maxAttempts: string;
  passThresholdPercent: string;
  allowRetry: boolean;
  allowHints: boolean;
  puzzles: SelectedSetPuzzle[];
  /** Only the fields the author changed; the rest inherit (admin default → each puzzle's own). */
  scoring: PuzzleScoringOverride;
  leaderboard: PuzzleLeaderboardOverride;
};

const DIFFICULTY_OPTIONS = [
  { label: "Beginner", value: "BEGINNER" },
  { label: "Intermediate", value: "INTERMEDIATE" },
  { label: "Advanced", value: "ADVANCED" }
];

const ACTIVITY_OPTIONS = [
  { label: "Study PGN", value: "REPLAY" },
  { label: "Solve position", value: "SOLVE_LINE" },
  { label: "Play vs engine", value: "PLAY_VS_ENGINE" },
  { label: "Free analysis", value: "FREE_ANALYSIS" },
  { label: "Puzzle set (several puzzles)", value: "PUZZLE_SET" }
];

const ENGINE_LEVELS = [
  { label: "Beginner (level 2)", value: "2" },
  { label: "Casual (level 5)", value: "5" },
  { label: "Club (level 10)", value: "10" },
  { label: "Strong (level 15)", value: "15" },
  { label: "Max (level 20)", value: "20" }
];

const DEFAULTS: FormValues = {
  title: "",
  description: "",
  difficulty: "BEGINNER",
  timeLimitMinutes: "",
  pgn: "",
  batchIds: [],
  dueDate: "",
  activityType: "REPLAY",
  startFen: START_FEN,
  solutionMoves: [],
  studentColor: "white",
  engineLevel: "5",
  maxAttempts: "3",
  passThresholdPercent: "100",
  allowRetry: true,
  allowHints: false,
  puzzles: [],
  scoring: {},
  leaderboard: {}
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  assignment?: AssignmentLibraryItem | null;
  coachBatches?: CoachBatch[];
  /** Prefill the starting position on create (e.g. from a live-class board). */
  initialFen?: string;
  /** Prefill the activity type on create. */
  initialActivityType?: AssignmentActivityType;
  /** Prefill a SOLVE_LINE's solution on create (e.g. a catalogue puzzle's line). */
  initialSolutionMoves?: SolutionMove[];
  /** Prefill the title on create. */
  initialTitle?: string;
}

export function AssignmentFormDialog({
  open,
  onOpenChange,
  mode,
  assignment,
  coachBatches,
  initialFen,
  initialActivityType,
  initialSolutionMoves,
  initialTitle
}: Props) {
  const { run: runCreate, isPending: isCreating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (payload: CreateAssignmentRequest) => {
      const result = await createAssignment(payload);
      onOpenChange(false);
      return result;
    },
    undo: (_vars, result) => deleteAssignment(result.assignment.id),
    toast: (vars) => ({ title: `"${vars.title}" created` }),
    invalidates: [queryKeys.assignments.all]
  });

  const { run: runUpdate, isPending: isUpdating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (vars: { id: string; payload: UpdateAssignmentRequest; previous: AssignmentLibraryItem }) => {
      const result = await updateAssignment(vars.id, vars.payload);
      onOpenChange(false);
      return result;
    },
    undo: (vars) => updateAssignment(vars.id, toUpdatePayload(vars.previous)),
    toast: () => ({ title: "Assignment updated" }),
    invalidates: [queryKeys.assignments.all]
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assignNow, setAssignNow] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);
  // An admin's set is a shared library item, so it may hold global puzzles only.
  const isAdmin = isStaffRole(useAuthStore((state) => state.user?.role));

  const form = useForm<FormValues>({ defaultValues: DEFAULTS });

  useEffect(() => {
    if (!open) return;
    setAssignNow(false);
    if (mode === "edit" && assignment) {
      form.reset({
        ...DEFAULTS,
        title: assignment.title,
        description: assignment.description ?? "",
        difficulty: assignment.difficulty,
        timeLimitMinutes: assignment.timeLimitMinutes ? String(assignment.timeLimitMinutes) : "",
        pgn: assignment.pgn,
        activityType: assignment.activityType,
        startFen: assignment.startFen ?? START_FEN,
        solutionMoves: assignment.solutionMoves ?? [],
        studentColor: assignment.studentColor ?? "white",
        engineLevel: assignment.engineLevel ? String(assignment.engineLevel) : "5",
        maxAttempts: assignment.maxAttempts ? String(assignment.maxAttempts) : "",
        passThresholdPercent: String(assignment.passThresholdPercent ?? 100),
        allowRetry: assignment.allowRetry,
        allowHints: assignment.allowHints,
        puzzles: (assignment.puzzles ?? []).map((p) => ({
          difficulty: p.difficulty,
          puzzleId: p.puzzleId,
          title: p.title,
          topicName: p.topicName
        })),
        scoring: assignment.scoring ?? {},
        leaderboard: assignment.leaderboard ?? {}
      });
    } else {
      form.reset({
        ...DEFAULTS,
        title: initialTitle ?? DEFAULTS.title,
        activityType: initialActivityType ?? DEFAULTS.activityType,
        startFen: initialFen ?? DEFAULTS.startFen,
        solutionMoves: initialSolutionMoves ?? DEFAULTS.solutionMoves,
        studentColor: initialFen && initialFen.includes(" b ") ? "black" : "white"
      });
    }
  }, [open, mode, assignment, form, initialFen, initialActivityType, initialSolutionMoves, initialTitle]);

  const errors = form.formState.errors;
  const isPending = isCreating || isUpdating;
  const canAssignOnCreate = mode === "create" && !!coachBatches && coachBatches.length > 0;
  const activityType = form.watch("activityType");
  const startFen = form.watch("startFen");
  const isSet = activityType === "PUZZLE_SET";
  const scoringOverride = form.watch("scoring");
  const leaderboardOverride = form.watch("leaderboard");
  const scoringDefaults = usePuzzleScoringSettings(open && isSet);
  // What the fields show: the admin default plus the author's changes. A
  // puzzle's own points still apply server-side to any field left alone.
  const setTries = form.watch("maxAttempts");
  const shownScoring = useMemo(
    () =>
      resolvePuzzleScoring(scoringDefaults.data?.settings.scoring, scoringOverride, {
        // A set's tries come from its own "Tries per puzzle" field.
        maxAttempts: setTries ? Math.max(1, parseInt(setTries, 10) || 1) : null
      }),
    [scoringDefaults.data, scoringOverride, setTries]
  );
  const shownLeaderboard = useMemo(
    () => resolvePuzzleLeaderboard(scoringDefaults.data?.settings.leaderboard, leaderboardOverride),
    [scoringDefaults.data, leaderboardOverride]
  );
  const pointsCustomized =
    Object.keys(scoringOverride ?? {}).length + Object.keys(leaderboardOverride ?? {}).length > 0;

  const handleFile = async (file: File) => {
    const text = await file.text();
    form.setValue("pgn", text, { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors();
    if (!values.title.trim()) {
      form.setError("title", { message: "Title is required." });
      return;
    }
    if (values.activityType === "REPLAY" && !values.pgn.trim()) {
      form.setError("pgn", { message: "PGN is required." });
      return;
    }
    if (values.activityType === "SOLVE_LINE" && values.solutionMoves.length === 0) {
      form.setError("solutionMoves", { message: "Record at least one solution move." });
      return;
    }
    if (values.activityType === "PUZZLE_SET" && values.puzzles.length === 0) {
      form.setError("puzzles", { message: "Add at least one puzzle." });
      return;
    }

    const base = {
      title: values.title.trim(),
      description: values.description.trim() || undefined,
      difficulty: values.difficulty,
      timeLimitMinutes: values.timeLimitMinutes ? parseInt(values.timeLimitMinutes, 10) : undefined
    };

    const activity: Partial<CreateAssignmentRequest> = { activityType: values.activityType };
    if (values.activityType === "REPLAY") {
      activity.pgn = values.pgn;
    } else if (values.activityType === "PUZZLE_SET") {
      activity.puzzleIds = values.puzzles.map((p) => p.puzzleId);
      activity.maxAttempts = values.maxAttempts ? parseInt(values.maxAttempts, 10) : null;
      activity.allowRetry = true;
      activity.allowHints = values.allowHints;
      activity.scoring = values.scoring;
      activity.leaderboard = values.leaderboard;
    } else {
      activity.startFen = values.startFen;
      activity.studentColor = values.studentColor;
      activity.orientation = values.studentColor;
    }
    if (values.activityType === "SOLVE_LINE") {
      activity.solutionMoves = values.solutionMoves;
      activity.maxAttempts = values.maxAttempts ? parseInt(values.maxAttempts, 10) : null;
      activity.passThresholdPercent = parseInt(values.passThresholdPercent, 10) || 100;
      activity.allowRetry = values.allowRetry;
      activity.allowHints = values.allowHints;
    }
    if (values.activityType === "PLAY_VS_ENGINE") {
      activity.engineLevel = parseInt(values.engineLevel, 10) || 5;
      activity.passThresholdPercent = parseInt(values.passThresholdPercent, 10) || 100;
    }

    if (mode === "edit" && assignment) {
      runUpdate({
        id: assignment.id,
        payload: {
          ...base,
          description: values.description.trim() || null,
          ...activity
        },
        previous: assignment
      });
      return;
    }

    const deploying = canAssignOnCreate && assignNow && values.batchIds.length > 0;
    if (canAssignOnCreate && assignNow) {
      if (values.batchIds.length === 0) {
        form.setError("batchIds", { message: "Select at least one batch." });
        return;
      }
      if (!values.dueDate) {
        form.setError("dueDate", { message: "A due date is required." });
        return;
      }
    }

    runCreate({
        ...base,
        ...activity,
        batchIds: deploying ? values.batchIds : undefined,
        dueDate: deploying ? values.dueDate : undefined
      } as CreateAssignmentRequest);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={`${isSet ? "sm:max-w-[960px]" : "sm:max-w-[720px]"} max-h-[90vh] overflow-y-auto`}
      >
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit assignment" : "New assignment"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update this assignment. Changes apply everywhere it is used."
              : "Choose an activity, then configure the position or line."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <FormField id="title" label="Title" error={errors.title?.message as string | undefined}>
            <Input id="title" hasError={!!errors.title} {...form.register("title")} placeholder="e.g. Back-rank mate" />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="activityType" label="Activity type">
              <Controller
                control={form.control}
                name="activityType"
                render={({ field }) => (
                  <Select
                    id="activityType"
                    options={ACTIVITY_OPTIONS}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                )}
              />
            </FormField>

            <FormField id="difficulty" label="Difficulty">
              <Controller
                control={form.control}
                name="difficulty"
                render={({ field }) => (
                  <Select
                    id="difficulty"
                    options={DIFFICULTY_OPTIONS}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                )}
              />
            </FormField>
          </div>

          <FormField
            id="timeLimitMinutes"
            label="Time limit (minutes, optional)"
            error={errors.timeLimitMinutes?.message as string | undefined}
          >
            <Input
              id="timeLimitMinutes"
              type="number"
              min="1"
              max="180"
              {...form.register("timeLimitMinutes")}
              placeholder="e.g. 30"
            />
          </FormField>

          <FormField
            id="description"
            label="Instructions (optional)"
            error={errors.description?.message as string | undefined}
          >
            <Textarea
              id="description"
              rows={2}
              {...form.register("description")}
              placeholder="What should the student focus on?"
            />
          </FormField>

          {activityType === "REPLAY" && (
            <FormField id="pgn" label="PGN" error={errors.pgn?.message as string | undefined}>
              <Textarea
                id="pgn"
                rows={6}
                className="font-mono text-xs"
                hasError={!!errors.pgn}
                {...form.register("pgn")}
                placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ..."
              />
              <div className="mt-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pgn"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.target.value = "";
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="mr-2 size-4" strokeWidth={2.5} />
                  Upload .pgn file
                </Button>
              </div>
            </FormField>
          )}

          {isSet && (
            <>
              <Controller
                control={form.control}
                name="puzzles"
                render={({ field }) => (
                  <PuzzleSetEditor
                    value={field.value}
                    onChange={(next) => {
                      field.onChange(next);
                      if (next.length > 0) form.clearErrors("puzzles");
                    }}
                    globalOnly={isAdmin}
                    error={errors.puzzles?.message as string | undefined}
                  />
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="setMaxAttempts" label="Tries per puzzle (blank = unlimited)">
                  <Input id="setMaxAttempts" type="number" min="1" max="50" {...form.register("maxAttempts")} />
                </FormField>
                <div className="flex items-end pb-2">
                  <Controller
                    control={form.control}
                    name="allowHints"
                    render={({ field }) => (
                      <Switch
                        id="setAllowHints"
                        label="Allow hints (each one costs points)"
                        checked={field.value}
                        onCheckedChange={(v) => field.onChange(v === true)}
                      />
                    )}
                  />
                </div>
              </div>

              <div className="rounded-app border border-app-border">
                <button
                  type="button"
                  onClick={() => setPointsOpen((v) => !v)}
                  aria-expanded={pointsOpen}
                  className="flex w-full items-center gap-2 p-3 text-left text-sm font-semibold text-primary-ink"
                >
                  <Trophy className="size-4" strokeWidth={2.5} />
                  Points &amp; leaderboard
                  {pointsCustomized ? <Badge variant="secondary">Custom</Badge> : null}
                  <ChevronDown
                    className={`ml-auto size-4 transition-transform ${pointsOpen ? "rotate-180" : ""}`}
                    strokeWidth={2.5}
                  />
                </button>
                {pointsOpen ? (
                  <div className="space-y-4 border-t border-app-border p-3">
                    <PuzzleScoringFields
                      idPrefix="set-scoring"
                      hideTries
                      value={shownScoring}
                      onChange={(next, key) =>
                        form.setValue("scoring", { ...form.getValues("scoring"), [key]: next[key] })
                      }
                    />
                    <PuzzleScoringPreview scoring={shownScoring} />
                    <PuzzleLeaderboardFields
                      idPrefix="set-lb"
                      value={shownLeaderboard}
                      onChange={(next, key) =>
                        form.setValue("leaderboard", { ...form.getValues("leaderboard"), [key]: next[key] })
                      }
                    />
                    <p className="text-xs text-app-muted">
                      Applies to every puzzle in the set. Fields you don&apos;t change use each
                      puzzle&apos;s own points, else the platform default. &ldquo;After the puzzle
                      ends&rdquo; means after the due date.
                    </p>
                    {pointsCustomized ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          form.setValue("scoring", {});
                          form.setValue("leaderboard", {});
                        }}
                      >
                        Reset to defaults
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          )}

          {activityType !== "REPLAY" && !isSet && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-app-text">Starting position</p>
                <Controller
                  control={form.control}
                  name="startFen"
                  render={({ field }) => (
                    <PositionEditor value={field.value} onChange={field.onChange} />
                  )}
                />
              </div>

              <FormField id="studentColor" label="Student plays">
                <Controller
                  control={form.control}
                  name="studentColor"
                  render={({ field }) => (
                    <Select
                      id="studentColor"
                      options={[
                        { label: "White", value: "white" },
                        { label: "Black", value: "black" }
                      ]}
                      value={field.value}
                      onChange={(e) => field.onChange(e.target.value)}
                    />
                  )}
                />
              </FormField>
            </>
          )}

          {activityType === "SOLVE_LINE" && (
            <>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-app-text">Correct solution</p>
                {errors.solutionMoves && (
                  <p className="text-xs text-red-600">{errors.solutionMoves.message as string}</p>
                )}
                <Controller
                  control={form.control}
                  name="solutionMoves"
                  render={({ field }) => (
                    <SolutionEditor
                      startFen={startFen}
                      value={field.value}
                      onChange={field.onChange}
                      orientation={form.watch("studentColor")}
                      onImport={(line) => {
                        form.setValue("startFen", line.startFen, { shouldDirty: true });
                        form.setValue("studentColor", line.startFen.includes(" b ") ? "black" : "white");
                        field.onChange(line.moves);
                      }}
                    />
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="maxAttempts" label="Maximum attempts (blank = unlimited)">
                  <Input id="maxAttempts" type="number" min="1" max="50" {...form.register("maxAttempts")} />
                </FormField>
                <FormField id="passThresholdPercent" label="Pass threshold (%)">
                  <Input
                    id="passThresholdPercent"
                    type="number"
                    min="1"
                    max="100"
                    {...form.register("passThresholdPercent")}
                  />
                </FormField>
              </div>

              <div className="flex flex-wrap gap-4">
                <Controller
                  control={form.control}
                  name="allowRetry"
                  render={({ field }) => (
                    <Switch
                      id="allowRetry"
                      label="Allow retry of a wrong move"
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="allowHints"
                  render={({ field }) => (
                    <Switch
                      id="allowHints"
                      label="Allow progressive hints (piece → square → move)"
                      checked={field.value}
                      onCheckedChange={(v) => field.onChange(v === true)}
                    />
                  )}
                />
              </div>
            </>
          )}

          {activityType === "PLAY_VS_ENGINE" && (
            <FormField id="engineLevel" label="Engine level">
              <Controller
                control={form.control}
                name="engineLevel"
                render={({ field }) => (
                  <Select
                    id="engineLevel"
                    options={ENGINE_LEVELS}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                  />
                )}
              />
            </FormField>
          )}

          {activityType === "FREE_ANALYSIS" && (
            <p className="rounded-app border border-app-border bg-app-background/50 p-3 text-xs text-app-muted">
              The student explores freely from the starting position and submits when done.
            </p>
          )}

          {canAssignOnCreate && (
            <div className="rounded-app border border-app-border bg-app-background/50 p-3">
              <Switch
                id="assignNow"
                label="Assign to my batches now"
                checked={assignNow}
                onCheckedChange={(v) => setAssignNow(v === true)}
              />

              {assignNow && (
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2">
                    <p className="text-sm font-medium text-app-text">Batches</p>
                    <Controller
                      control={form.control}
                      name="batchIds"
                      render={({ field }) => (
                        <div className="grid gap-1.5">
                          {coachBatches!.map((batch) => {
                            const checked = field.value.includes(batch.id);
                            return (
                              <Checkbox
                                key={batch.id}
                                id={`batch-${batch.id}`}
                                label={batch.name}
                                checked={checked}
                                onCheckedChange={(v) =>
                                  field.onChange(
                                    v === true
                                      ? [...field.value, batch.id]
                                      : field.value.filter((bId) => bId !== batch.id)
                                  )
                                }
                              />
                            );
                          })}
                        </div>
                      )}
                    />
                  </div>

                  <FormField
                    id="dueDate"
                    label="Due date"
                    error={errors.dueDate?.message as string | undefined}
                  >
                    <Controller
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <DatePicker
                          withTime
                          value={field.value ? new Date(field.value) : undefined}
                          onChange={(date) => field.onChange(date ? date.toISOString() : "")}
                        />
                      )}
                    />
                  </FormField>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : mode === "edit" ? "Save changes" : "Create assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
