# Undo Architecture

Provides a unified approach for undoing create, update, delete, and archive operations using the `useUndoableMutation` hook (`useUndoableMutation.ts`). See [`docs/UNDO_ARCHITECTURE.md`](../../../../../docs/UNDO_ARCHITECTURE.md) at the repo root for the full design and migration history.

Two strategies:

- **`immediate`** — the action runs now; Undo re-invokes a real reverse call (delete-by-id for a create, snapshot-revert for an update, the opposite action for a symmetric toggle like archive/restore, pause/resume, or cancel/restore).
- **`defer`** — nothing happens until the toast times out; Undo just cancels the timer. Use when the action has no reverse endpoint, when bulk/optimistic-hide UI is involved (see `TrashManagementClient.tsx`), or when nothing should visibly change until it actually commits (e.g. cancelling a class — see `CoachScheduleClient.tsx` / `CoachDashboardClient.tsx`).
  - Optional `onSchedule`/`onCancel` hooks let a `defer` site do optimistic UI (hide a row, then un-hide it if Undo is clicked).
  - Optional `onCommitSuccess` lets a `defer` site show a follow-up toast once the deferred action actually commits, when its copy depends on the result (see `ScheduleDetailClient.tsx`'s "End schedule").

## Exception List (Policy Exclusions)

Do NOT wrap the following operations in an undo, even though they are mutations. When skipping a mutation site for one of these reasons, leave a one-line comment at the call site (`// undo: intentionally excluded — <reason>`) so it is explicitly clear.

- **Permanent delete** — `emptyTrash`, `deleteTrashItemPermanently`, bulk permanent delete. Irreversible by design; a fake undo would lie.
- **Coach moderation force-mute** (`POST /live-class/:id/moderate`) — No-server-unmute is a deliberate privacy boundary.
- **Recording start/stop / egress actions** — external process side effects, not cleanly reversible.
- **Starting a live class** (`useStartLiveClass`) — opens the LiveKit room and admits participants, an external one-way side effect.
- **Mid-class `updateLiveSettings`** (`useUpdateLiveSettingsMidClass`) — reaches every connected participant's grants instantly via a server broadcast. A silent client-side revert wouldn't re-broadcast correctly. Keep the success toast, skip the Undo action.
- **Live-class puzzle assign / end** (`useAssignLivePuzzle`, `useEndLivePuzzle`) — a `PUZZLE_ASSIGNED` / `PUZZLE_ENDED` packet fans out to every participant instantly; students may already be mid-solve. Same reasoning as mid-class settings. "Swap puzzle" (re-assign) is the natural correction.
- **Mid-class puzzle edits** — `useUpdateLivePuzzle` (rules change, broadcast as `PUZZLE_UPDATED`) and `useAdjustLivePuzzlePoints` (an adjustment is its own reverse: the opposite +/- button). Same reasoning as `updateLiveSettings`.
- **Activity queue launch / advance / finish** (`useLaunchActivityQueue`, `useAdvanceActivityQueue`, `useFinishActivityQueue`) — each one shares a puzzle, asks a question or closes one for the whole class at once (a `QUEUE_CHANGED` + `PUZZLE_ASSIGNED` / `move_poll` broadcast), and a queue is launched once by design. Launch and Finish are confirmed up front instead. Draft edits (create, add, reorder, remove, delete) keep their undo.
- **Live-class move poll ("Response")** (`useStartLiveMovePoll`, `useUpdateLiveMovePoll`, `useEndLiveMovePoll`, `useAnswerLiveMovePoll`) — every change is a `move_poll` broadcast students react to at once; asking a new question or reopening is the correction, and a student simply plays a different move while it is open.
- **Singleton settings-form Save actions** — `useUpdatePuzzleScoringSettings` (puzzle points defaults), `useUpdateLiveClassPolicy` (system defaults), `useUpdateBatchLiveClassSettings` (batch defaults), `useUpdateClassLiveSettings` (per-class settings), `useUpdateTypographyMutation` / `useUpdateTypographyAdminMutation` (fonts & text size), `ProfileForm`'s own-account update. These are Save buttons on a config panel, not row actions in a list — no natural place for a transient undo toast, and reverting silently would fight the multi-layer settings-inheritance system (or, for the profile form, might silently revert a password change).
- **Bulk archive / delete via `BulkActionsBar`** (`useBulkAction`, Batches + Users tables) — confirmed up front by `ConfirmationModal`, then `BulkResultDialog` reports per-row success/skip. One toast cannot undo a partial batch cleanly; single-row archive/delete keep their undo, and bulk-deleted rows restore from Trash.
- **Puzzle folder delete** (`DeleteFolderDialog` in `TopicManager.tsx`, `DELETE /puzzles/topics/:id`) — takes the subtree *and every puzzle in it*, so it is confirmed up front with the counts named; the reverse is Restore in Trash (Super Admin only, one restore brings the whole group back), which a plain admin's toast couldn't call.
- **Puzzle folder bulk edit** (`BulkEditPuzzlesDialog`, `POST /puzzles/bulk-update`) — same reasoning as bulk archive/delete: a review + confirm step up front, then `BulkResultDialog` lists skipped puzzles; one toast can't restore each puzzle's own previous values.
- **Notifications/emails** — cannot unsend. `useMarkNotificationsRead` specifically: no reverse endpoint, and marking read carries no real risk of an unwanted "oops."
- **Attendance webhook-driven writes** — system-generated, not a user action.
- **Auth actions** — password reset, login/logout, session revoke.
- **Batch schedule create** (`useCreateScheduleMutation`) — generates potentially hundreds of classes at once and navigates away on success; no delete endpoint exists to revert to anyway.
- **Batch schedule regenerate** (`useRegenerateScheduleMutation`) — complex bulk/recurring operation affecting every future class in the schedule. (Deactivate and per-occurrence cancel/restore/reschedule *are* migrated — see `ScheduleDetailClient.tsx`.)
- Coaches no longer create classes (the academy schedules them). Coach class **notes update** and **cancel** *are* migrated — see `ClassNotesDialog.tsx` / `CoachScheduleClient.tsx` / `CoachDashboardClient.tsx`.
- **Preset set-default** (`useSetDefaultLiveClassPreset`) — no single reverse target: an unknown other preset (or none) held the default before.
- **Persistent chat** (`features/chat`) — a sent message cannot be unsent (no delete endpoint), mark-read carries no risk, opening a direct thread is an idempotent lookup, and a new group has no delete endpoint; group membership is a Save in a dialog whose correction is reopening it.
- **Smart Revision** — a revision rating / skip is a scheduling event the student just made (re-rating is not a thing, and a replay returns the recorded one); a coach's *Recommend* can update an item the student already had, so it has no clean reverse — withdrawing it is the list's Remove button, which does keep a (deferred) Undo.
- **Knowledge base editor** (`features/knowledge`) — Save draft, Save settings, Publish and Rollback are versioned: every content change is a new version and every settings change is in the article's change log, so rolling back is the correction. Declining a coach suggestion (the coach sees the note and can suggest again), bulk import (drafts only) and permanent delete (super admin, `AlertDialog`) are excluded too. Archive/restore, unpublish and category create/archive keep an immediate Undo; withdraw-suggestion, dismiss-question and category delete are `defer`.
- **Student Assignments** — `updateMyAssignmentStatus`, `startAttempt`, `submitAttempt` are complex/irreversible workflows.

Everything else that looked deferrable has been migrated: preset create/update/delete/duplicate, batch/user/assignment create/update/delete/archive, demo class cancel/restore, coach class update/cancel, batch schedule pause/resume and per-occurrence cancel/restore/reschedule, and assignment delete/withdraw.
