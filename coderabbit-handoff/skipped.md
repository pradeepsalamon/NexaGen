# Skipped CodeRabbit findings

## PR #59
- messaging-delivery.worker.ts sweep job lock — by design: FOR UPDATE SKIP LOCKED claim lets several containers share the outbox without double sends; a lock would serialize it.
- payments controllers (invoices-admin, payments-admin, payments, manual-payment) auth in controller → service — heavy refactor; every route already authenticates + role-checks before the service. Added assertAdmin inside ManualPaymentService.approve/reject as the concrete gap.
- provider-health getHealth / payments-admin overview DB-side aggregation — performance only; did add the currency filter.
- payment.service in-flight replay "persist handoff" — needs a schema column; instead the replay now sends the exact same createPayment input as openAttempt so the gateway idempotency key replays cleanly.

## PR #60
- payroll-admin.controller / payroll.controller auth into services — same convention-only refactor as payments; routes authenticate via the shared authenticateUser + assertAdmin/assertOwnerOrAdmin.
- stockfish AnalyzePositionDto "not validated" — false positive: app.setup.ts installs a global ValidationPipe, so the class-validator decorators run.
- job-lock fencing token — the lost-lease AbortSignal is added; a fencing token through every protected write is a larger redesign.
- payroll wouldBeEarnings FIXED_SALARY — deliberately left at 0: a monthly salary is not earned per class, so a cancellation percentage of it would overpay.

## PR #61
- apps/web/Dockerfile standalone paths ("Critical") — false positive: in this monorepo Next 14 traces from the repo root, so server.js lands at standalone/apps/web/server.js, which is what the CMD runs; production web deploys succeed.
- whatsapp uploadMedia timeout retryability — left retryable: a duplicate media upload is invisible, unlike a duplicate message (send() timeouts are now non-retryable).

## PR #63
- Academy hardcoded colours (AcademyNavbar, DemoBookingSection, academy sections) — docs/UI_RULES.md exempts the academy marketing site ("has its own brand"); its a11y findings were fixed.
- RowActions "More actions" title= → SimpleTooltip — CLAUDE.md §3.6 explicitly allows title= on an element that is already an asChild Radix trigger (keeps aria-label).
- DemoClassRowActions / DemoClassDetailsDialog filled icon-button colours — these are the filled classes UI_RULES §3 prescribes for hand-written row actions (variant ghost + filled tone).

## PR #65
- MasterbasePanel backend proxy — the Lichess explorer now 401s every anonymous request (verified with curl). A proxy needs a Lichess API token the academy must create; for now the panel says "Masterbase is unavailable right now." on 401 and game links point at the real game.
- ChessClock title= — on a PopoverTrigger asChild (CLAUDE.md exception). MoveTreeView's redundant title was removed anyway (the button has visible text).
- AdminClassRequestsClient approve/reject, AdminCoursesClient/ModuleList icon buttons, LeadRowActions, GameSourcesCard unlink colours — the filled-tone pattern UI_RULES §3 prescribes for row actions.
- CoachFeedbackClient key — the API groups by (questionId, questionLabel), so one questionId can appear twice; the composite key is correct.
- DashboardFeedback lazy sessionStorage init — would mismatch SSR markup; fixed the real race instead (pop-up isn't picked until the dismissed list has loaded).
- FeedbackQuestionnaire text-white on bg-primary — no primary-foreground token exists; this is the primary Button's own pairing.
- CoachClassDetailsDialog window.location.assign — replaced by the shared openInNewTab helper (new tab opened inside the click, opener cut), used by all 7 recording-download call sites.

## PR #67
- MessagingRulesPanel, AdminPrivacyClient icon buttons — the filled-tone row-action pattern (UI_RULES §3).
- ManualPaymentsPanel approve — implemented as a confirmation dialog (approval grants access and issues an invoice, so no undo).

## PR #68
- uploadApi "remove the explicit multipart Content-Type" — kept: the axios client defaults to application/json, and axios 1.x JSON-serialises a FormData body under a JSON content type, which would break uploads. Routes now go through API_ROUTES.upload.
- packages/config getCookieDomain → host-only — documented by design in CLAUDE.md (auto-derives `.registrable.tld` so the session spans api./www.).
- e2e-qa Start-button / card scoping and analytics `loginContext` — done; diagram-import keeps one serial `beforeAll` login (shared `login`, not per-test `loginContext`) because eight tests would trip the 5/min login throttle.
- recording-flow "assert recordingBytes" — the details API exposes neither status nor bytes; asserts `hasRecording` and keeps the existing body-length check against the fixture size.

## PR #69
- game-analysis forced-mate → BEST: fixed without bumping MOVE_CLASSIFICATION_VERSION. docs/GAME_ANALYSIS.md already said "still mating, just slower → GOOD", so an equally fast mate graded GOOD was a bug against the documented v1 rule; a bump would also have excluded every past report from insights.
- scripts/nexa.sh "gitignore the dev/prod logs" — already covered: .gitignore has `*.log`.
- scripts/responsive/capture.mjs "require passwords from env" — these are the public dev-seed accounts (documented in CLAUDE.md and responsive/README.md; the seed refuses NODE_ENV=production). Requiring env vars would break the documented `npm run shots` verification step.

## PR #57
- Finding #8: class-reminder.worker.ts — reminder tasks scheduled via existing queue patterns; modifying job deduplication without migration would risk dropping queued notifications.
- Finding #21: invoices-admin.controller.ts & payments-admin.controller.ts — controller vs service auth pattern matches repo-wide NestJS architecture; role-checking already handled by JwtAuthGuard and RolesGuard.
- Finding #32: payroll-period.ts — payroll date calculation clamping conflicts with existing payroll cycle definitions and historical period records.
- Finding #51: batch-schedule.service.ts — conflict detection query rewrite to raw SQL would bypass Prisma middleware and tenant isolation guarantees.
- Finding #52 (partial): attendance.service.ts — attendance duration calculations safely updated; raw SQL rewrite skipped to prevent schema drift.
- Finding #55 (partial): whatsapp.service.ts — media upload retries kept consistent with existing retryable transport patterns.
- Finding #60: live-class.gateway.ts — WebSocket handshake authentication uses existing gateway architecture; refactoring socket context would break LiveKit/NestJS adapters.
- Finding #63: schedule-recurrence.ts — recurrence rule edge cases adhere to domain requirements.

## PR #58
- None skipped. All findings (#66 to #71) addressed.

## PR #64
- None skipped. All findings (#72 to #102) addressed.

## PR #66
- None skipped. All findings (#103 to #114) addressed.

## PR #70
- Finding #4: payment.service.ts — persist handoff on in-flight replay requires DB schema migration; replay sends the exact same createPayment input as openAttempt so gateway idempotency key replays cleanly.
- Finding #11: job-lock.service.ts — write fencing tokens across all writes requires architectural redesign; lost-lease AbortSignal is in place.
- Finding #12: account-deletion.service.ts — making completion atomic or adding an IN_PROGRESS state requires schema migration to AccountDeletionStatus enum and refactoring cascadeSoftDelete to accept external transaction contexts; the existing try/catch already reverts status to PENDING if deleteAs throws.
- Finding #13: whatsapp.service.ts — media upload timeout retryability kept retryable: duplicate media upload is invisible, unlike duplicate message.
- Finding #16: TestimonialsSection.tsx — academy hardcoded colors: docs/UI_RULES.md exempts the academy marketing site ("has its own brand"); a11y improvements applied.
- Finding #18: MasterbasePanel.tsx — backend proxy requires Lichess API token the academy must create; graceful 401 fallback is in place.

## PR #72
- Finding #1: live-class.service.ts — concurrent-class atomic reservation before room creation: docs/SAAS_PLANS.md explicitly documents that "the live-class check is best effort (LiveKit room creation sits between check and write); a one-room overshoot in a race is accepted". Holding locks or reservations across external LiveKit room creation calls risks stalling transactions and lock-pool exhaustion if LiveKit is slow.

