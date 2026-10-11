"use client";

import { ExternalLink } from "lucide-react";
import { lichessThemeLabel } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCatalogPreview } from "../../hooks/usePuzzlesApi";
import { PuzzleSolver } from "../solver/PuzzleSolver";

const PLAYS = new Intl.NumberFormat("en");

/**
 * Staff-only look at a catalogue puzzle, solvable on the board. This is the
 * only place the catalogue's solution line reaches the browser.
 */
export function CatalogPreviewDialog({
  sourceId,
  onOpenChange
}: {
  sourceId: string | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, error } = useCatalogPreview(sourceId);
  const puzzle = data?.puzzle;

  return (
    <Dialog open={!!sourceId} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lichess puzzle {sourceId}</DialogTitle>
          <DialogDescription>
            {puzzle
              ? `Rated ${puzzle.rating} · ${puzzle.sideToMove === "white" ? "White" : "Black"} to move after ${puzzle.setupMove.san}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="error">{(error as Error).message}</Alert>
        ) : isLoading || !puzzle ? (
          <Skeleton className="aspect-square w-full" />
        ) : (
          <div className="space-y-4">
            <PuzzleSolver
              key={puzzle.sourceId}
              fen={puzzle.postSetupFen}
              solutionMoves={puzzle.solutionMoves}
            />
            <div className="flex flex-wrap gap-1.5">
              {puzzle.themes.map((key) => (
                <Badge key={key} variant="secondary">
                  {lichessThemeLabel(key)}
                </Badge>
              ))}
              {puzzle.openingTags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="outline">
                  {tag.replace(/_/g, " ")}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-app-muted">
              <span>
                {PLAYS.format(puzzle.nbPlays)} plays · popularity {puzzle.popularity}
                {puzzle.inLibrary ? ` · in ${puzzle.inLibrary.topicName}` : ""}
              </span>
              <a
                href={puzzle.gameUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary-ink hover:underline"
              >
                Source game
                <ExternalLink className="size-4" strokeWidth={2.5} />
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
