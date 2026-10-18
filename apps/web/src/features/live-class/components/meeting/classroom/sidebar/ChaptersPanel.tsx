"use client";

import { useContext, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  BookPlus,
  FolderInput,
  Loader2,
  MessageCircleQuestion,
  MoreVertical,
  Pencil,
  Save,
  Trash,
  Trash2
} from "lucide-react";
import {
  LIVE_CLASS_CHAPTER_TITLE_MAX,
  MAX_LIVE_CLASS_CHAPTERS,
  type LiveClassChapter,
  type PuzzleListQuery
} from "@nexa-chess/types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/DropdownMenu";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { BoardContext } from "@/features/chessboard/context/BoardProvider";
import { getPuzzles } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { useLiveClassChapterActions, useLiveClassChapters } from "../../../../hooks/useLiveClassChapters";
import {
  boardHasMoves,
  chapterSignature,
  chapterStateFromBoard,
  loadChapterOnBoard,
  useChapterSelection
} from "../../../../lib/chapterBoard";
import { loadPuzzleCursor } from "../../../../lib/puzzleCursor";
import { SharePositionDialog, type SharePositionPreset } from "../../SharePositionDialog";
import { SidebarListHeader, SidebarSearch } from "./SidebarParts";

type PendingLoad = { chapter: LiveClassChapter; reason: "dirty-chapter" | "unsaved-board" };

/**
 * The coach's chapter list (Lichess Study-style). Load puts a chapter on the
 * shared board — its moves, variations, arrows and orientation — and the
 * board's own sync sends it to every student. Ask opens "Share current" on the
 * chapter's position; nothing reaches the class until the coach confirms.
 * Must render inside the coach's `BoardProvider`.
 */
export function ChaptersPanel({ classId, activePuzzleId }: { classId: string; activePuzzleId: string | null }) {
  const store = useContext(BoardContext);
  const toast = useToast();
  const qc = useQueryClient();
  const chapters = useLiveClassChapters(classId);
  const actions = useLiveClassChapterActions(classId);
  const selection = useChapterSelection();
  const selectedId = selection.classId === classId ? selection.chapterId : null;

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingLoad | null>(null);
  const [askPreset, setAskPreset] = useState<SharePositionPreset | null>(null);
  const [busyLoad, setBusyLoad] = useState(false);
  // "Delete all": the ids the dialog names, frozen when it opens — a chapter added meanwhile survives.
  const [confirmAllIds, setConfirmAllIds] = useState<string[] | null>(null);
  // The newest Load wins: a slower save-then-load can't land after a later click.
  const loadToken = useRef(0);

  const all = useMemo(
    () => (chapters.data?.chapters ?? []).filter((c) => !actions.hiddenIds.has(c.id)),
    [chapters.data, actions.hiddenIds]
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((c) => c.title.toLowerCase().includes(q)) : all;
  }, [all, query]);
  const selected = all.find((c) => c.id === selectedId) ?? null;
  const full = all.length >= MAX_LIVE_CLASS_CHAPTERS;

  if (!store) return null;
  const board = () => store.getState();

  const applyLoad = (chapter: LiveClassChapter, token: number) => {
    if (token !== loadToken.current) return;
    try {
      loadChapterOnBoard(board(), chapter.state);
      selection.select(classId, chapter.id, chapterSignature(chapter.state));
    } catch (error) {
      toast.error({ title: `Couldn't load "${chapter.title}"`, message: (error as Error).message });
    }
  };

  /** Load, unless it would throw away work on the board — then ask first. */
  const requestLoad = (chapter: LiveClassChapter) => {
    const token = ++loadToken.current;
    const now = chapterStateFromBoard(board());
    if (selected && selection.baseline !== null && chapterSignature(now) !== selection.baseline) {
      setPending({ chapter, reason: "dirty-chapter" });
      return;
    }
    const known = all.some((c) => chapterSignature(c.state) === chapterSignature(now));
    if (!selected && boardHasMoves(board()) && !known) {
      setPending({ chapter, reason: "unsaved-board" });
      return;
    }
    applyLoad(chapter, token);
  };

  const resolvePending = async (choice: "save" | "discard") => {
    if (!pending) return;
    const { chapter, reason } = pending;
    setPending(null);
    const token = ++loadToken.current;
    if (choice === "save") {
      setBusyLoad(true);
      try {
        const state = chapterStateFromBoard(board());
        if (reason === "dirty-chapter" && selected) await actions.saveNow(selected, state);
        else await actions.createNow(`Chapter ${all.length + 1}`, state);
      } catch (error) {
        // The board keeps its moves: nothing is loaded over unsaved work.
        toast.error({ title: "Couldn't save the board", message: (error as Error).message });
        return;
      } finally {
        setBusyLoad(false);
      }
    }
    applyLoad(chapter, token);
  };

  const addCurrentBoard = async () => {
    const state = chapterStateFromBoard(board());
    await actions.create({ state, title: `Chapter ${all.length + 1}` });
  };

  const saveToSelected = async () => {
    if (!selected) return;
    await actions.saveBoard({ chapter: selected, state: chapterStateFromBoard(board()) });
  };

  /** Every published puzzle in the folder the coach's Share/Load buttons step through. */
  const importFolder = async () => {
    const { folderId } = loadPuzzleCursor();
    if (!folderId) {
      toast.info({
        title: "Pick a folder first",
        message: "Open the folder button under the board and choose a puzzle folder."
      });
      return;
    }
    const listQuery: PuzzleListQuery = {
      order: "asc",
      pageSize: 100,
      scope: "all",
      sort: "title",
      status: "PUBLISHED",
      topicId: folderId,
      topicScope: "direct"
    };
    try {
      const list = await qc.fetchQuery({
        queryFn: () => getPuzzles(listQuery),
        queryKey: queryKeys.puzzles.list(listQuery),
        staleTime: 30_000
      });
      const room = MAX_LIVE_CLASS_CHAPTERS - all.length;
      const ids = list.puzzles.map((p) => p.id).slice(0, room);
      if (ids.length === 0) {
        toast.info({ title: room <= 0 ? "The chapter list is full" : "No published puzzles in that folder" });
        return;
      }
      await actions.importPuzzles({ puzzleIds: ids });
    } catch (error) {
      toast.error({ title: "Couldn't read that folder", message: (error as Error).message });
    }
  };

  const move = (chapter: LiveClassChapter, step: -1 | 1) => {
    const neighbour = all[all.indexOf(chapter) + step];
    if (!neighbour) return;
    // The server wants every id, including a row whose delete is still in its Undo window.
    const ids = (chapters.data?.chapters ?? []).map((c) => c.id);
    const from = ids.indexOf(chapter.id);
    const to = ids.indexOf(neighbour.id);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    void actions.reorder({ ids: next, previous: ids });
  };

  const confirmDeleteAll = () => {
    const ids = confirmAllIds;
    setConfirmAllIds(null);
    if (!ids || ids.length === 0 || actions.deletingAll) return;
    if (selectedId && ids.includes(selectedId)) selection.select(classId, null, null);
    void actions.deleteAll({ ids });
  };

  const ask = (chapter: LiveClassChapter) =>
    setAskPreset({
      fen: chapter.state.fen,
      orientation: chapter.state.orientation,
      puzzleId: chapter.puzzleId,
      title: chapter.title
    });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarListHeader
        searchOpen={searchOpen}
        onToggleSearch={() => {
          setSearchOpen((v) => !v);
          if (searchOpen) setQuery("");
        }}
        searchLabel="Search chapters"
        menu={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Chapter actions"
                className="flex size-7 items-center justify-center rounded-control text-app-muted transition-colors hover:bg-app-soft hover:text-app-text"
              >
                <MoreVertical className="size-4" strokeWidth={2.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem disabled={full || actions.creating} onSelect={() => void addCurrentBoard()}>
                <BookPlus className="mr-2 size-4" /> Add the current board
              </DropdownMenuItem>
              <DropdownMenuItem disabled={full || actions.importing} onSelect={() => void importFolder()}>
                <FolderInput className="mr-2 size-4" /> Add puzzles from my folder
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!selected || actions.saving} onSelect={() => void saveToSelected()}>
                <Save className="mr-2 size-4" />
                {selected ? `Save board to "${selected.title}"` : "Save board to the selected chapter"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={all.length === 0 || actions.deletingAll}
                onSelect={() => setConfirmAllIds(all.map((c) => c.id))}
                className="text-app-danger-ink focus:text-app-danger-ink"
              >
                <Trash className="mr-2 size-4" /> Delete all chapters
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      {searchOpen ? <SidebarSearch value={query} onChange={setQuery} placeholder="Search chapters…" /> : null}

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5" role="list">
        {chapters.isLoading ? (
          <p className="flex items-center justify-center gap-2 py-6 text-xs text-app-muted">
            <Loader2 className="size-3.5 animate-spin" /> Loading chapters…
          </p>
        ) : chapters.isError ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-app-muted">
            Couldn&apos;t load the chapters.
            <Button size="sm" variant="outline" onClick={() => void chapters.refetch()}>
              Try again
            </Button>
          </div>
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center text-xs text-app-muted">
            <p>No chapters yet. Save positions you want to come back to — they stay with this batch.</p>
            <Button size="sm" onClick={() => void addCurrentBoard()} isLoading={actions.creating}>
              <BookPlus className="mr-1.5 size-3.5" strokeWidth={2.5} />
              Add the current board
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <p className="py-6 text-center text-xs text-app-muted">No chapter matches &ldquo;{query.trim()}&rdquo;.</p>
        ) : (
          visible.map((chapter) => (
            <ChapterRow
              key={chapter.id}
              chapter={chapter}
              index={all.indexOf(chapter)}
              total={all.length}
              selected={chapter.id === selectedId}
              renaming={renamingId === chapter.id}
              busy={busyLoad}
              onLoad={() => requestLoad(chapter)}
              onAsk={() => ask(chapter)}
              onStartRename={() => setRenamingId(chapter.id)}
              onRename={(title) => {
                setRenamingId(null);
                if (title && title !== chapter.title) void actions.rename({ chapter, title });
              }}
              onMove={(step) => move(chapter, step)}
              onSave={chapter.id === selectedId ? () => void saveToSelected() : undefined}
              onDelete={() => {
                if (chapter.id === selectedId) selection.select(classId, null, null);
                void actions.remove(chapter);
              }}
            />
          ))
        )}
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.reason === "dirty-chapter" ? "Save your changes first?" : "Keep the current board?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.reason === "dirty-chapter"
                ? `The board has moves that aren't saved in "${selected?.title ?? "this chapter"}". Loading "${pending?.chapter.title}" replaces them on everyone's board.`
                : `The board has moves that aren't in any chapter. Loading "${pending?.chapter.title}" replaces them on everyone's board.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={() => void resolvePending("discard")}>
              Discard and load
            </Button>
            <Button disabled={pending?.reason === "unsaved-board" && full} onClick={() => void resolvePending("save")}>
              {pending?.reason === "dirty-chapter" ? "Save and load" : "Save as a chapter and load"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmAllIds} onOpenChange={(open) => !open && setConfirmAllIds(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete all {confirmAllIds?.length ?? 0} {confirmAllIds?.length === 1 ? "chapter" : "chapters"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {chapters.data?.scope === "BATCH"
                ? "Chapters belong to this batch, so they disappear from every class of the batch, not just this one."
                : "This removes every saved chapter from this class."}{" "}
              The shared board, library puzzles and student progress are not touched, and an activity-queue step that
              loads one of these chapters will be skipped. You can undo for a few seconds afterwards.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmDeleteAll} disabled={actions.deletingAll}>
              <Trash className="mr-1.5 size-3.5" strokeWidth={2.5} />
              Delete {confirmAllIds?.length ?? 0} {confirmAllIds?.length === 1 ? "chapter" : "chapters"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SharePositionDialog
        classId={classId}
        activePuzzleId={activePuzzleId}
        open={!!askPreset}
        onOpenChange={(open) => !open && setAskPreset(null)}
        preset={askPreset}
      />
    </div>
  );
}

function ChapterRow({
  chapter,
  index,
  total,
  selected,
  renaming,
  busy,
  onLoad,
  onAsk,
  onStartRename,
  onRename,
  onMove,
  onSave,
  onDelete
}: {
  chapter: LiveClassChapter;
  index: number;
  total: number;
  selected: boolean;
  renaming: boolean;
  busy: boolean;
  onLoad: () => void;
  onAsk: () => void;
  onStartRename: () => void;
  onRename: (title: string | null) => void;
  onMove: (step: -1 | 1) => void;
  onSave?: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      role="listitem"
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex min-h-9 items-center gap-1.5 rounded-control py-1 pl-2 pr-1 transition-colors",
        selected ? "bg-primary/10 ring-1 ring-inset ring-primary/40" : "hover:bg-app-soft"
      )}
    >
      <span
        className={cn(
          "w-5 shrink-0 text-right text-[11px] font-bold tabular-nums",
          selected ? "text-primary-ink" : "text-app-muted"
        )}
      >
        {index + 1}
      </span>
      {renaming ? (
        <RenameInput initial={chapter.title} onDone={onRename} />
      ) : (
        <button
          type="button"
          onClick={onLoad}
          onDoubleClick={onStartRename}
          disabled={busy}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-[13px] font-medium",
            selected ? "text-primary-ink" : "text-app-text"
          )}
        >
          {chapter.title}
        </button>
      )}
      <SimpleTooltip label="Load on the shared board">
        <button
          type="button"
          onClick={onLoad}
          disabled={busy}
          aria-label={`Load ${chapter.title}`}
          className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-success/50 bg-success/10 px-2 text-[11px] font-semibold text-success-ink transition-colors hover:bg-success hover:text-white disabled:opacity-50"
        >
          <ArrowDownToLine className="size-3" strokeWidth={2.5} />
          Load
        </button>
      </SimpleTooltip>
      <SimpleTooltip label="Ask the class about this position">
        <button
          type="button"
          onClick={onAsk}
          aria-label={`Ask the class about ${chapter.title}`}
          className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-info/50 bg-info/10 px-2 text-[11px] font-semibold text-info-ink transition-colors hover:bg-info hover:text-white"
        >
          <MessageCircleQuestion className="size-3" strokeWidth={2.5} />
          Ask
        </button>
      </SimpleTooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`More actions for ${chapter.title}`}
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-surface hover:text-app-text"
          >
            <MoreVertical className="size-3.5" strokeWidth={2.5} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={onStartRename}>
            <Pencil className="mr-2 size-4" /> Rename
          </DropdownMenuItem>
          {onSave ? (
            <DropdownMenuItem onSelect={onSave}>
              <Save className="mr-2 size-4" /> Save the board here
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={index <= 0} onSelect={() => onMove(-1)}>
            <ArrowUp className="mr-2 size-4" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index >= total - 1} onSelect={() => onMove(1)}>
            <ArrowDown className="mr-2 size-4" /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-app-danger-ink focus:text-app-danger-ink">
            <Trash2 className="mr-2 size-4" /> Delete chapter
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (title: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const finish = (title: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(title);
  };
  return (
    <input
      autoFocus
      aria-label="Chapter title"
      value={value}
      maxLength={LIVE_CLASS_CHAPTER_TITLE_MAX}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(value.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(value.trim() || null);
        else if (e.key === "Escape") finish(null);
      }}
      className="min-w-0 flex-1 rounded-control border border-primary/50 bg-app-surface px-1.5 py-0.5 text-[13px] font-medium text-app-text outline-none"
    />
  );
}
