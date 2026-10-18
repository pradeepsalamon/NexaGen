import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDataChannel } from "@livekit/components-react";
import {
  decodeActivityQueueMessage,
  LIVE_CLASS_ACTIVITY_QUEUE_TOPIC,
  type ActivityQueue,
  type ActivityQueueItem,
  type ActivityQueueItemInput,
  type ActivityQueuesResponse,
  type AddCatalogPuzzlesToQueueResponse,
  type CatalogQueueSkipReason
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useToast } from "@/providers/ToastProvider";
import {
  addActivityQueueItems,
  addCatalogPuzzlesToQueue,
  advanceActivityQueue,
  createActivityQueue,
  deleteActivityQueue,
  finishActivityQueue,
  getActivityQueueProgress,
  getActivityQueues,
  getCurrentActivityQueue,
  launchActivityQueue,
  removeActivityQueueItem,
  renameActivityQueue,
  reorderActivityQueue
} from "../api/liveClassActivityQueue";

function newClientId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Coach-owner / admin: every queue of the class (the API refuses anyone else). */
export function useActivityQueues(classId: string, { live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.activityQueues.list(classId),
    queryFn: () => getActivityQueues(classId),
    enabled: !!classId,
    // In the room the `activity_queue` packet drives updates; this only heals a dropped one.
    refetchInterval: live ? 20_000 : false
  });
}

/** Coach-owner / admin: who has responded to what. Polled while the queue runs. */
export function useActivityQueueProgress(classId: string, queueId: string | null, running: boolean) {
  return useQuery({
    queryKey: queryKeys.activityQueues.progress(classId, queueId ?? ""),
    queryFn: () => getActivityQueueProgress(classId, queueId!),
    enabled: !!classId && !!queueId,
    // Attempts and answers are written by other features; a short poll keeps the grid honest.
    refetchInterval: running ? 5_000 : false
  });
}

/** Any participant: the running queue as a student may see it. */
export function useCurrentActivityQueue(classId: string) {
  return useQuery({
    queryKey: queryKeys.activityQueues.current(classId),
    queryFn: () => getCurrentActivityQueue(classId),
    enabled: !!classId,
    refetchInterval: 20_000
  });
}

/**
 * Refetch on the API's `activity_queue` packets (launch / advance / finish).
 * Only the API sends them — a packet with a sender is dropped. Must render
 * inside `<LiveKitRoom>`.
 */
export function useActivityQueueSync(classId: string, { isManager }: { isManager: boolean }) {
  const qc = useQueryClient();
  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: unknown }) => {
      if (msg.from) return;
      if (!decodeActivityQueueMessage(msg.payload)) return;
      void qc.invalidateQueries({ queryKey: queryKeys.activityQueues.current(classId) });
      if (isManager) void qc.invalidateQueries({ queryKey: ["activity-queues", classId] });
    },
    [qc, classId, isManager]
  );
  useDataChannel(LIVE_CLASS_ACTIVITY_QUEUE_TOPIC, onMessage);
}

/** Writes one queue into the cached list (or drops it), so every response lands at once. */
function useQueueCache(classId: string) {
  const qc = useQueryClient();
  const key = useMemo(() => queryKeys.activityQueues.list(classId), [classId]);
  const put = useCallback(
    (queue: ActivityQueue) =>
      qc.setQueryData<ActivityQueuesResponse>(key, (prev) => {
        if (!prev) return prev;
        const exists = prev.queues.some((q) => q.id === queue.id);
        return {
          ...prev,
          queues: exists ? prev.queues.map((q) => (q.id === queue.id ? queue : q)) : [queue, ...prev.queues]
        };
      }),
    [qc, key]
  );
  const drop = useCallback(
    (queueId: string) =>
      qc.setQueryData<ActivityQueuesResponse>(key, (prev) =>
        prev ? { ...prev, queues: prev.queues.filter((q) => q.id !== queueId) } : prev
      ),
    [qc, key]
  );
  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: key }), [qc, key]);
  return { drop, put, refresh };
}

/**
 * Draft edits. Each response is the whole queue, so it goes straight into the
 * cache; create / add / reorder undo through a real reverse call, and deletes
 * are deferred (the row hides until the toast closes).
 */
export function useActivityQueueDraftActions(classId: string) {
  const { drop, put, refresh } = useQueueCache(classId);
  const [hiddenQueueIds, setHiddenQueueIds] = useState<Set<string>>(() => new Set());
  const [hiddenItemIds, setHiddenItemIds] = useState<Set<string>>(() => new Set());
  const hide = (set: typeof setHiddenQueueIds, id: string, hidden: boolean) =>
    set((s) => {
      const next = new Set(s);
      if (hidden) next.add(id);
      else next.delete(id);
      return next;
    });

  const create = useUndoableMutation<{ title: string; onCreated?: (id: string) => void }, string>({
    strategy: "immediate",
    mutationFn: async ({ title, onCreated }) => {
      const { queue } = await createActivityQueue(classId, { clientId: newClientId(), title });
      put(queue);
      onCreated?.(queue.id);
      return queue.id;
    },
    undo: async (_vars, queueId) => {
      await deleteActivityQueue(classId, queueId);
      drop(queueId);
    },
    toast: ({ title }) => ({ title: `Queue created: ${title}` }),
    undoToast: () => ({ title: "Queue removed" }),
    invalidates: []
  });

  const rename = useUndoableMutation<{ queue: ActivityQueue; title: string }, void>({
    strategy: "immediate",
    mutationFn: async ({ queue, title }) => {
      put((await renameActivityQueue(classId, queue.id, { title })).queue);
    },
    undo: async ({ queue }) => {
      put((await renameActivityQueue(classId, queue.id, { title: queue.title })).queue);
    },
    toast: ({ title }) => ({ title: `Renamed to "${title}"` }),
    invalidates: []
  });

  const addItems = useUndoableMutation<{ queue: ActivityQueue; items: ActivityQueueItemInput[] }, string[]>({
    strategy: "immediate",
    mutationFn: async ({ queue, items }) => {
      const before = new Set(queue.items.map((i) => i.id));
      const { queue: next } = await addActivityQueueItems(classId, queue.id, { items });
      put(next);
      return next.items.filter((i) => !before.has(i.id)).map((i) => i.id);
    },
    undo: async ({ queue }, ids) => {
      for (const id of ids) put((await removeActivityQueueItem(classId, queue.id, id)).queue);
    },
    toast: (_vars, ids) => ({
      title: `Added ${ids?.length ?? 0} ${ids?.length === 1 ? "activity" : "activities"}`
    }),
    undoToast: () => ({ title: "Removed the added activities" }),
    invalidates: []
  });

  const reorder = useUndoableMutation<{ queue: ActivityQueue; ids: string[] }, void>({
    strategy: "immediate",
    mutationFn: async ({ queue, ids }) => {
      put((await reorderActivityQueue(classId, queue.id, { ids })).queue);
    },
    undo: async ({ queue }) => {
      put((await reorderActivityQueue(classId, queue.id, { ids: queue.items.map((i) => i.id) })).queue);
    },
    toast: () => ({ title: "Activity moved" }),
    invalidates: []
  });

  const removeItem = useUndoableMutation<{ queue: ActivityQueue; item: ActivityQueueItem }, void>({
    strategy: "defer",
    mutationFn: async ({ queue, item }) => {
      put((await removeActivityQueueItem(classId, queue.id, item.id)).queue);
    },
    undo: async () => undefined,
    toast: ({ item }) => ({ title: `Removed "${item.title}"`, message: "Only from this queue." }),
    onSchedule: ({ item }) => hide(setHiddenItemIds, item.id, true),
    onCancel: ({ item }) => hide(setHiddenItemIds, item.id, false),
    onCommitSuccess: ({ item }) => hide(setHiddenItemIds, item.id, false),
    invalidates: []
  });

  const removeQueue = useUndoableMutation<ActivityQueue, void>({
    strategy: "defer",
    mutationFn: async (queue) => {
      await deleteActivityQueue(classId, queue.id);
      drop(queue.id);
    },
    undo: async () => undefined,
    toast: (queue) => ({ title: `Deleted "${queue.title}"`, message: "The puzzles and chapters it used are untouched." }),
    onSchedule: (queue) => hide(setHiddenQueueIds, queue.id, true),
    onCancel: (queue) => {
      hide(setHiddenQueueIds, queue.id, false);
      void refresh();
    },
    onCommitSuccess: (queue) => hide(setHiddenQueueIds, queue.id, false),
    invalidates: []
  });

  return {
    addItems: addItems.run,
    adding: addItems.isPending,
    create: create.run,
    creating: create.isPending,
    hiddenItemIds,
    hiddenQueueIds,
    removeItem: removeItem.run,
    removeQueue: removeQueue.run,
    rename: rename.run,
    reorder: reorder.run
  };
}

const SKIP_LABELS: Record<CatalogQueueSkipReason, string> = {
  ALREADY_QUEUED: "already in the queue",
  INVALID: "not a valid puzzle",
  NOT_FOUND: "no longer in the catalogue",
  QUEUE_FULL: "the queue is full",
  UNAVAILABLE: "archived or in the Trash"
};

/** "2 already in the queue · 1 the queue is full" — one count per reason. */
export function describeCatalogQueueSkips(skipped: AddCatalogPuzzlesToQueueResponse["skipped"]): string | undefined {
  if (skipped.length === 0) return undefined;
  const counts = new Map<CatalogQueueSkipReason, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return `Skipped ${[...counts].map(([reason, n]) => `${n} ${SKIP_LABELS[reason]}`).join(" · ")}`;
}

type CatalogQueueAddVars = {
  /** null = create a new draft named `queueTitle` first. */
  queueId: string | null;
  queueTitle: string;
  sourceIds: string[];
  durationSeconds: number | null;
  onAdded: () => void;
};

/**
 * Lichess catalogue picks → a draft queue, lowest rating first (the API orders
 * and de-duplicates). `queueId: null` makes a new draft named `queueTitle`
 * first. Undo removes exactly the items this added (and a queue it created).
 */
export function useAddCatalogPuzzlesToQueue(classId: string) {
  const { drop, put } = useQueueCache(classId);
  const mutation = useUndoableMutation<CatalogQueueAddVars, AddCatalogPuzzlesToQueueResponse & { createdQueue: boolean }>({
    strategy: "immediate",
    mutationFn: async ({ queueId, queueTitle, sourceIds, durationSeconds, onAdded }) => {
      let target = queueId;
      if (!target) {
        const { queue } = await createActivityQueue(classId, { clientId: newClientId(), title: queueTitle });
        put(queue);
        target = queue.id;
      }
      const res = await addCatalogPuzzlesToQueue(classId, target, { durationSeconds, sourceIds });
      put(res.queue);
      onAdded();
      return { ...res, createdQueue: !queueId };
    },
    undo: async (_vars, res) => {
      if (res.createdQueue) {
        await deleteActivityQueue(classId, res.queue.id);
        drop(res.queue.id);
        return;
      }
      for (const id of res.addedItemIds) put((await removeActivityQueueItem(classId, res.queue.id, id)).queue);
    },
    toast: ({ queueTitle }, res) => {
      const added = res?.addedItemIds.length ?? 0;
      return {
        title: `Added ${added} ${added === 1 ? "puzzle" : "puzzles"} to "${res?.queue.title ?? queueTitle}"`,
        message: res ? describeCatalogQueueSkips(res.skipped) : undefined
      };
    },
    undoToast: () => ({ title: "Removed the added puzzles" }),
    invalidates: []
  });
  const run = mutation.run;
  /** Resolves true when the puzzles were added (a failure is already toasted). */
  const add = useCallback(
    async (vars: Omit<CatalogQueueAddVars, "onAdded">) => {
      let added = false;
      await run({ ...vars, onAdded: () => (added = true) });
      return added;
    },
    [run]
  );
  return { add, adding: mutation.isPending };
}

/** Writes a queue response into the list cache and refreshes its progress grid. */
function useRunResult(classId: string) {
  const qc = useQueryClient();
  const { put } = useQueueCache(classId);
  return useCallback(
    (queue: ActivityQueue) => {
      put(queue);
      void qc.invalidateQueries({ queryKey: queryKeys.activityQueues.progress(classId, queue.id) });
      void qc.invalidateQueries({ queryKey: queryKeys.activityQueues.current(classId) });
    },
    [qc, classId, put]
  );
}

// undo: intentionally excluded — launching shares the first activity with the
// whole class at once, and a queue runs once by design (confirmed up front).
export function useLaunchActivityQueue(classId: string) {
  const onResult = useRunResult(classId);
  const toast = useToast();
  return useMutation({
    mutationFn: (queueId: string) => launchActivityQueue(classId, queueId),
    onSuccess: ({ queue }) => {
      onResult(queue);
      toast.success({ title: `"${queue.title}" is live`, message: "The first activity is with the class." });
    },
    onError: (error: Error) => toast.error({ title: "Couldn't launch the queue", message: error.message })
  });
}

// undo: intentionally excluded — moving on is a broadcast every student reacts to.
export function useAdvanceActivityQueue(classId: string) {
  const onResult = useRunResult(classId);
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ queueId, fromItemId }: { queueId: string; fromItemId: string }) =>
      advanceActivityQueue(classId, queueId, { fromItemId }),
    onSuccess: ({ queue }) => {
      onResult(queue);
      if (queue.status === "FINISHED") toast.success({ title: "Queue finished", message: "Every activity is done." });
    },
    onError: (error: Error) => {
      // Usually a 409: another tab already moved on — show where the class really is.
      void qc.invalidateQueries({ queryKey: queryKeys.activityQueues.list(classId) });
      toast.error({ title: "Couldn't move on", message: error.message });
    }
  });
}

// undo: intentionally excluded — finishing closes the current activity for everyone (confirmed up front).
export function useFinishActivityQueue(classId: string) {
  const onResult = useRunResult(classId);
  const toast = useToast();
  return useMutation({
    mutationFn: (queueId: string) => finishActivityQueue(classId, queueId),
    onSuccess: ({ queue }) => {
      onResult(queue);
      toast.success({ title: "Queue finished" });
    },
    onError: (error: Error) => toast.error({ title: "Couldn't finish the queue", message: error.message })
  });
}
