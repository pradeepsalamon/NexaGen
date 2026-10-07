"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreatePuzzleRequest,
  PuzzleDetail,
  PuzzleDifficulty,
  PuzzleScoring,
  PuzzleScoringOverride,
  PuzzleType,
  SolutionMove,
  UpdatePuzzleRequest
} from "@nexa-chess/types";
import { isSystemPuzzleFolder, resolvePuzzleScoring } from "@nexa-chess/types";
import { CheckCircle2, Eye, Loader2, X, XCircle } from "lucide-react";
import { FormPageShell } from "@/components/layout/FormPageShell";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { PositionEditor } from "@/features/chessboard/components/board/PositionEditor";
import { START_FEN } from "@/features/chessboard/lib/fen";
import { SolutionEditor } from "@/features/assignments/components/SolutionEditor";
import { useToast } from "@/providers/ToastProvider";
import { setPuzzlePublished, validatePuzzle } from "../api/puzzleApi";
import {
  useCreatePuzzle,
  usePuzzleScoringSettings,
  usePuzzleTopics,
  useUpdatePuzzle
} from "../hooks/usePuzzlesApi";
import { PuzzleScoringFields, PuzzleScoringPreview } from "./scoring/PuzzleScoringFields";
import {
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_OPTIONS,
  puzzleTopicOptions
} from "../lib/puzzleMeta";
import { PuzzleSolver } from "./solver/PuzzleSolver";
import { sideToMove } from "./solver/puzzleSolverEngine";
import { Switch } from "@/components/ui/Switch";

interface Props {
  mode: "create" | "edit";
  basePath: string;
  role: "admin" | "coach";
  puzzle?: PuzzleDetail;
}

const SectionHeading = ({ index, title, hint }: { index: number; title: string; hint?: string }) => (
  <div className="mb-3">
    <h2 className="text-sm font-extrabold uppercase tracking-wide text-app-muted">
      {index}. {title}
    </h2>
    {hint ? <p className="mt-0.5 text-sm text-app-muted">{hint}</p> : null}
  </div>
);

export function PuzzleForm({ mode, basePath, role, puzzle }: Props) {
  const router = useRouter();
  const toast = useToast();
  const { data: topicsData } = usePuzzleTopics();
  const createMut = useCreatePuzzle();
  const updateMut = useUpdatePuzzle();

  const [title, setTitle] = useState(puzzle?.title ?? "");
  const [description, setDescription] = useState(puzzle?.description ?? "");
  const [topicId, setTopicId] = useState(puzzle?.topicId ?? "");
  const [puzzleType, setPuzzleType] = useState<PuzzleType>(puzzle?.puzzleType ?? "TACTICAL");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>(
    puzzle?.difficulty ?? "BEGINNER"
  );
  const [fen, setFen] = useState(puzzle?.fen ?? START_FEN);
  const [solutionMoves, setSolutionMoves] = useState<SolutionMove[]>(
    puzzle?.solutionMoves ?? []
  );
  const [explanation, setExplanation] = useState(puzzle?.explanation ?? "");
  const [hints, setHints] = useState<string[]>(puzzle?.hints ?? []);
  const [tagsText, setTagsText] = useState((puzzle?.tags ?? []).join(", "));
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    puzzle?.estimatedSeconds ? String(Math.round(puzzle.estimatedSeconds / 60)) : ""
  );

  // Live-class points: an optional override on top of the admin default. Only
  // the fields the author touches are stored, so the rest keep following the
  // admin default if it changes later.
  const scoringDefaults = usePuzzleScoringSettings();
  const [customScoring, setCustomScoring] = useState(!!puzzle?.scoring);
  const [scoringOverride, setScoringOverride] = useState<PuzzleScoringOverride>(
    puzzle?.scoring ?? {}
  );
  const effectiveScoring = useMemo(
    () => resolvePuzzleScoring(scoringDefaults.data?.settings.scoring, scoringOverride),
    [scoringDefaults.data, scoringOverride]
  );
  const onScoringChange = (next: PuzzleScoring, key: keyof PuzzleScoring) =>
    setScoringOverride((prev) => ({ ...prev, [key]: next[key] }));

  const [validation, setValidation] = useState<
    { valid: boolean; error?: string } | null
  >(null);
  const [validating, setValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  // A catalogue copy's position and line are frozen (spec §3) — duplicate to edit.
  const lichessCopy = puzzle?.source === "LICHESS";
  const topicOptions = useMemo(
    () =>
      puzzleTopicOptions(
        (topicsData?.topics ?? []).filter((t) => !isSystemPuzzleFolder(t) || t.id === puzzle?.topicId)
      ),
    [topicsData, puzzle?.topicId]
  );

  const tags = useMemo(
    () =>
      tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 12),
    [tagsText]
  );

  const buildPayload = (): CreatePuzzleRequest => ({
    title: title.trim(),
    description: description.trim() || undefined,
    topicId,
    puzzleType,
    difficulty,
    fen,
    solutionMoves,
    explanation: explanation.trim() || undefined,
    hints: hints.map((h) => h.trim()).filter(Boolean),
    tags,
    estimatedSeconds: estimatedMinutes ? Number(estimatedMinutes) * 60 : undefined,
    orientation: sideToMove(fen),
    scoring: customScoring && Object.keys(scoringOverride).length > 0 ? scoringOverride : null
  });

  const missing = !title.trim() || !topicId;

  const runValidate = async () => {
    setValidating(true);
    try {
      const res = await validatePuzzle({ fen, solutionMoves });
      setValidation({ valid: res.valid, error: res.error });
      if (res.valid && res.normalizedSolution) setSolutionMoves(res.normalizedSolution);
    } catch (error) {
      setValidation({ valid: false, error: (error as Error).message });
    } finally {
      setValidating(false);
    }
  };

  const save = async (publish: boolean) => {
    if (missing) {
      toast.error({ title: "Add a title and topic before saving." });
      return;
    }
    if (publish && solutionMoves.length === 0) {
      toast.error({ title: "Record a solution line before publishing." });
      return;
    }
    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createMut.mutateAsync({
          ...buildPayload(),
          status: publish ? "PUBLISHED" : "DRAFT",
          ...(role === "admin" ? {} : { visibility: "PRIVATE" as const })
        });
        toast.success({ title: publish ? "Puzzle published" : "Draft saved" });
        router.push(`${basePath}/${created.puzzle.id}`);
      } else if (puzzle) {
        const { fen: _fen, solutionMoves: _line, ...editable } = buildPayload();
        const payload: UpdatePuzzleRequest = lichessCopy ? editable : buildPayload();
        await updateMut.mutateAsync({ id: puzzle.id, data: payload });
        if (publish && puzzle.status !== "PUBLISHED") {
          await setPuzzlePublished(puzzle.id, { published: true });
        }
        toast.success({ title: "Puzzle saved" });
        router.push(`${basePath}/${puzzle.id}`);
      }
    } catch (error) {
      toast.error({ title: "Could not save puzzle", message: (error as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormPageShell
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
            disabled={solutionMoves.length === 0}
          >
            <Eye className="size-4" strokeWidth={2.5} />
            {showPreview ? "Hide preview" : "Preview"}
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => save(false)} disabled={saving}>
            Save draft
          </Button>
          <Button type="button" size="sm" onClick={() => save(true)} disabled={saving}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Publish
          </Button>
        </>
      }
      backHref={basePath}
      backLabel="Back to puzzles"
      description="Position, solution, topic, type and difficulty — a reusable training object."
      eyebrow="Puzzle library"
      title={mode === "create" ? "New puzzle" : "Edit puzzle"}
    >

      {showPreview && solutionMoves.length > 0 && (
        <Card className="p-4">
          <SectionHeading index={0} title="Student preview" hint="Exactly how a student solves it." />
          <PuzzleSolver
            key={`${fen}-${solutionMoves.map((m) => m.uci).join(",")}`}
            fen={fen}
            solutionMoves={solutionMoves}
            hints={hints.filter(Boolean)}
            explanation={explanation || null}
          />
        </Card>
      )}

      <Card className="p-4 sm:p-6">
        <SectionHeading index={1} title="Basic information" />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pz-title" label="Puzzle title">
            <Input
              id="pz-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Winning the queen with a fork"
            />
          </FormField>
          <FormField id="pz-topic" label="Topic">
            <Select
              id="pz-topic"
              value={topicId}
              placeholder="Select a topic"
              options={topicOptions}
              onChange={(e) => setTopicId(e.target.value)}
            />
          </FormField>
          <FormField id="pz-type" label="Puzzle type">
            <Select
              id="pz-type"
              value={puzzleType}
              options={PUZZLE_TYPE_OPTIONS}
              onChange={(e) => setPuzzleType(e.target.value as PuzzleType)}
            />
          </FormField>
          <FormField id="pz-difficulty" label="Difficulty">
            <Select
              id="pz-difficulty"
              value={difficulty}
              options={PUZZLE_DIFFICULTY_OPTIONS}
              onChange={(e) => setDifficulty(e.target.value as PuzzleDifficulty)}
            />
          </FormField>
          <FormField id="pz-estimate" label="Estimated solving time (minutes)">
            <Input
              id="pz-estimate"
              type="number"
              min={1}
              max={60}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="Optional"
            />
          </FormField>
          <FormField id="pz-tags" label="Tags (comma separated)">
            <Input
              id="pz-tags"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="fork, knight, middlegame"
            />
          </FormField>
        </div>
        <div className="mt-4">
          <FormField id="pz-description" label="Description">
            <Textarea
              id="pz-description"
              value={description}
              maxLength={2000}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Shown to the student before they start."
            />
          </FormField>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionHeading
          index={2}
          title="Chess position"
          hint="Set the starting position. Side to move is the side the student plays."
        />
        {lichessCopy ? (
          <LichessLockedNote />
        ) : (
          <PositionEditor value={fen} onChange={setFen} />
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionHeading
          index={3}
          title="Solution"
          hint="Play the solution line on the board — student moves and forced replies."
        />
        {lichessCopy ? (
          <p className="text-sm text-app-text">
            {solutionMoves.map((m) => m.san).join(" ")}
          </p>
        ) : (
          <SolutionEditor
            startFen={fen}
            value={solutionMoves}
            onChange={(v) => {
              setSolutionMoves(v);
              setValidation(null);
            }}
            orientation={sideToMove(fen)}
            onImport={(line) => {
              setFen(line.startFen);
              setSolutionMoves(line.moves);
              setValidation(null);
            }}
          />
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={runValidate} disabled={validating}>
            {validating ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 size-4" strokeWidth={2.5} />
            )}
            Validate position &amp; solution
          </Button>
          {validation && (
            <span
              className={`inline-flex items-center gap-1 text-sm ${
                validation.valid ? "text-accent-ink" : "text-app-danger-ink"
              }`}
            >
              {validation.valid ? (
                <>
                  <CheckCircle2 className="size-4" strokeWidth={2.5} /> Legal
                </>
              ) : (
                <>
                  <XCircle className="size-4" strokeWidth={2.5} /> {validation.error}
                </>
              )}
            </span>
          )}
        </div>

        <div className="mt-4 grid gap-4">
          <FormField id="pz-explanation" label="Explanation (shown after solving)">
            <Textarea
              id="pz-explanation"
              value={explanation}
              maxLength={2000}
              rows={2}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Why this line works."
            />
          </FormField>
          <div>
            <p className="mb-1.5 text-sm font-medium text-app-text">Hints (progressive)</p>
            <div className="space-y-2">
              {hints.map((hint, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={hint}
                    maxLength={300}
                    onChange={(e) =>
                      setHints((h) => h.map((x, xi) => (xi === i ? e.target.value : x)))
                    }
                    placeholder={`Hint ${i + 1}`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    aria-label={`Remove hint ${i + 1}`}
                    className="size-9 shrink-0 rounded-full border-app-border p-0"
                    onClick={() => setHints((h) => h.filter((_, xi) => xi !== i))}
                  >
                    <X className="size-4" strokeWidth={2.5} />
                  </Button>
                </div>
              ))}
              {hints.length < 5 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setHints((h) => [...h, ""])}
                >
                  Add hint
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionHeading
          index={4}
          title="Live-class points"
          hint="What this puzzle is worth when a coach shares it in a class. Off = the platform default."
        />
        <Switch
          id="pz-custom-scoring"
          label="Use custom points for this puzzle"
          checked={customScoring}
          onCheckedChange={(checked) => setCustomScoring(checked === true)}
        />
        {customScoring ? (
          <div className="mt-3 space-y-4">
            <PuzzleScoringFields
              idPrefix="pz-scoring"
              value={effectiveScoring}
              onChange={onScoringChange}
            />
            <PuzzleScoringPreview scoring={effectiveScoring} />
            {Object.keys(scoringOverride).length > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setScoringOverride({})}>
                Reset to platform default
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-app-muted">
            {effectiveScoring.basePoints} pts to solve
            {effectiveScoring.wrongMovePenalty > 0
              ? `, −${effectiveScoring.wrongMovePenalty} per wrong move`
              : ""}{" "}
            (platform default).
          </p>
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionHeading index={5} title="Publishing" />
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-app-muted">Creator</dt>
            <dd className="font-medium text-app-text">
              {puzzle?.createdByName ?? (role === "admin" ? "Admin" : "You")}
            </dd>
          </div>
          <div>
            <dt className="text-app-muted">Visibility</dt>
            <dd className="font-medium text-app-text">
              {role === "admin"
                ? "Global — available to all coaches"
                : "Private — only you and admins"}
            </dd>
          </div>
          <div>
            <dt className="text-app-muted">Status</dt>
            <dd className="font-medium text-app-text">{puzzle?.status ?? "Draft"}</dd>
          </div>
        </dl>
      </Card>
    </FormPageShell>
  );
}

function LichessLockedNote() {
  return (
    <Alert variant="info">
      This puzzle comes from the Lichess catalogue, so its position and solution are fixed.
      Duplicate it to make an editable copy.
    </Alert>
  );
}
