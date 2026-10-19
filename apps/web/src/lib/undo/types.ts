import type { QueryKey } from "@tanstack/react-query";

export type UndoStrategy = "defer" | "immediate";

export type UndoableMutationConfig<TVars, TResult> = {
  /** The forward action. */
  mutationFn: (vars: TVars) => Promise<TResult>;

  /** How to reverse it. Receives the original vars and the forward result
   *  (e.g. the new row's id from a create). */
  undo: (vars: TVars, result: TResult) => Promise<unknown>;

  /**
   * "defer"     — nothing happens until the toast times out; Undo just cancels
   *                the timer. Use when the action has no visible effect on
   *                anyone else until it commits (the current toast.undoable
   *                behavior).
   * "immediate" — the action runs now; Undo re-invokes `undo`. Required for
   *                anything the user (or other users) sees update right away
   *                — creates, updates, and any action already using a
   *                reverse-endpoint today.
   */
  strategy: UndoStrategy;

  /** Toast copy shown right after the forward action (or, in "defer" mode,
   *  right after scheduling it). */
  toast: (vars: TVars, result?: TResult) => { title: string; message?: string };

  /** Toast copy shown after Undo completes. Defaults to a generic
   *  "Action undone." info toast. */
  undoToast?: (vars: TVars) => { title: string; message?: string };

  /** Query keys to invalidate after the forward action AND after undo. */
  invalidates: QueryKey[];

  /** "defer" only. Default 6000ms (matches current toast.undoable default). */
  delayMs?: number;

  /** "defer" only. Fires immediately when the action is scheduled (before the
   *  delay) — use for optimistic UI, e.g. hiding the affected rows. */
  onSchedule?: (vars: TVars) => void;

  /** "defer" only. Fires if Undo is clicked before the timer commits — use to
   *  reverse whatever onSchedule did. */
  onCancel?: (vars: TVars) => void;

  /** "defer" only. Fires after mutationFn succeeds and invalidation runs —
   *  use when the deferred action itself needs a follow-up toast whose copy
   *  depends on the result (e.g. a count from the response). */
  onCommitSuccess?: (vars: TVars, result: TResult) => void;
};

export type UndoableMutationResult<TVars> = {
  run: (vars: TVars) => Promise<void>;
  isPending: boolean;
};
