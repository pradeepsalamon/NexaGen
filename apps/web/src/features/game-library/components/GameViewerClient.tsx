"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addMoveToTree,
  CHESS_GAME_RESULT_LABELS,
  CHESS_GAME_SOURCE_LABELS,
  deleteFromPath,
  fenAtPath,
  getMoveTreeNode,
  lineThroughPath,
  moveTreeToPgn,
  parsePgnToMoveTree,
  promoteToMainline,
  setMoveComment,
  type GameLibraryDetail,
  type MoveTree,
  type MoveTreePath,
  type PgnHeaders,
} from "@nexa-chess/types";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Download,
  Loader2,
  RefreshCw,
  Repeat2,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { PRACTICE_BOARD_GRID, PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { MoveTreeView } from "@/features/chessboard/components/panels/MoveTreeView";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { createMoveTreeChess } from "@/lib/moveTreeChess";
import { GameAnalysisPanel } from "@/features/game-analysis/components/GameAnalysisPanel";
import { useGameAnalysisState } from "@/features/game-analysis/hooks/useGameAnalysis";
import { useAuthStore } from "@/stores/authStore";
import { useDeleteGame, useGame, useSaveGameAnalysis } from "../hooks/useGameLibrary";
import { downloadPgn } from "../lib/downloadPgn";

const DRAFT_KEY = (id: string) => `nexa-game-draft-${id}`;

type Draft = { basedOnVersion: number; pgn: string };

function readDraft(id: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Draft;
    return typeof parsed?.pgn === "string" && typeof parsed.basedOnVersion === "number" ? parsed : null;
  } catch {
    return null;
  }
}

function writeDraft(id: string, draft: Draft | null) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY(id), JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY(id));
  } catch {
    // Storage unavailable (private window): the draft just isn't kept.
  }
}

function parseGame(pgn: string): { tree: MoveTree; headers: PgnHeaders } | null {
  try {
    const parsed = parsePgnToMoveTree(pgn, createMoveTreeChess);
    return { headers: parsed.headers, tree: parsed.tree };
  } catch {
    return null;
  }
}

export function GameViewerClient({ id }: { id: string }) {
  const { data, isLoading, isError, refetch } = useGame(id);

  if (isError) {
    return (
      <div className="space-y-4">
        <BackLink />
        <WidgetError message="This game could not be loaded, or you don't have access to it." onRetry={() => void refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className={PRACTICE_BOARD_GRID}>
        <Skeleton className="aspect-square w-full rounded-app" />
        <Skeleton className="h-96 w-full rounded-app" />
      </div>
    );
  }
  return <GameViewer key={`${data.id}:${data.version}`} game={data} />;
}

function BackLink() {
  return (
    <Link href="/games" className="inline-flex items-center gap-1.5 text-sm font-medium text-app-muted hover:text-primary-ink">
      <ArrowLeft className="size-4" aria-hidden />
      Game Library
    </Link>
  );
}

function GameViewer({ game }: { game: GameLibraryDetail }) {
  const timeZone = useUserTimeZone();
  const router = useRouter();
  const save = useSaveGameAnalysis(game.id);
  const remove = useDeleteGame();
  const editable = game.canEdit && game.status === "COMPLETED";
  const authUser = useAuthStore((s) => s.user);
  const viewer = authUser ? { id: authUser.id, role: authUser.role } : null;
  const analysisState = useGameAnalysisState(game.id);

  const saved = useMemo(() => parseGame(game.pgn), [game.pgn]);
  const [tree, setTree] = useState<MoveTree | null>(() => {
    // An unsaved exploration of this exact version survives a refresh.
    const draft = typeof window !== "undefined" ? readDraft(game.id) : null;
    if (draft && draft.basedOnVersion === game.version) {
      const restored = parseGame(draft.pgn);
      if (restored) return restored.tree;
    }
    return saved?.tree ?? null;
  });
  const [cursor, setCursor] = useState<MoveTreePath>(() => (tree ? lineThroughPath(tree, []).path : []));
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // The game's own tags (players, event, result) always go out with the tree.
  const headers = useMemo<PgnHeaders>(() => ({ ...(saved?.headers ?? {}), Result: game.result }), [saved, game.result]);
  const savedPgn = useMemo(() => (saved ? moveTreeToPgn(saved.tree, headers) : ""), [saved, headers]);
  const currentPgn = useMemo(() => (tree ? moveTreeToPgn(tree, headers) : ""), [tree, headers]);
  const dirty = !!tree && !!saved && currentPgn !== savedPgn;

  useEffect(() => {
    if (!tree) return;
    writeDraft(game.id, dirty ? { basedOnVersion: game.version, pgn: currentPgn } : null);
  }, [dirty, currentPgn, game.id, game.version, tree]);

  const fen = tree ? fenAtPath(tree, cursor) : "";
  const line = useMemo(() => (tree ? lineThroughPath(tree, cursor) : { nodes: [], path: [] as number[] }), [tree, cursor]);
  const node = tree && cursor.length ? getMoveTreeNode(tree, cursor) : null;
  const lastMove: [string, string] | null = node ? [node.uci.slice(0, 2), node.uci.slice(2, 4)] : null;

  // The engine report is about the saved mainline: map the board's cursor onto it.
  const mainPath = useMemo(() => (saved ? lineThroughPath(saved.tree, []).path : []), [saved]);
  const onMainline = cursor.every((step, i) => mainPath[i] === step);
  const currentPly = onMainline && cursor.length > 0 ? cursor.length - 1 : null;
  const jumpToPly = useCallback((plies: number) => setCursor(mainPath.slice(0, Math.max(0, Math.min(plies, mainPath.length)))), [mainPath]);
  // The engine's move for the position on the board (the move about to be played there).
  const report = analysisState.data?.report ?? null;
  const nextMove = report && onMainline && !dirty ? report.moves[cursor.length] : undefined;
  const hintSquares = nextMove?.bestMoveUci ? { from: nextMove.bestMoveUci.slice(0, 2), to: nextMove.bestMoveUci.slice(2, 4) } : null;

  // `?ply=N` (from an insight's example) opens the game at that position once.
  useEffect(() => {
    const ply = Number(new URLSearchParams(window.location.search).get("ply"));
    if (Number.isInteger(ply) && ply > 0) jumpToPly(ply);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on open
  }, []);

  const go = useCallback((path: MoveTreePath) => setCursor(path), []);
  const step = useCallback(
    (delta: -1 | 1 | "start" | "end") => {
      if (!tree) return;
      if (delta === "start") return setCursor([]);
      if (delta === "end") return setCursor(line.path);
      if (delta === -1) return setCursor((c) => c.slice(0, -1));
      setCursor((c) => (line.path.length > c.length ? line.path.slice(0, c.length + 1) : c));
    },
    [tree, line.path],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector("[role=dialog],[role=alertdialog]")) return;
      const map: Record<string, -1 | 1 | "start" | "end"> = { ArrowDown: "end", ArrowLeft: -1, ArrowRight: 1, ArrowUp: "start" };
      const action = map[e.key];
      if (action === undefined) return;
      e.preventDefault();
      step(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const onMove = (move: PracticeBoardMove) => {
    if (!tree) return;
    const added = addMoveToTree(tree, cursor, { fen: move.fen, san: move.san, uci: move.uci });
    setTree(added.tree);
    setCursor(added.path);
  };

  const onPromote = (path: MoveTreePath) => {
    if (!tree) return;
    const promoted = promoteToMainline(tree, path);
    setTree(promoted.tree);
    setCursor(promoted.path);
    toast.success("Promoted to mainline — save to keep it.");
  };

  const onDeleteVariation = (path: MoveTreePath) => {
    if (!tree) return;
    const removed = deleteFromPath(tree, path);
    setTree(removed.tree);
    setCursor(removed.path);
  };

  const onComment = (path: MoveTreePath, text: string) => {
    if (!tree) return;
    setTree(setMoveComment(tree, path, text));
  };

  const discard = () => {
    writeDraft(game.id, null);
    if (saved) {
      setTree(saved.tree);
      setCursor(lineThroughPath(saved.tree, []).path);
    }
  };

  const saveAnalysis = () => {
    save.mutate(
      { pgn: currentPgn, version: game.version },
      {
        onError: (err) => toast.error(err instanceof Error ? err.message : "The analysis could not be saved."),
        onSuccess: () => {
          writeDraft(game.id, null);
          toast.success("Analysis saved");
        },
      },
    );
  };

  if (!tree || !saved) {
    return (
      <div className="space-y-4">
        <BackLink />
        <WidgetError message="This game's PGN could not be read." />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <BackLink />
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{game.title}</h1>
          <p className="text-sm text-app-muted">
            <span className="font-semibold text-app-text">{game.whiteName}</span> (White) vs{" "}
            <span className="font-semibold text-app-text">{game.blackName}</span> (Black)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimpleTooltip label="Copy PGN">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              aria-label="Copy PGN"
              onClick={() => {
                void navigator.clipboard
                  .writeText(currentPgn)
                  .then(() => toast.success("PGN copied"))
                  .catch(() => toast.error("Could not copy the PGN."));
              }}
            >
              <Copy className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
          <Button variant="outline" onClick={() => downloadPgn(currentPgn, game.title)}>
            <Download className="mr-2 size-4" aria-hidden />
            Download PGN
          </Button>
          {game.canDelete && (
            <SimpleTooltip label="Delete game">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full bg-app-danger text-white hover:bg-app-danger/85"
                aria-label="Delete game"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          )}
        </div>
      </div>

      <div className={PRACTICE_BOARD_GRID}>
        <div className="space-y-3">
          <PracticeBoard fen={fen} orientation={orientation} lastMove={lastMove} onMove={onMove} hintSquares={hintSquares} />
          {hintSquares && <p className="text-center text-xs text-app-muted">Green arrow: the engine&apos;s move in this position.</p>}
          <div className="flex items-center justify-center gap-1.5" role="toolbar" aria-label="Move navigation">
            <NavButton label="First move (↑)" onClick={() => step("start")} disabled={cursor.length === 0}>
              <ChevronsLeft className="size-4" />
            </NavButton>
            <NavButton label="Previous move (←)" onClick={() => step(-1)} disabled={cursor.length === 0}>
              <ChevronLeft className="size-4" />
            </NavButton>
            <NavButton label="Next move (→)" onClick={() => step(1)} disabled={cursor.length >= line.path.length}>
              <ChevronRight className="size-4" />
            </NavButton>
            <NavButton label="Last move (↓)" onClick={() => step("end")} disabled={cursor.length >= line.path.length}>
              <ChevronsRight className="size-4" />
            </NavButton>
            <NavButton label="Flip board" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
              <Repeat2 className="size-4" />
            </NavButton>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <Card className="flex h-[min(28rem,60dvh)] flex-col overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 border-b border-app-border bg-app-soft px-4 py-2">
              <span className="text-sm font-semibold">Moves</span>
              {dirty && <Badge variant="warning">Unsaved changes</Badge>}
            </div>
            <MoveTreeView
              className="min-h-0 flex-1"
              tree={tree}
              cursor={cursor}
              onSelect={go}
              editable={editable}
              onPromote={onPromote}
              onDelete={onDeleteVariation}
              onComment={onComment}
            />
          </Card>

          {dirty && (
            <Card className="space-y-3 p-4">
              <p className="text-sm text-app-muted">
                {editable
                  ? "You changed this game's analysis. Save it to keep it for everyone who can open this game."
                  : "Your exploration is kept in this browser only — it is not saved to the game."}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={discard}>
                  <RefreshCw className="mr-2 size-4" aria-hidden />
                  {editable ? "Discard changes" : "Reset to the game"}
                </Button>
                {editable && (
                  <Button onClick={saveAnalysis} disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Save className="mr-2 size-4" aria-hidden />}
                    Save analysis
                  </Button>
                )}
              </div>
            </Card>
          )}
          {game.status === "COMPLETED" && (
            <GameAnalysisPanel currentPly={currentPly} gameId={game.id} onJump={jumpToPly} viewer={viewer} />
          )}
          {game.canEdit && game.status !== "COMPLETED" && (
            <p className="text-xs text-app-muted">This game is still being played. Analysis can be saved once it has finished.</p>
          )}

          <Card className="p-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-app-muted">Result</dt>
              <dd className="font-medium">
                {game.result === "*" ? "—" : game.result} · {CHESS_GAME_RESULT_LABELS[game.result]}
                {game.termination ? ` (${game.termination})` : ""}
              </dd>
              <dt className="text-app-muted">Type</dt>
              <dd>{CHESS_GAME_SOURCE_LABELS[game.source]}{game.status === "IN_PROGRESS" ? " · in progress" : ""}</dd>
              {game.classTitle && (
                <>
                  <dt className="text-app-muted">Class</dt>
                  <dd>{game.classTitle}</dd>
                </>
              )}
              {game.batchName && (
                <>
                  <dt className="text-app-muted">Batch</dt>
                  <dd>{game.batchName}</dd>
                </>
              )}
              <dt className="text-app-muted">Played</dt>
              <dd>
                <time dateTime={game.startedAt}>{formatDateTime(game.startedAt, timeZone)}</time>
              </dd>
              <dt className="text-app-muted">Moves</dt>
              <dd>{game.moveCount} half-moves{game.hasVariations ? " · has variations" : ""}</dd>
              {game.createdByName && (
                <>
                  <dt className="text-app-muted">Imported by</dt>
                  <dd>{game.createdByName}</dd>
                </>
              )}
            </dl>
          </Card>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="space-y-2">
              <AlertDialogTitle>Delete this game?</AlertDialogTitle>
              <AlertDialogDescription>
                The imported game and its analysis are removed from the library. This cannot be undone.
              </AlertDialogDescription>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                isLoading={remove.isPending}
                onClick={(event) => {
                  // Stay open until it is actually gone; a failure keeps the dialog.
                  event.preventDefault();
                  remove.mutate(game.id, {
                    onError: (err) => toast.error(err instanceof Error ? err.message : "The game could not be deleted."),
                    onSuccess: () => {
                      writeDraft(game.id, null);
                      toast.success("Game deleted");
                      router.push("/games");
                    },
                  });
                }}
              >
                Delete game
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NavButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <SimpleTooltip label={label}>
      <Button variant="outline" size="icon" className="rounded-full" aria-label={label} onClick={onClick} disabled={disabled}>
        {children}
      </Button>
    </SimpleTooltip>
  );
}
