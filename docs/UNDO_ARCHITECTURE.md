# Undo Architecture — unified design for create / update / delete / archive

Status: **implemented.** `useUndoableMutation` (`apps/web/src/lib/undo/`) has
replaced the three patterns audited below (77 calls in 39 files on 2026-10-31,
counting the generic `useUndoableMutation<…>(` form; no raw
`useToast().undoable()` callers left). The living reference, including the
exclusion list, is [`apps/web/src/lib/undo/README.md`](../apps/web/src/lib/undo/README.md).
What follows is the original design brief, kept for its reasoning: §1 and its
line links describe the code *before* the migration.

## 1. Current state (audit)

There is no single "undo system" today — three independent implementations
do the same job, plus zero coverage for create/update:

| Pattern | Where | How it works |
|---|---|---|
| **Deferred-commit** (`useToast().undoable()`, [ToastProvider.tsx:111](../apps/web/src/providers/ToastProvider.tsx#L111)) | [PresetCard.tsx](../apps/web/src/features/live-class/settings/PresetCard.tsx), [ScheduleDetailClient.tsx](../apps/web/src/features/batch-schedules/components/ScheduleDetailClient.tsx), [CoachScheduleClient.tsx](../apps/web/src/features/coach/components/CoachScheduleClient.tsx), [CoachDashboardClient.tsx](../apps/web/src/features/coach/components/CoachDashboardClient.tsx), [CoachAssignmentsClient.tsx](../apps/web/src/features/assignments/components/CoachAssignmentsClient.tsx) (×2), [AdminAssignmentsClient.tsx](../apps/web/src/features/assignments/components/AdminAssignmentsClient.tsx) | Nothing hits the API until a `setTimeout` (default 6s) fires. Undo just cancels the timer. Zero wasted requests, but the action is invisible to everyone else until it commits. |
| **Immediate + reverse mutation**, hand-duplicated per component | [UserManagementClient.tsx:106-179](../apps/web/src/features/users/components/UserManagementClient.tsx#L106-L179), [BatchManagementClient.tsx:106-179](../apps/web/src/features/batches/components/BatchManagementClient.tsx#L106-L179) (byte-for-byte the same logic, copy-pasted), [DemoClassesClient.tsx:80-118](../apps/web/src/features/admin/components/DemoClassesClient.tsx#L80-L118) (a `useRef` variant to dodge a closure cycle) | The action fires immediately; the toast's Undo button calls the opposite endpoint (archive↔restore, delete↔restore-from-trash, cancel↔restore). |
| **Bespoke third implementation** | [TrashManagementClient.tsx:144-161](../apps/web/src/features/trash/components/TrashManagementClient.tsx#L144-L161) | Its own `setTimeout` + `pendingActions` state object, not routed through `useToast().undoable()` at all. |

Also note: `useArchiveBatchMutation` / `useRestoreBatchMutation` (and the
`Users` equivalents) accept an `isUndo?: boolean` in their mutate-variables
purely so the *caller* can pick different toast copy — the flag is dead
inside `mutationFn` itself. That's boilerplate this refactor removes.

**Create and update have no undo anywhere in the codebase.** Every existing
case is a delete/archive/cancel toggle between two states the backend
already exposes both directions of.

`ToastProvider`/`<Toaster/>` is mounted once at the app root
([AppProviders.tsx](../apps/web/src/providers/AppProviders.tsx)), so a toast
survives client-side navigation — a form that closes a modal or routes to
the new entity's detail page after a successful create does **not** kill an
in-flight undo toast. This is what makes create/update undo viable at all.

## 2. Target design

One hook, two strategies, no backend changes required (every reverse action
below already has an existing endpoint).

```
apps/web/src/lib/undo/
  types.ts                  # shared types
  useUndoableMutation.ts    # the one hook — both strategies
  useUndoableMutation.spec.ts
  README.md                 # usage + the exception list from §4, kept in sync with this doc
```

### 2.1 Types

```ts
// apps/web/src/lib/undo/types.ts
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
};

export type UndoableMutationResult<TVars> = {
  run: (vars: TVars) => void;
  isPending: boolean;
};
```

### 2.2 Hook

```ts
// apps/web/src/lib/undo/useUndoableMutation.ts
// Sketch — fill in using useToast()/useQueryClient() exactly as the existing
// hand-rolled call sites do today (see UserManagementClient.tsx for the
// shape of the success/error toast calls to match).

export function useUndoableMutation<TVars, TResult>(
  config: UndoableMutationConfig<TVars, TResult>
): UndoableMutationResult<TVars> {
  // strategy "defer":
  //   - setTimeout(() => runForward(vars), delayMs ?? 6000)
  //   - toast.undoable-equivalent: action.onClick clears the timer
  //   - on fire: call mutationFn, invalidate, no further toast (matches
  //     current toast.undoable — it doesn't show a second toast on commit)
  //
  // strategy "immediate":
  //   - call mutationFn(vars) right away
  //   - on success: invalidate, show toast(vars, result) with
  //     action: { label: "Undo", onClick: () => runUndo() }
  //   - runUndo(): call undo(vars, result), invalidate, show undoToast
  //     (default: info "Action undone.")
  //   - on mutationFn error: show error toast, no undo offered
}
```

This is the **only** new abstraction. `useToast().undoable()` in
`ToastProvider.tsx` stays as-is — it's already a single shared
implementation of the "defer" strategy, so there's no duplication to remove
there. `useUndoableMutation` can call it internally for the `"defer"` branch
rather than reimplementing the timer, or reimplement the ~10 lines directly;
either is fine, prefer delegating to avoid two timer implementations.

## 3. Extending to create and update

Both reuse `strategy: "immediate"` — you cannot defer a create the user is
staring at, or an update whose new value is already rendered.

### 3.1 Create → undo = delete the new row

```ts
useUndoableMutation({
  mutationFn: (payload: CreateBatchRequest) => createBatch(payload),
  undo: (_vars, result) => deleteBatch(result.id),
  strategy: "immediate",
  toast: (vars) => ({ title: `"${vars.name}" created` }),
  invalidates: [queryKeys.batches.all],
});
```

Works everywhere a create has a corresponding delete endpoint — which, given
§3.4 of `CLAUDE.md` (soft-delete via `TrashRepository`), is every
trash-enabled model already. No new API surface needed.

### 3.2 Update → undo = re-apply the previous snapshot

The "previous state" must come from memory, **never** a network re-fetch
purely to build an undo snapshot (not worth the latency/complexity — if you
don't have it in memory, this mutation is not a good undo candidate; see
§4).

Two acceptable sources, in priority order:

1. **The edit form already loaded the current row before the user changed
   it.** Capture that object in the submit handler, pass it through as
   `vars.previous`. This is the common case — zero extra cost.
2. **Inline quick-edit of a row from a list** (no form, e.g. a status
   dropdown in a table) — read the current cached row via
   `queryClient.getQueryData(queryKeys.x.detail(id))` immediately before
   calling mutate.

```ts
useUndoableMutation({
  mutationFn: (vars: { id: string; payload: UpdateBatchRequest; previous: Batch }) =>
    updateBatch(vars.id, vars.payload),
  undo: (vars) => updateBatch(vars.id, toUpdatePayload(vars.previous)),
  strategy: "immediate",
  toast: () => ({ title: "Batch updated" }),
  invalidates: [queryKeys.batches.all, queryKeys.batches.detail(vars.id)],
});
```

`toUpdatePayload` is a small per-feature mapper from the full entity shape
back to the subset of fields `UpdateXRequest` accepts — write one per entity
being migrated, not a generic one (the shapes diverge enough that a generic
mapper would be riskier than three explicit ones).

## 4. Decision framework — what gets undo and what's excluded

Apply this to every mutation site being considered, don't skip straight to
"add undo everywhere." A site qualifies only if **all** of these hold:

1. Reversible via an existing (or trivial, e.g. `deleteX(newId)`) endpoint —
   no new backend work.
2. No side effect outside our own DB that a silent revert would leave
   dangling: an email/notification already sent, a LiveKit room grant
   already broadcast to other connected participants, an external process
   already kicked off (egress/recording), a webhook-driven system write.
3. The "before" state for update-undo is available in memory per §3.2 —
   don't fetch to build it.
4. It isn't already both-directions-obvious in the UI (e.g. a visible toggle
   the user can just click back) — undo is a nice-to-have there, not a
   priority.

### Explicit exclusions (do not wrap, even though they're mutations)

- **Permanent delete** — `emptyTrash`, `deleteTrashItemPermanently`, bulk
  permanent delete. Irreversible by design; a fake undo would lie.
- **Coach moderation force-mute** (`POST /live-class/:id/moderate`) —
  `CLAUDE.md` §3.7 documents no-server-unmute as a deliberate privacy
  boundary. Do not add an undo path around it.
- **Recording start/stop / egress actions** — external process side effects,
  not cleanly reversible.
- **Mid-class `updateLiveSettings`** — reaches every connected participant's
  grants instantly via `RoomServiceClient.updateParticipant` +
  `SETTINGS_UPDATE` broadcast. A silent client-side revert wouldn't
  re-broadcast correctly. Keep the success toast, skip the Undo action.
- **Notifications/emails** (anything through the `mail` module) — can't
  unsend.
- **Attendance webhook-driven writes** — system-generated, not a user
  action, nothing to undo.
- **Auth actions** — password reset, login/logout, session revoke.

When you skip a mutation site for one of these reasons, leave a one-line
comment at the call site (`// undo: intentionally excluded — <reason>`) so
it's greppable and future edits don't "fix" the omission by accident.

## 5. Migration plan (phased)

Each phase should be its own PR/commit — don't bundle.

**Phase 1 — build the hook.** `useUndoableMutation` + `types.ts` +
`useUndoableMutation.spec.ts` (unit tests only: defer-mode timer
fires/cancels correctly, immediate-mode calls `undo` and shows the right
toast copy, error path shows an error toast and does not offer undo). No
call-site changes yet.

**Phase 2 — dedupe the existing immediate+reverse sites.** Migrate
`UserManagementClient.tsx`, `BatchManagementClient.tsx`,
`DemoClassesClient.tsx` onto the new hook; delete
`TrashManagementClient.tsx`'s bespoke `setTimeout`/`pendingActions` code
entirely and replace with the hook. Drop the now-pointless `isUndo` param
from `useArchiveBatchMutation`/`useRestoreBatchMutation` and the `Users`
equivalents — the hook owns which toast copy to show, mutations don't need
to know they're being undone.

**Phase 3 — leave the deferred sites alone.** `toast.undoable()` call sites
(PresetCard, ScheduleDetailClient, CoachScheduleClient,
CoachDashboardClient, CoachAssignmentsClient, AdminAssignmentsClient) are
already using a single shared implementation — there's no duplication bug to
fix there. Optionally re-point them at `useUndoableMutation({ strategy:
"defer", ... })` for naming consistency, but this is cosmetic — do it last,
if at all, and only if it doesn't change behavior.

**Phase 4 — pilot create-undo.** Pick 2–3 highest-value flows: Batch create,
User create, Assignment create. Wire per §3.1. Confirm the toast survives
whatever navigation/modal-close happens on success (it should, per §1).

**Phase 5 — pilot update-undo.** Batch update, User update. Wire per §3.2,
capturing the snapshot in the existing edit form's submit handler.

**Phase 6 — audit remaining mutation sites.** Walk every `use*Mutation` in
`apps/web/src/features/*/hooks/use*Api.ts` against §4. For each: either
migrate to `useUndoableMutation`, or leave it and add the exclusion comment.
Update `lib/undo/README.md` with the final exclusion list (mirror §4 of this
doc, don't let the two drift).

**Phase 7 — docs.** Replace `CLAUDE.md` §3.6's two-paragraph undo
description with a pointer to `lib/undo/README.md`, since that file becomes
the source of truth once the hook exists.

## 6. What this plan deliberately does NOT do

- No backend/API changes — every reverse action needed already exists
  (delete, restore-from-trash, update).
- No generic snapshot/diffing engine for update-undo — explicit per-entity
  `toUpdatePayload` mappers only (§3.2).
- No undo for the excluded categories in §4, regardless of how the
  migration audit in Phase 6 turns out — those are policy exclusions, not
  gaps to fill later.
- No change to `useToast().undoable()`'s external API — Phase 3 is opt-in
  cosmetic cleanup, not required for correctness.
