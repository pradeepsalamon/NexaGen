"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { describeDiagramSource, type PuzzleSummary } from "@nexa-chess/types";
import { BookmarkPlus, Loader2, MonitorPlay } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import { useImportGame } from "@/features/game-library/hooks/useGameLibrary";
import { getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { useToast } from "@/providers/ToastProvider";
import { PDF_IMPORT_TAG, storePuzzlePrefill } from "../lib/handoff";
import { suggestSolutionLine } from "../lib/solution";
import type { ConfirmedDiagram } from "./DiagramImportWorkbench";

/** Positions already sent to the analysis board in this session: id → game. */
const openedGames = new Map<string, string>();

function sourceTitle(c: ConfirmedDiagram) {
  const book = c.fileName.replace(/\.(pdf|png|jpe?g|webp)$/i, "") || "PDF";
  return `${book} — p.${c.candidate.page} #${c.candidate.index}`.slice(0, 120);
}

function provenance(c: ConfirmedDiagram) {
  return describeDiagramSource({
    corrected: c.corrected,
    diagram: c.candidate.index,
    fileName: c.fileName,
    page: c.candidate.page,
  });
}

function pgnString(value: string) {
  return value.replace(/[\\"]/g, "").replace(/[\r\n]+/g, " ");
}

type Props = {
  confirmed: ConfirmedDiagram;
  /** Where "New puzzle" lives for this role (/coach/puzzles, /admin/puzzles). */
  libraryBasePath: string;
  /** Offer the Game Library analysis board (leaves the page). */
  analysis?: boolean;
  /** Open the puzzle form in a new tab (from a live class). */
  libraryInNewTab?: boolean;
  /** Extra actions first in the row, e.g. "Load on class board". */
  children?: ReactNode;
};

/**
 * What a confirmed position can become. Nothing here saves on its own: the
 * analysis board gets a private Game Library import, and the library opens the
 * normal puzzle form prefilled — the coach adds the solution, topic and
 * difficulty and saves (as a draft or published) through its usual checks.
 */
export function DiagramPositionActions({ analysis = true, children, confirmed, libraryBasePath, libraryInNewTab }: Props) {
  const router = useRouter();
  const toast = useToast();
  const importGame = useImportGame();
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<PuzzleSummary[] | null>(null);
  const placement = confirmed.fen.split(" ")[0];
  const suggestedLine = useMemo(() => suggestSolutionLine(confirmed.fen, confirmed.candidate.printedText), [confirmed.candidate.printedText, confirmed.fen]);
  const sessionKey = `${confirmed.candidate.id}|${confirmed.fen}`;

  const openAnalysis = () => {
    const existing = openedGames.get(sessionKey);
    if (existing) {
      router.push(`/games/${existing}`);
      return;
    }
    const title = sourceTitle(confirmed);
    const pgn = [
      `[Event "${pgnString(title)}"]`,
      `[Site "${pgnString(provenance(confirmed))}"]`,
      `[SetUp "1"]`,
      `[FEN "${confirmed.fen}"]`,
      "",
      "*",
    ].join("\n");
    importGame.mutate(
      { pgn, title },
      {
        onError: (err) => toast.error({ title: "Could not open the analysis board", message: (err as Error).message }),
        onSuccess: (game) => {
          openedGames.set(sessionKey, game.id);
          toast.success({ title: "Opened in your Game Library", message: "Only you can see it." });
          router.push(`/games/${game.id}`);
        },
      },
    );
  };

  const goToForm = () => {
    storePuzzlePrefill({
      description: provenance(confirmed),
      fen: confirmed.fen,
      solutionMoves: suggestedLine,
      tags: [PDF_IMPORT_TAG],
      title: sourceTitle(confirmed),
    });
    const href = `${libraryBasePath}/new?from=pdf`;
    if (libraryInNewTab) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  const saveToLibrary = async () => {
    setChecking(true);
    try {
      const res = await getPuzzles({ pageSize: 5, placement });
      if (res.puzzles.length > 0) {
        setDuplicates(res.puzzles);
        return;
      }
      goToForm();
    } catch {
      // The check is a courtesy; the form still works without it.
      goToForm();
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      {suggestedLine.length > 0 ? (
        <p className="w-full text-sm text-app-muted" data-testid="diagram-suggested-line">
          Moves printed by this diagram, all legal from this position: {suggestedLine.map((m) => m.san).join(" ")}. They fill in the
          puzzle form&apos;s solution for you to check.
        </p>
      ) : null}
      {children}
      {analysis ? (
        <Button disabled={importGame.isPending} onClick={openAnalysis} variant="outline">
          {importGame.isPending ? <Loader2 className="size-4 animate-spin" /> : <MonitorPlay className="size-4" strokeWidth={2.5} />}
          Open on analysis board
        </Button>
      ) : null}
      <Button data-testid="diagram-save-library" disabled={checking} onClick={() => void saveToLibrary()} variant="outline">
        {checking ? <Loader2 className="size-4 animate-spin" /> : <BookmarkPlus className="size-4" strokeWidth={2.5} />}
        Save to puzzle library…
      </Button>

      <AlertDialog onOpenChange={(open) => !open && setDuplicates(null)} open={duplicates !== null}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="space-y-2">
              <AlertDialogTitle>This position is already in your library</AlertDialogTitle>
              <AlertDialogDescription>
                {duplicates?.length === 1 ? "A puzzle" : "Puzzles"} you can see already start from these pieces. Open one instead, or
                create a new puzzle anyway.
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <ul className="flex flex-col gap-1 text-sm">
            {duplicates?.map((p) => (
              <li key={p.id}>
                <Link
                  className="font-semibold text-primary-ink underline-offset-2 hover:underline"
                  href={`${libraryBasePath}/${p.id}`}
                  {...(libraryInNewTab ? { rel: "noopener noreferrer", target: "_blank" } : {})}
                >
                  {p.title}
                </Link>{" "}
                <span className="text-app-muted">({p.status.toLowerCase()})</span>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={goToForm}>Create new puzzle anyway</Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
