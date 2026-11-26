# Weekly progress reports

A short report of each student's week, made from what the app already
records. **Phase A built 2026-11-26**: the facts, a template text, the
student's own **Weekly reports** page and a staff tab. Nothing is sent, no AI
writes anything, and nothing reaches a parent contact
([PARENT_REPORTS.md](PARENT_REPORTS.md)). Phases B–D (coach review and
approval, AI paragraph, email/WhatsApp, real parent accounts) are planned in
[FAMILY_PROGRESS_REPORT_PLAN.md](FAMILY_PROGRESS_REPORT_PLAN.md).

## Where things are

| Piece | Path |
|---|---|
| The rules (pure, shared) | `packages/types/src/weekly-reports.ts`: `buildWeeklyFacts`, `renderWeeklyReportText`, `mondayOf`, `weeklyReportRange`, `WEEKLY_REPORT_BUILD_HOUR` |
| Loader | `weekly-report/weekly-report.facts.ts` `loadWeeklyFacts` |
| API | `weekly-report/weekly-report.service.ts`; `API_ROUTES.weeklyReports.mine`, `.forStudent(id)`, `.preview(id)` |
| Job | `weekly-report/weekly-report.job.ts` (hourly, `JOB_LOCKS.weeklyReports`, per academy) |
| Table | `weekly_reports` (`WeeklyReport`), unique `(tenantId, studentId, weekStart)` |
| Web | `features/weekly-reports/`; page `/student/reports`; tab **Weekly reports** in `StudentProgressWorkspace` (staff) |
| Tests | `weekly-report.rules.spec.ts`, `weekly-report.service.spec.ts`, access rows |

## The week

Monday–Sunday on the **academy's** calendar (`Tenant.timezone`). A week's
report is built from **06:00 on the following Monday**, academy time
(`weekDueForReports`), after the nightly play review (03:00 IST) has reviewed
Sunday's play. The job runs at minute 23 of every hour, per academy, and builds
up to 300 students a run (the next hour carries on). Students: ACTIVE student
accounts in at least one live batch. One report per student and week: an
existing report is never rewritten.

## The facts (`WeeklyFacts`, frozen in `factsJson`)

| Section | Source and rule |
|---|---|
| Classes held / attended / missed, topics | Classes of the student's batches (not demos) that started in the week; **held** = `resolveClassDisplayStatus` COMPLETED; attended = PRESENT, LATE or PARTIAL; topic, else title |
| What the classes covered | Key points of those classes' **published** recaps only ([CLASS_RECAPS.md](CLASS_RECAPS.md)) |
| Homework | The student's homework due in the week: on time / late / not done, by `resolveAssignmentDueStatus` |
| Practice | Puzzles finished (any context) and solved; best Storm and Racer score; days with a finished Puzzle of the Day and the streak on the Sunday (`computeDailyStreak`); Smart Revision reviews (`REVISION` attempts) |
| Play | Items the engine reviewed that week, average accuracy, and the week before's |
| To work on / Doing well | The top weak spot and strength of the weak-spot profile on the week's last moment, **as the student sees it** (a tip only if the academy read it, [WEAK_SPOTS.md](WEAK_SPOTS.md)) |

Never in it: other students (no ranks or leaderboards), engine numbers beyond
accuracy, puzzle answers, private coach notes, transcript text.

`renderWeeklyReportText(facts, firstName)` writes one plain line per section
(first line "Asha's week, 16–22 Nov"); a week with nothing in it says so.
`templateText` = `finalText` in phase A.

## Who sees it

- **The student**: `/student/reports` (nav "Weekly reports"), newest week first,
  cursor-paged. Phase A shows the template report as soon as it is built — it
  holds only facts the student can already see elsewhere (the coach-approval
  step of the plan, WR-3/WR-4, applies to what will be *sent*, phase B–C).
- **Their coach and admins**: student page → **Weekly reports**: "This week
  so far" (`preview`, built on request and never stored) and every finished
  week exactly as the student sees it. `assertCanViewStudent`.
- On every plan (WR-2); no switch.

## Retention and privacy

Kept a year (`RETENTION_RULES`, `WEEKLY_REPORT_RETENTION_DAYS`, WR-5); in the
student's data export (`weeklyReports`); deleted with the account (cascade).
The privacy page lists it (`features/legal/content.ts`).

## Rolling back

Additive migration `20261126160428_weak_spot_tips_weekly_reports`. Rolling the
image back leaves the table unused; its rows mean nothing to older code.
