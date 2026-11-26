# Weekly progress report — plan

**Status: plan only (2026-11-26).** Nothing built. Owner decisions are at the
end (WR-1…WR-8). Depends lightly on [WEAK_SPOTS_PLAN.md](WEAK_SPOTS_PLAN.md)
(one line of the report); everything else uses data we already have.

## 1. The rule this plan must keep

[PARENT_REPORTS.md](PARENT_REPORTS.md) (2026-10-17): **nothing is sent or shown
to a parent contact** until there is a parent account and a verified
parent–child link. `parentName / parentEmail / parentPhone` are typed in by a
student or an admin; nothing proves the person behind them is the guardian,
and students are minors.

So v1 is a **weekly report in the student's own account**, delivered to the
**student account's own** contacts — the same choice Puzzle of the Day made
for WhatsApp (`User.phoneNumber`, never `parentPhone`). For young children the
account phone/email is usually the family's, so in practice the family sees
it; we just never treat a typed-in parent field as permission. Real parent
delivery is phase D and needs the PARENT_REPORTS.md prerequisites (WR-1).

## 2. What the report says

One report per student per academy week (Monday–Sunday in the academy's time
zone), built from **facts we already store** (a frozen `factsJson` snapshot):

| Section | Source |
|---|---|
| Classes: attended / held, missed ones | `ClassAttendance`, class availability (`class-availability.ts`) |
| What the classes covered | **Published** class recaps' key points only ([CLASS_RECAPS.md](CLASS_RECAPS.md)); else the class topics |
| Homework: done / due / late | `resolveAssignmentDueStatus` (the one rule) |
| Practice: puzzles solved, Storm/Racer best, Puzzle of the Day streak, Smart Revision reviews | puzzle attempts, solo rush runs, `DailyPuzzleEntry`, revision |
| Play: games and boards reviewed, accuracy this week vs last | play-review roll-up (`/rollup`) |
| One thing to work on, one strength | weak-spot profile (if phase B of WEAK_SPOTS is built; else left out) |
| A note from the coach (optional) | typed by the coach during review |

Never in it: other students (no ranks, no leaderboards), raw engine numbers,
puzzle answers, private coach notes, transcript text.

## 3. The words: a template, then AI

- **Always** a plain template report from the facts (works with AI off, and
  is the fallback).
- **AI paragraph (phase B)**: 3–5 warm, simple sentences on top, written from
  the facts only. The model gets **numbers and topic words, no name, no
  account id, no positions** ("the student attended 2 of 2 classes on forks
  and pins, solved 34 puzzles, …"); the first name is put in after.
  - New `AI_FEATURES` row `weeklyReport`, via `resolveAiFeatureRoute` /
    `completeOnRoute` (Auto = Groq).
  - **Grounding check**: every number in the answer must appear in the facts,
    no chess notation (`containsMoveNotation`), no student codes; otherwise the
    paragraph is dropped and the template is used.
  - Groq must be named for this in `features/legal/content.ts` first (it is
    named for class recaps today).
- Language: English in v1 (WR-6).

## 4. Review before anything is sent

- Drafts are made on the academy's **Saturday evening** by a job
  (`runInTenant` per academy, `JobLockService.runExclusive`), status DRAFT.
- The coach sees a **Weekly reports** list for their batches: each draft with
  its facts, edit the text, add a note, **Approve** (one by one or "approve
  all" per batch). Admin can do the same for any batch.
- On approval → APPROVED → sent (phase C). A draft not approved by
  **Monday 12:00** is SKIPPED, never sent (WR-3). Changes are status-filtered
  (409 on a race), as in class recaps.

## 5. Delivery (phase C)

- **In-app**: the student's **Reports** page (newest first, cursor-paged) and a
  notification.
- **Email** to the student account's email: the report text + "open in
  Nexa" (sign-in needed; no share token, no unauthenticated link).
- **WhatsApp** to the student account's phone: a Meta-approved *utility*
  template with the first name, the week and two or three numbers, plus the
  sign-in link — free text can't be sent outside the 24-hour window.
  `STOP` (`WhatsAppOptOutService`) is respected.
- All through `MessagingDispatchService`: a new `MessagingEvent`
  `WEEKLY_REPORT` + `NotificationType`, a messaging rule that ships **off**,
  each channel switchable, placeholders in `MESSAGE_VARIABLE_DOCS`.

## 6. Data

`WeeklyReport { id, tenantId, studentId, batchId?, weekStart (date), status
DRAFT|APPROVED|SENT|SKIPPED|FAILED, factsJson, templateText, aiText?,
finalText, coachNote?, model?, provider?, approvedById?, approvedAt?, sentAt? }`,
unique `(tenantId, studentId, weekStart)`. Additive migration; getter in
`PrismaService`; privacy export section `weeklyReports`; a `RetentionCategory`
(WR-5); not soft-deletable (derived, regenerated).

## 7. Phases

| Phase | Ships | Size |
|---|---|---|
| **A** | Facts builder (pure `buildWeeklyFacts` + loader), template text, `WeeklyReport` table, Saturday draft job, student **Reports** page and coach/admin preview. No AI, nothing sent | 1 session |
| **B** | Coach review list (edit, note, approve, approve all), AI paragraph with grounding check, legal page names the service | 1 session |
| **C** | Sending: messaging event + rule (off), email, WhatsApp template (owner creates it in WhatsApp Manager, Meta approves) | ½–1 session + Meta approval wait |
| **D** (later) | Real parent delivery: parent account, `GuardianLink`, `assertCanViewStudent` for parents, access-suite rows — PARENT_REPORTS.md §1–5 | 2–3 sessions, privacy review |

Each phase: plan feature gate (WR-2), unit specs for facts/grounding/status
rules, int-spec for the queries and the job, access rows, `npm run shots` for
the pages, docs (`docs/WEEKLY_REPORTS.md` replaces this plan; CLAUDE.md gets a
short §3.6 entry; PARENT_REPORTS.md links to it).

## 8. Owner decisions

- **WR-1 Who gets it in v1**: the student account's own email/WhatsApp
  (recommended; keeps PARENT_REPORTS.md), or build parent accounts first
  (phase D before C, several more sessions)?
- **WR-2 Plan**: Enterprise only, or every plan with only the AI paragraph on
  Enterprise (recommended)?
- **WR-3 Unapproved drafts**: skipped (recommended: a coach always reads what
  goes to a family), or sent as the template-only version?
- **WR-4 Coach effort**: per-student approve plus "approve all" per batch
  (recommended), or admin-only approval?
- **WR-5 Keep reports**: 1 year (recommended), or tie to an existing retention
  category?
- **WR-6 Language**: English only in v1 (recommended), or English + Tamil
  (the AI writes both; the coach checks both)?
- **WR-7 Day and time**: drafts Saturday 18:00, send on approval, cut-off
  Monday 12:00 (recommended), or another rhythm (fortnightly / monthly)?
- **WR-8 AI service**: Groq for the paragraph, named on the privacy page
  (recommended), or template only?
