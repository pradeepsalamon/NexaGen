import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  LiveClassChapter,
  LiveClassChaptersResponse,
  LiveClassChapterState
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useToast } from "@/providers/ToastProvider";
import {
  createLiveClassChapter,
  deleteLiveClassChapter,
  deleteLiveClassChapters,
  getLiveClassChapters,
  importLiveClassChapters,
  reorderLiveClassChapters,
  updateLiveClassChapter
} from "../api/liveClassChapters";
import { chapterSignature, useChapterSelection } from "../lib/chapterBoard";

function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** The coach's chapter list for this class (coach/admin only — the API refuses anyone else). */
export function useLiveClassChapters(classId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.liveClassChapters.list(classId),
    queryFn: () => getLiveClassChapters(classId),
    enabled: enabled && !!classId,
    staleTime: 30_000
  });
}

/**
 * Every chapter write. Each response is the whole list, so it goes straight
 * into the cache; create / import / rename / save / reorder undo through a
 * real reverse call, and delete is deferred (the row hides until the toast
 * closes, Undo brings it back untouched).
 */
export function useLiveClassChapterActions(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = useMemo(() => queryKeys.liveClassChapters.list(classId), [classId]);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set());
  // Ids of a "Delete all" between confirm and commit — blocks a second one meanwhile.
  const [bulkIds, setBulkIds] = useState<string[] | null>(null);

  const put = useCallback((res: LiveClassChaptersResponse) => qc.setQueryData(key, res), [qc, key]);
  const current = useCallback(
    () => qc.getQueryData<LiveClassChaptersResponse>(key)?.chapters ?? [],
    [qc, key]
  );
  /** Rows a create/import added: ids in the response that weren't cached before it. */
  const addedSince = useCallback((before: LiveClassChapter[], res: LiveClassChaptersResponse) => {
    const known = new Set(before.map((c) => c.id));
    return res.chapters.filter((c) => !known.has(c.id)).map((c) => c.id);
  }, []);
  const removeAll = useCallback(
    async (ids: string[]) => {
      for (const id of ids) put(await deleteLiveClassChapter(classId, id));
    },
    [classId, put]
  );

  const create = useUndoableMutation<
    { title: string; state: LiveClassChapterState; puzzleId?: string | null },
    string[]
  >({
    strategy: "immediate",
    mutationFn: async (vars) => {
      const before = current();
      const res = await createLiveClassChapter(classId, { ...vars, clientId: newClientId() });
      put(res);
      return addedSince(before, res);
    },
    undo: (_vars, ids) => removeAll(ids),
    toast: (vars) => ({ title: `Chapter added: ${vars.title}` }),
    undoToast: () => ({ title: "Chapter removed" }),
    invalidates: []
  });

  const importPuzzles = useUndoableMutation<{ puzzleIds: string[] }, string[]>({
    strategy: "immediate",
    mutationFn: async (vars) => {
      const before = current();
      const res = await importLiveClassChapters(classId, vars);
      put(res);
      return addedSince(before, res);
    },
    undo: (_vars, ids) => removeAll(ids),
    toast: (_vars, ids) =>
      ids && ids.length === 0
        ? { title: "Those puzzles are already chapters" }
        : { title: `Added ${ids?.length ?? 0} ${ids?.length === 1 ? "chapter" : "chapters"}` },
    undoToast: () => ({ title: "Imported chapters removed" }),
    invalidates: []
  });

  const rename = useUndoableMutation<{ chapter: LiveClassChapter; title: string }, void>({
    strategy: "immediate",
    mutationFn: async ({ chapter, title }) => {
      put(await updateLiveClassChapter(classId, chapter.id, { title }));
    },
    undo: async ({ chapter }) => {
      put(await updateLiveClassChapter(classId, chapter.id, { title: chapter.title }));
    },
    toast: ({ title }) => ({ title: `Renamed to "${title}"` }),
    invalidates: []
  });

  /** The chapter on the board now matches `state` — it is no longer unsaved work. */
  const rebase = useCallback(
    (chapterId: string, state: LiveClassChapterState) => {
      const sel = useChapterSelection.getState();
      if (sel.classId === classId && sel.chapterId === chapterId) {
        sel.select(classId, chapterId, chapterSignature(state));
      }
    },
    [classId]
  );

  /** Saves the board into a chapter and throws on failure — for flows that must not continue after one. */
  const saveNow = useCallback(
    async (chapter: LiveClassChapter, state: LiveClassChapterState) => {
      put(await updateLiveClassChapter(classId, chapter.id, { state }));
      rebase(chapter.id, state);
    },
    [classId, put, rebase]
  );

  /** Creates a chapter and throws on failure; returns the new chapter's id. */
  const createNow = useCallback(
    async (title: string, state: LiveClassChapterState) => {
      const before = current();
      const res = await createLiveClassChapter(classId, { clientId: newClientId(), state, title });
      put(res);
      return addedSince(before, res)[0] ?? null;
    },
    [classId, current, put, addedSince]
  );

  const saveBoard = useUndoableMutation<{ chapter: LiveClassChapter; state: LiveClassChapterState }, void>({
    strategy: "immediate",
    mutationFn: ({ chapter, state }) => saveNow(chapter, state),
    undo: async ({ chapter }) => {
      put(await updateLiveClassChapter(classId, chapter.id, { state: chapter.state }));
      rebase(chapter.id, chapter.state);
    },
    toast: ({ chapter }) => ({ title: `Saved the board to "${chapter.title}"` }),
    invalidates: []
  });

  const reorder = useUndoableMutation<{ ids: string[]; previous: string[] }, void>({
    strategy: "immediate",
    mutationFn: async ({ ids }) => {
      put(await reorderLiveClassChapters(classId, { ids }));
    },
    undo: async ({ previous }) => {
      put(await reorderLiveClassChapters(classId, { ids: previous }));
    },
    toast: () => ({ title: "Chapter moved" }),
    invalidates: []
  });

  const remove = useUndoableMutation<LiveClassChapter, LiveClassChaptersResponse>({
    strategy: "defer",
    mutationFn: async (chapter) => {
      const res = await deleteLiveClassChapter(classId, chapter.id);
      put(res);
      return res;
    },
    undo: async () => undefined,
    toast: (chapter) => ({ title: `Deleted "${chapter.title}"`, message: "Only the chapter — nothing else is removed." }),
    onSchedule: (chapter) => setHiddenIds((s) => new Set(s).add(chapter.id)),
    onCancel: (chapter) =>
      setHiddenIds((s) => {
        const next = new Set(s);
        next.delete(chapter.id);
        return next;
      }),
    onCommitSuccess: (chapter) =>
      setHiddenIds((s) => {
        const next = new Set(s);
        next.delete(chapter.id);
        return next;
      }),
    invalidates: []
  });

  const unhide = useCallback(
    (ids: string[]) =>
      setHiddenIds((s) => {
        const next = new Set(s);
        for (const id of ids) next.delete(id);
        return next;
      }),
    []
  );

  /**
   * "Delete all", confirmed first by the panel's dialog, then deferred like a
   * single delete: the rows hide until the toast closes and Undo brings them
   * back untouched. The server removes only these ids, in one transaction.
   */
  const deleteAll = useUndoableMutation<{ ids: string[] }, number>({
    strategy: "defer",
    mutationFn: async ({ ids }) => {
      try {
        const res = await deleteLiveClassChapters(classId, { ids });
        put(res);
        return res.deleted;
      } catch (error) {
        // Nothing was deleted (one transaction) — reread in case the list moved meanwhile.
        void qc.invalidateQueries({ queryKey: key });
        throw error;
      }
    },
    undo: async () => undefined,
    toast: ({ ids }) => ({
      title: `Deleting ${ids.length} ${ids.length === 1 ? "chapter" : "chapters"}`,
      message: "Only the chapters — puzzles and student progress stay."
    }),
    onSchedule: ({ ids }) => {
      setBulkIds(ids);
      setHiddenIds((s) => new Set([...s, ...ids]));
    },
    onCancel: ({ ids }) => {
      setBulkIds(null);
      unhide(ids);
    },
    onCommitSuccess: ({ ids }, deleted) => {
      setBulkIds(null);
      unhide(ids);
      toast.success({ title: `Deleted ${deleted} ${deleted === 1 ? "chapter" : "chapters"}` });
    },
    invalidates: []
  });

  return {
    create: create.run,
    createNow,
    creating: create.isPending,
    hiddenIds,
    importPuzzles: importPuzzles.run,
    importing: importPuzzles.isPending,
    remove: remove.run,
    deleteAll: deleteAll.run,
    deletingAll: bulkIds !== null,
    rename: rename.run,
    reorder: reorder.run,
    saveBoard: saveBoard.run,
    saveNow,
    saving: saveBoard.isPending
  };
}
