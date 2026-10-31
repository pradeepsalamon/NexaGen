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
| [UI_RULES.md](UI_RULES.md) | Colour/radius tokens, which component for which control, pre-PR UI checklist |
| [RESPONSIVE.md](RESPONSIVE.md) | Breakpoints, per-area responsive spec, device test matrix |
| [AUTHORIZATION.md](AUTHORIZATION.md) | Auth mechanics (sessions, MFA, lockout, cookies, CSRF, headers), who may do what per resource, the 2026-10-16 audit, access test suites |
| [UNDO_ARCHITECTURE.md](UNDO_ARCHITECTURE.md) | `useUndoableMutation` design (immediate vs defer) |
| [UNIT_TEST_PLAN.md](UNIT_TEST_PLAN.md) | Original backend test inventory (last refreshed 2026-09-19) |
| [../.agents/SAFETY.md](../.agents/SAFETY.md) | Production/dev boundary any autonomous agent must honour |

## Features (living reference)

| Doc | What it covers |
|---|---|
| [LIVE_CLASS.md](LIVE_CLASS.md) | Everything inside the live-class room (LiveKit, board sync, moderation, puzzles, simul, …) |
| [CLASSES.md](CLASSES.md) | Class scheduling, timing rules, batch types, demo classes |
| [PUZZLES.md](PUZZLES.md) | Puzzle Library, puzzle-set homework, student progress |
| [SMART_REVISION.md](SMART_REVISION.md) | Spaced-repetition revision |
| [STUDENT_ACTIVITY_HISTORY.md](STUDENT_ACTIVITY_HISTORY.md) | Student activity history and progress summary |
| [FEATURES.md](FEATURES.md) | Feedback, Game Library, chat, reminders, revision, analysis, PDF import, SEO, privacy |
| [GAME_ANALYSIS.md](GAME_ANALYSIS.md) | Engine evaluation, move classification, accuracy, tactics |
| [GAME_SOURCES.md](GAME_SOURCES.md) | Importing a student's own games |
| [APPEARANCE.md](APPEARANCE.md) | Board appearance and typography resolvers |
| [PAYMENTS.md](PAYMENTS.md) | Payments, invoices, credit notes — read before touching `payments/` |
| [MESSAGING.md](MESSAGING.md) | Admin messaging rules and outbound WhatsApp |
| [EMAIL_ADMIN.md](EMAIL_ADMIN.md) | Email verification policy and staff direct email |
| [SAAS_PLANS.md](SAAS_PLANS.md) | Subscription tiers, feature gates, limits |
| [ai/architecture/ROADMAP.md](ai/architecture/ROADMAP.md) | AI runtime plan; ADRs and phase specs live beside it |

## Operations

| Doc | What it covers |
|---|---|
| [DEPLOYMENT.md](DEPLOYMENT.md) | CI, push-to-main deploys, rollback, backups; first-time VPS setup (Oracle Cloud, nginx, TLS, TURN) |
| [INFRASTRUCTURE.md](INFRASTRUCTURE.md) | BullMQ jobs, rate limiting, Sentry |
| [PROD_DOCKER_COMMANDS.md](PROD_DOCKER_COMMANDS.md) | Production container cheat sheet |
| [DATABASE_RESTORE.md](DATABASE_RESTORE.md) | Restoring a backup (CLI only) |
| [NEXA_CLI.md](NEXA_CLI.md) | The `nexa` dev/stage/prod helper |
| [PERF_CPU.md](PERF_CPU.md) | Measuring CPU contention on the VPS |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Symptom → where to look, per feature |
| [BACKLOG.md](BACKLOG.md) | Known gaps and the recurring root causes — read before a new feature |

## Design records & assessments (point-in-time)

| Doc | What it covers |
|---|---|
| [RELIABILITY_DESIGN.md](RELIABILITY_DESIGN.md) | P0 classroom reliability audit and design |
| [PUZZLE_CATALOGUE_ARCHITECTURE.md](PUZZLE_CATALOGUE_ARCHITECTURE.md) | Lichess catalogue + adaptive training audit |
| [PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md](PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md) | Lichess catalogue implementation spec |
| [SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) | Multi-tenant white-label assessment and Phase 1 design |
| [superpowers/specs/2026-10-19-multi-tenant-saas-design.md](superpowers/specs/2026-10-19-multi-tenant-saas-design.md) | Multi-tenant SaaS design spec |
| [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) | WhatsApp support chatbot assessment and plan |
| [PARENT_REPORTS.md](PARENT_REPORTS.md) | Parent reports — deferred, and why |
