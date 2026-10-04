"use client";

import { useMemo, useRef, useState } from "react";
import {
  MAX_PUZZLE_IMPORT,
  MAX_PUZZLE_SOLUTION_MOVES,
  isLichessFolder,
  type CreatePuzzleRequest,
  type PuzzleDifficulty,
  type PuzzleType
} from "@nexa-chess/types";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { parsePgnGames, type ImportedPgnGame } from "@/features/assignments/lib/importLine";
import { useToast } from "@/providers/ToastProvider";
import { useImportPuzzles, usePuzzleTopics } from "../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_OPTIONS,
  PUZZLE_TYPE_OPTIONS,
  puzzleTopicOptions
} from "../lib/puzzleMeta";
import { sideToMove } from "./solver/puzzleSolverEngine";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "admin" | "coach";
}

export function PuzzleImportDialog({ open, onOpenChange, role }: Props) {
  const toast = useToast();
  const { data: topicsData } = usePuzzleTopics();
  const importMut = useImportPuzzles();
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [games, setGames] = useState<ImportedPgnGame[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [topicId, setTopicId] = useState("");
  const [puzzleType, setPuzzleType] = useState<PuzzleType>("TACTICAL");
  const [difficulty, setDifficulty] = useState<PuzzleDifficulty>("BEGINNER");
  const [publish, setPublish] = useState(false);

  const topicOptions = useMemo(
    () => puzzleTopicOptions((topicsData?.topics ?? []).filter((t) => !isLichessFolder(t))),
    [topicsData]
  );

  const reset = () => {
    setText("");
    setGames(null);
    setSelected(new Set());
  };

  const load = (raw: string) => {
    const parsed = parsePgnGames(raw);
    if (parsed.length === 0) {
      toast.error({ title: "No games found in that PGN." });
      return;
    }
    setGames(parsed);
    setSelected(new Set(parsed.filter((g) => g.ok).slice(0, MAX_PUZZLE_IMPORT).map((g) => g.index)));
  };

  const toggle = (index: number, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(index);
      else next.delete(index);
      return next;
    });

  const chosen = (games ?? []).filter(
    (g): g is Extract<ImportedPgnGame, { ok: true }> => g.ok && selected.has(g.index)
  );
  const tooMany = chosen.length > MAX_PUZZLE_IMPORT;

  const submit = async () => {
    if (!topicId) {
      toast.error({ title: "Pick a topic for the imported puzzles." });
      return;
    }
    const puzzles: CreatePuzzleRequest[] = chosen.map((g) => {
      const solutionMoves = g.moves.slice(0, MAX_PUZZLE_SOLUTION_MOVES);
      return {
        title: g.title.slice(0, 200),
        description: g.description?.slice(0, 2000),
        topicId,
        puzzleType,
        difficulty,
        fen: g.startFen,
        solutionMoves,
        orientation: sideToMove(g.startFen),
        status: publish && solutionMoves.length > 0 ? "PUBLISHED" : "DRAFT",
        ...(role === "admin" ? {} : { visibility: "PRIVATE" as const })
      };
    });
    try {
      const res = await importMut.mutateAsync({ puzzles });
      if (res.failed.length === 0) {
        const title = `Imported ${res.created} puzzle${res.created === 1 ? "" : "s"}`;
        if (res.duplicates.length > 0) {
          // Imported anyway — the same position + line was already in the library.
          toast.warning({
            title,
            message: `${res.duplicates.length} already in the library: ${res.duplicates
              .slice(0, 3)
              .map((d) => `${d.title} = "${d.existingTitle}"`)
              .join(" · ")}`
          });
        } else {
          toast.success({ title });
        }
        reset();
        onOpenChange(false);
      } else {
        toast.warning({
          title: `Imported ${res.created}, ${res.failed.length} failed`,
          message: res.failed
            .slice(0, 3)
            .map((f) => `${f.title}: ${f.error}`)
            .join(" · ")
        });
      }
    } catch (error) {
      toast.error({ title: "Import failed", message: (error as Error).message });
    }
  };

  const withoutSolution = chosen.filter((g) => g.moves.length === 0).length;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Import puzzles from PGN</DialogTitle>
          <DialogDescription>
            Every game in the file becomes a puzzle: its [FEN] tag is the position and its main line
            the solution.
          </DialogDescription>
        </DialogHeader>

        {!games ? (
          <div className="space-y-2">
            <Textarea
              rows={6}
              className="font-mono text-xs"
              value={text}
              spellCheck={false}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste a PGN with one or more games, or upload a .pgn file"
            />
            <div className="flex flex-wrap justify-end gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".pgn,.txt"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) load(await file.text());
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                <FileUp className="mr-1.5 size-4" strokeWidth={2.5} />
                Upload .pgn
              </Button>
              <Button type="button" size="sm" disabled={!text.trim()} onClick={() => load(text)}>
                Read PGN
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField id="pz-import-topic" label="Topic">
                <Select
                  id="pz-import-topic"
                  value={topicId}
                  placeholder="Select a topic"
                  options={topicOptions}
                  onChange={(e) => setTopicId(e.target.value)}
                />
              </FormField>
              <FormField id="pz-import-type" label="Puzzle type">
                <Select
                  id="pz-import-type"
                  value={puzzleType}
                  options={PUZZLE_TYPE_OPTIONS}
                  onChange={(e) => setPuzzleType(e.target.value as PuzzleType)}
                />
              </FormField>
              <FormField id="pz-import-difficulty" label="Difficulty">
                <Select
                  id="pz-import-difficulty"
                  value={difficulty}
                  options={PUZZLE_DIFFICULTY_OPTIONS}
                  onChange={(e) => setDifficulty(e.target.value as PuzzleDifficulty)}
                />
              </FormField>
            </div>
            <Switch
              id="pz-import-publish"
              label="Publish puzzles that have a solution"
              checked={publish}
              onCheckedChange={(checked) => setPublish(checked === true)}
            />

            <div className="flex items-center justify-between text-sm">
              <span className="text-app-muted">
                {chosen.length} of {games.length} selected
                {withoutSolution > 0 ? ` · ${withoutSolution} without a solution (saved as drafts)` : ""}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelected(new Set(games.filter((g) => g.ok).map((g) => g.index)))}
                >
                  All
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  None
                </Button>
              </div>
            </div>

            <ul className="max-h-72 divide-y divide-app-border overflow-y-auto rounded-app border border-app-border">
              {games.map((g) => (
                <li key={g.index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <Checkbox
                    id={`pz-import-${g.index}`}
                    label={g.title}
                    disabled={!g.ok}
                    checked={selected.has(g.index)}
                    onCheckedChange={(checked) => toggle(g.index, checked === true)}
                  />
                  <span className={`shrink-0 text-xs ${g.ok ? "text-app-muted" : "text-app-danger-ink"}`}>
                    {g.ok
                      ? g.moves.length > 0
                        ? `${g.moves.length} move${g.moves.length === 1 ? "" : "s"}`
                        : "Position only"
                      : g.error}
                  </span>
                </li>
              ))}
            </ul>
            {tooMany ? (
              <p className="text-xs text-app-danger-ink">
                Import at most {MAX_PUZZLE_IMPORT} puzzles at a time.
              </p>
            ) : null}
          </div>
        )}

        {games ? (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={reset}>
              Choose another file
            </Button>
            <Button
              type="button"
              onClick={submit}
              disabled={importMut.isPending || chosen.length === 0 || tooMany}
            >
              {importMut.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Import {chosen.length} puzzle{chosen.length === 1 ? "" : "s"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
