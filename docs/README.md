# Docs index

Start with [CLAUDE.md](../CLAUDE.md) (architecture, patterns, the rules that
break the build) and [AGENTS.md](../AGENTS.md) (the short rule list every AI
agent loads). [README.md](../README.md) is the feature tour and local setup.

**Keeping docs current:** a change to behaviour, commands or env vars updates the
matching doc in the same change. A new feature's detail goes in its feature doc
below (or a new `docs/<FEATURE>.md` added to this index); CLAUDE.md only gets a
2–5 line summary under its § number. Design records are point-in-time — they
stay as written; the living doc for that area wins where they disagree.

## Rules & conventions

| Doc | What it covers |
|---|---|
| [PROJECT_RULES.md](PROJECT_RULES.md) | Development manual: repo shape, backend/frontend conventions, testing, git |
| [UI_RULES.md](UI_RULES.md) | Colour/radius tokens, which component for which control, form errors, pre-PR UI checklist |
| [FORM_VALIDATION_AUDIT.md](FORM_VALIDATION_AUDIT.md) | 2026-11-17 inventory of every form and dialog with inputs: validation, how errors show, what changed, how it was tested |
| [RESPONSIVE.md](RESPONSIVE.md) | Breakpoints, per-area responsive spec, device test matrix |
| [API_DEVELOPMENT_RULES.md](API_DEVELOPMENT_RULES.md) | **Strict** rules for any API change: contract, auth, validation, academy isolation, schema, side effects, errors, tests, definition of done |
| [AUTHORIZATION.md](AUTHORIZATION.md) | Auth mechanics (sessions, MFA, lockout, cookies, CSRF, headers), who may do what per resource, the 2026-10-16 audit, access test suites |
| [PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md](PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md) | Platform-wide permission model (direct / approval / admin-only / consent), the admin-approval engine design, roadmap and progress |
| [PAGINATION.md](PAGINATION.md) | Which lists use offset pages vs keyset cursors + infinite scroll, the API/web helpers, lazy loading |
| [UNDO_ARCHITECTURE.md](UNDO_ARCHITECTURE.md) | `useUndoableMutation` design (immediate vs defer) |
| [UNIT_TEST_PLAN.md](UNIT_TEST_PLAN.md) | Original backend test inventory (last refreshed 2026-09-19) |
| [../.agents/SAFETY.md](../.agents/SAFETY.md) | Production/dev boundary any autonomous agent must honour |

## Features (living reference)

| Doc | What it covers |
|---|---|
| [LIVE_CLASS.md](LIVE_CLASS.md) | Everything inside the live-class room (LiveKit, board sync, moderation, puzzles, simul, …) |
| [live-class/](live-class/LIVE_CLASS_COMPONENT_MAPPING.md) | Live-room UI redesign (2026-11-03): component map, architecture, design system, screens, reports |
| [CLASSES.md](CLASSES.md) | Class scheduling, timing rules, batch types, demo classes |
| [PUZZLES.md](PUZZLES.md) | Puzzle Library, puzzle-set homework, student progress |
| [PUZZLE_ACTIVITIES.md](PUZZLE_ACTIVITIES.md) | MCQs and Playouts in the Puzzle Library and the live class |
| [PUZZLE_RUSH_SOLO.md](PUZZLE_RUSH_SOLO.md) | Puzzle Storm / Racer played alone, with a batch leaderboard |
| [SMART_REVISION.md](SMART_REVISION.md) | Spaced-repetition revision |
| [STUDENT_ACTIVITY_HISTORY.md](STUDENT_ACTIVITY_HISTORY.md) | Student activity history and progress summary |
| [FEATURES.md](FEATURES.md) | Feedback, Game Library, chat, reminders, revision, analysis, PDF import, SEO, privacy |
| [GAME_ANALYSIS.md](GAME_ANALYSIS.md) | Engine evaluation, move classification, accuracy, tactics |
| [GAME_SOURCES.md](GAME_SOURCES.md) | Importing a student's own games |
| [TOURNAMENTS.md](TOURNAMENTS.md) | Tournament platform (Swiss, Arena, Round Robin, Knockout): assessment and phased plan — not built yet |
| [APPEARANCE.md](APPEARANCE.md) | Board appearance and typography resolvers |
| [PAYMENTS.md](PAYMENTS.md) | Payments, invoices, credit notes — read before touching `payments/` |
| [REFERRALS.md](REFERRALS.md) | Referral links, pipeline stages and their rewards, milestone bonuses, points and the vouchers students buy with them, staff payouts and the SALES role |
| [MESSAGING.md](MESSAGING.md) | Admin messaging rules and outbound WhatsApp |
| [EMAIL_ADMIN.md](EMAIL_ADMIN.md) | Email verification policy and staff direct email |
| [SAAS_PLANS.md](SAAS_PLANS.md) | Subscription tiers, feature gates, limits |
| [ai/architecture/ROADMAP.md](ai/architecture/ROADMAP.md) | AI runtime plan; ADRs and phase specs live beside it |

## Operations

| Doc | What it covers |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | CI, push-to-main deploys, rollback, backups; first-time VPS setup (Oracle Cloud, nginx, TLS, TURN) |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | BullMQ jobs, rate limiting, Sentry |
| [SERVICE_STATUS.md](SERVICE_STATUS.md) | What users see when the app is down, deploying, in maintenance, crashed, outdated or offline (nginx status page, `error.tsx`, offline pill) |
| [PROD_DOCKER_COMMANDS.md](PROD_DOCKER_COMMANDS.md) | Production container cheat sheet |
| [DATABASE_RESTORE.md](DATABASE_RESTORE.md) | Restoring a backup (CLI only) |
| [NEXA_CLI.md](NEXA_CLI.md) | The `nexa` dev/stage/prod helper |
| [PERF_CPU.md](PERF_CPU.md) | Measuring CPU contention on the VPS |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Symptom → where to look, per feature |
| [investigations/](investigations/) | Dated root-cause write-ups (2026-11-05: empty 400s after an engine stream) |
| [BACKLOG.md](BACKLOG.md) | Known gaps and the recurring root causes — read before a new feature |

## Design records & assessments (point-in-time)

| Doc | What it covers |
|---|---|
| [RELIABILITY_DESIGN.md](RELIABILITY_DESIGN.md) | P0 classroom reliability audit and design |
| [PUZZLE_CATALOGUE_ARCHITECTURE.md](PUZZLE_CATALOGUE_ARCHITECTURE.md) | Lichess catalogue + adaptive training audit |
| [PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md](PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md) | Lichess catalogue implementation spec |
| [SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) | Multi-tenant white-label SaaS plan: assessment, owner decisions, roadmap |
| [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) | WhatsApp support bot and `/admin/support` inbox: as built (Phases 1–2) and the plan |
| [WHATSAPP_SUPPORT_MODES_PLAN.md](WHATSAPP_SUPPORT_MODES_PLAN.md) | Proposal: multi-academy WhatsApp, conversation ownership, Native / External helpdesk / Hybrid support modes; decisions first |
| [PARENT_REPORTS.md](PARENT_REPORTS.md) | Parent reports — deferred, and why |
| [NIGHT_RUN_2026-11-16.md](NIGHT_RUN_2026-11-16.md) | Work list for the 2026-11-16 unattended run: home/academy swap, Storm fixes and follow-ups, WebKit PDF import, D5 rehearsal; remove once done |
| [NIGHT_RUN_2026-11-17.md](NIGHT_RUN_2026-11-17.md) | Work list for the 2026-11-17 unattended run: desktop overlay nav with rail flyouts (mobile unchanged), app-wide form validation audit and sweep; remove once done |
