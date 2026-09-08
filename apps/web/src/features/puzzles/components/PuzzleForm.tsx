"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CreatePuzzleRequest,
  PuzzleDetail,
  PuzzleDifficulty,
  PuzzleType,
  SolutionMove,
  UpdatePuzzleRequest
} from "@nexa-chess/types";
import { CheckCircle2, Eye, Loader2, X, XCircle } from "lucide-react";
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
import { useCreatePuzzle, usePuzzleTopics, useUpdatePuzzle } from "../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_OPTIONS
} from "../lib/puzzleMeta";
import { PuzzleSolver } from "./solver/PuzzleSolver";
import { sideToMove } from "./solver/puzzleSolverEngine";

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

  const [validation, setValidation] = useState<
    { valid: boolean; error?: string } | null
  >(null);
  const [validating, setValidating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const topicOptions = useMemo(
    () => (topicsData?.topics ?? []).map((t) => ({ value: t.id, label: t.name })),
    [topicsData]
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
    orientation: sideToMove(fen)
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
        const payload: UpdatePuzzleRequest = buildPayload();
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
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-app-text">
            {mode === "create" ? "New puzzle" : "Edit puzzle"}
          </h1>
          <p className="mt-1 text-sm text-app-muted">
            Position, solution, topic, type and difficulty — a reusable training object.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowPreview((v) => !v)}
          disabled={solutionMoves.length === 0}
        >
          <Eye className="mr-2 size-4" strokeWidth={2.5} />
          {showPreview ? "Hide preview" : "Preview"}
        </Button>
      </div>

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
        <PositionEditor value={fen} onChange={setFen} />
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionHeading
          index={3}
          title="Solution"
          hint="Play the solution line on the board — student moves and forced replies."
        />
        <SolutionEditor
          startFen={fen}
          value={solutionMoves}
          onChange={(v) => {
            setSolutionMoves(v);
            setValidation(null);
          }}
          orientation={sideToMove(fen)}
        />

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
        <SectionHeading index={4} title="Publishing" />
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

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-app-border bg-app-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-b-app">
        <Button type="button" onClick={() => save(true)} disabled={saving}>
          {saving ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          Publish
        </Button>
        <Button type="button" variant="secondary" onClick={() => save(false)} disabled={saving}>
          Save draft
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push(basePath)}
          disabled={saving}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
