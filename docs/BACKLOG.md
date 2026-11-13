# Backlog — known gaps

**Agents: read this file (especially § "Root causes") before implementing any
new feature, and update the relevant entry in the same change.** CLAUDE.md § 3.0
points here.

The 2026-08-29 codebase audit (all Critical/High/Medium/Low findings remediated;
`AUDIT.md` removed once complete) left these non-finding, feature-sized gaps.
None is a correctness bug; each is net-new work.

## Root causes — read this before picking up a gap

Patterns observed while remediating this backlog (2026-08-29). Future agents:
expect the *cause*, not just the symptom.

- **One-sided "speculative" features.** Several backend endpoints + `packages/types`
  shapes + service auth were built with no frontend caller ever added
  (`attendance.studentById`/`coachById` — since wired; `attendance.classLive`;
  `batches.get`; `upload/pgn`). Cause: API and types were landed as a unit and the
  UI half was deferred and forgotten. When you touch one of these, grep
  `API_ROUTES.<name>` across `apps/web` first — the route, request/response type,
  and service authorization already exist; you are almost always only adding the
  client `*Api.ts` + hook + a component, not new contract.
- **Orphaned package/app code from the `.ai/` autonomous manager.** The
  `.ai/` task runner (removed 2026-09-08; recover it from git history) merged tasks
  NEXA-0001/0015/0034 that added helpers to `packages/utils` and a `getDevStatus`
  method to `AdminService`. A later "make apps/ identical to dev" sync commit
  (`5de4407`) reverted the `apps/` side but not `packages/`, leaving
  `@nexa-chess/utils` as an importer-less shell (since deleted). Cause:
  partially-reverted autonomous output. If you find code with no consumer and an
  `NEXA-####` commit, check whether its counterpart was reverted before "fixing"
  it — deletion is often correct.
- **God components grew at page/feature boundaries.** `ProfileForm`,
  `MeetingVideoGrid`, `MeetingChat`, `DemoClassesClient`, and the
  `completed-classes/[id]` page each accreted every sub-view inline because the
  first version was small and no split happened as features were added. Cause: no
  size budget enforced. When adding to a feature component over ~300 lines,
  extract the new piece into a sibling folder rather than appending.

## Runtime open question — LiveKit webhooks

**Wired 2026-08-30.** livekit-server config is now passed inline as
`LIVEKIT_CONFIG` in `docker-compose.yml` (the old `livekit.yaml` file and the
ineffective `LIVEKIT_WEBHOOK_*` env vars are gone). Compose interpolates
`${LIVEKIT_API_KEY}` into the `webhook.api_key`, so the block references a real
key in `LIVEKIT_KEYS`:

```yaml
webhook:
  api_key: ${LIVEKIT_API_KEY}
  urls:
    - http://api:3001/webhooks/livekit
```

**Verify after deploy** — check API logs for `LiveKit webhook: event=…` during a
real class. Until this was wired, no leave/disconnect events were recorded,
coach/board durations were always 0, `room_finished` never fired, and the
`TOKEN_REQUEST` join in `getToken` was the only thing creating attendance rows.

## Open items (consolidated 2026-10-31)

Until 2026-10-31 this section said "none", while ~20 open items sat in the
"Still open" / "Known limits" lines of Resolved entries and in other docs.
**This list is the source of truth now.** When you resolve or narrow an item,
edit it here. A Resolved entry records what shipped and links back here. It
does not keep its own "still open" list. Each item was re-checked against the
code on 2026-10-31.

### P1 — data growth & privacy

- **Retention windows are built but off.** Admin-set windows shipped on
  2026-10-31 (see Resolved below). Every category defaults to kept forever.
  **Owner action:** pick the windows at `/admin/data-retention` (the
  recommended values are one click). Until then, chat written by minors is
  still kept indefinitely.

### P2 — reliability / correctness edges

- ~~**E2E specs collide on one coach's time slot (found 2026-11-04).**~~ **Fixed 2026-11-05:** the specs' own cleanup cancelled leftovers with the coach's direct cancel, which V10 refuses within 24 h, so it did nothing. `clearE2EClasses` (`e2e/fixtures.ts`) now cancels the real way (the coach files CLASS_CANCEL / CLASS_CANCEL_EXCEPTIONAL, the admin approves) and runs before every `scheduleClass` and in `live-board-recovery`.
- ~~**E2E UI logins don't back off on the login throttle (found 2026-11-04).**~~ **Fixed 2026-11-05:** `loginViaUI` waits out a 429 like `loginContext`, and `analytics-dashboard` uses it. Also for split hosts (staging `dev.` + `api-dev.`): every request sends the web `Origin` (`playwright.config.ts` `extraHTTPHeaders`; without it `TENANT_SCOPE_MODE=enforce` refuses `/auth/login` with a 500), and `login()` keeps the cookie's own `Domain` so cookies added to a browser context reach the web host. `findInDataTable` moved to the fixtures and also pages "Next page" pagers (admin completed classes are oldest first). Still not runnable on staging: `recording-flow` (the staging API's `/recordings` doesn't exist on the host).
- ~~**`progress/activity-history.int-spec.ts` "buckets by day in the viewer's own timezone" fails in the last hour before midnight in `America/Los_Angeles`**~~ **Fixed 2026-11-05:** the server's window was already built from local calendar days; the 24 h steps were in the web's `dayIn` (`features/progress/lib/activityFilters.ts`, so "Last 7 days" covered 6 or 8 days around midnight in the week after a DST change) and in the spec's copy of it. Both now step calendar dates (`addDays` from `@nexa-chess/types`); `daysFromToday` in `lib/datetime.ts` (Today/Tomorrow labels) had the same drift and was fixed too. Reproduced and verified with the Node clock shifted to 23:30 PST on 5 Nov.
- ~~**`approval/handlers/class-cancel.handler.spec.ts` fails about 1 run in 6**~~ **Fixed 2026-11-05:** the fixture's `startsAt` and the request's snapshot were each built from `Date.now()`, so a millisecond tick between them read as "rescheduled" (409). The spec now runs on one fixed clock (`jest.useFakeTimers({ now })`).
- ~~**A cold `tsc --noEmit` in `apps/api` runs out of memory on the 11 GB box (found 2026-11-04).**~~ **Fixed 2026-11-05:** the api `typecheck` and `test:integration` scripts run Node with `--max-old-space-size=6144` (written as `node … ../../node_modules/<tool>` so it works in PowerShell too). Measured: a cold typecheck peaks at 3.06 GB against Node's 2,096 MB default heap here, and a cold `test:integration` (ts-jest type-checks the whole program) died with a heap OOM before its first file; with the flag it passed 682/684.
- ~~**Saving a PGN "to Cloud" without Cloudinary credentials returns 400**~~ **Fixed 2026-11-04:** every Cloudinary upload is a 503 "File uploads aren't set up on this server" without `CLOUDINARY_*` (`assertUploadsConfigured`, `upload.service.spec.ts`). `analysis-board.spec.ts` still needs real Cloudinary credentials for its Save to cloud step.
- ~~**Empty 400s right after an engine analysis stream (found 2026-11-05; production since 2026-10-03).**~~ **Fixed on `dev` 2026-11-05 (`a74cad1b`), verified on staging (0 failures, was ~12 %); reaches production with the next release.** The separate hotfix PR #133 was closed 2026-11-06 on the owner's decision: it ships with the dev → main release, and production keeps failing on stream days until then. Verify there afterwards with the query in the write-up §8. The Node API rejects (`HPE_CLOSED_CONNECTION`, "Data after `Connection: close`") the next request nginx sends on an upstream connection that last served `POST /stockfish/analyze/stream`. Node answers it with a bare 400: no headers, so the browser reports a CORS error.
  - **Cause:** `stockfish.controller.ts` `analyzeStream` sets `Connection: keep-alive` on the response, while nginx asks for `Connection: close` (the `$connection_upgrade` map) and keeps an upstream pool (`keepalive 64`). nginx then reuses a connection Node is closing.
  - **Not the cause:** HTTP/2 (reproduced over HTTP/1.1, 4/4) or the web cancelling the stream.
  - **Impact:** about 55 % of streams poison one pooled connection, and the next request from any user fails: board saves, room loads, heartbeats, PGN upload, a WebKit room reload ("Connection lost"). Over 500 failures in two weeks of production logs.
  - **Recommended fix:** remove that one header line, plus a spec and a regression check. Optional later nginx clean-up.
  - Full write-up: [investigations/2026-11-05-empty-400-after-engine-stream.md](investigations/2026-11-05-empty-400-after-engine-stream.md).
- **Enforce the full web CSP (opened 2026-11-05).** Reports now reach the API (`csp-violation` log lines, docs/AUTHORIZATION.md "CSP reports"). After a release cycle in production, read them, add any missing host to `reportOnlyCsp()` or fix the page, then move the policy from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. `script-src 'unsafe-inline'` stays until nonces are wired through middleware, so enforcing still blocks foreign hosts but not inline script.

### P3 — feature follow-ups (net-new, each needs a product yes)

- **Tournament platform (logged 2026-11-09; built 2026-11-09 on
  `claude/nexachess-tournament-platform-sjutfe`, awaiting review/merge).**
  Swiss, Arena, Round Robin and Knockout tournaments with live games, host
  commentary and broadcasting, spectators (incl. anonymous `/watch`),
  certificates and history. Design, phases and as-built notes:
  [TOURNAMENTS.md](TOURNAMENTS.md).
- ~~**Instant feedback on in-app navigation (logged 2026-11-04).**~~ **Built
  2026-11-13:** a gold bar at the top of the window starts on the click of an
  internal link and finishes when the path changes (`NavigationProgress`,
  mounted in `AppProviders`; 20 s safety timeout). `/profile`, `/games`,
  `/messages`, `/chess-board`, `/help`, `/classes/[id]` and `/tournaments` got a
  `loading.tsx` that keeps the shell (`ShellPageLoading`), so the nav no longer
  disappears behind the root spinner. **Still open:** navigation started in code
  (`router.push`, 27 web files) doesn't start the bar, and it has only been
  checked on the dev server with delayed responses, not `next start` on
  "Slow 4G". It only makes the wait visible; a slow server needs its own look.

- **Smart Revision:** non-puzzle item kinds (lessons / `REPLAY` assignments,
  course modules, live-class chapters). Blocked by design: no graded attempt to
  cap a self-rating ([SMART_REVISION.md](SMART_REVISION.md)).
- ~~**Email opt-out.**~~ **Built 2026-11-13:** every rule email has the
  recipient's unsubscribe link, and the profile page has the same switch
  ([MESSAGING.md](MESSAGING.md) "Email channel"). **Still open:** it is one
  switch for all rule emails (no per-category choice), there is no one-click
  `List-Unsubscribe-Post` endpoint, staff-written email (`/admin/email`) has no
  link, and admins can't see or filter who has opted out except through
  `SKIPPED` rows in the Delivery log.
- **Payroll:** percentage-of-revenue is a stubbed ₹0 line (no revenue linkage,
  `payroll-calculation.engine.ts` `case "PERCENTAGE"`). No tax/TDS, no bank
  payout integration, no multi-currency, no rate CSV import/export.
- **Chat push:** a websocket only if the 4 s poll proves too slow or costly.
  There is no evidence of that yet.
- **Referrals** ([REFERRALS.md](REFERRALS.md), shipped 2026-11-02, rebuilt
  2026-11-07 as points + vouchers for students, money for staff): no
  notifications yet (a stage move, reward, voucher approval could be a
  `MessagingEvent`), no bulk payout export, no points expiry. Sign-up links the
  new member's account automatically, but onboarding is still an admin move.
  Accounts an admin creates (Users page) are only linked by hand. Free days
  given by a voucher can't be taken back from the referral board (adjust the
  access in Payments).

### Needs someone with `vps_dev` / production access

- Confirm `LiveKit webhook: event=…` lines in the API logs during a real class
  (§ "Runtime open question" below).
- Run `npm run audit:reliability -w apps/api -- --days 90` against real data
  ([RELIABILITY_DESIGN.md](RELIABILITY_DESIGN.md) §6.1). It has only been run
  against local dev.
- Staging-check the 10-minute LiveKit token TTL (below) across a class longer
  than 10 minutes: LiveKit should refresh the token for a connected client
  without dropping it.

### Waiting on an owner decision (designs exist, nothing to build yet)

[SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) and
[WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) (proposals),
[PARENT_REPORTS.md](PARENT_REPORTS.md) (blocked on a verified guardian
identity), the AI roadmap phases after 2 / 3a
([ai/architecture/ROADMAP.md](ai/architecture/ROADMAP.md)), and puzzle-catalogue
Phase 6 training modules ([PUZZLE_CATALOGUE_ARCHITECTURE.md](PUZZLE_CATALOGUE_ARCHITECTURE.md) §G.3;
its precondition, the student training surface, now exists).

- **Unused asset: `apps/web/public/auth/auth_light.webp`** (2026-11-03). Since the
  M4 auth redesign the auth panel is navy in both themes and shows only
  `auth_dark.webp`, so nothing references the light artwork. Kept on purpose:
  assets and images are only deleted with the owner's yes (keep it, delete it,
  or bring back a light panel that uses it).

### Closed by this pass (were listed as open, already fixed in code)

- **LiveKit token TTL.** It was listed as 6h (AUTHORIZATION.md). It has been
  10 minutes since 2026-10-17 (`LIVEKIT_TOKEN_TTL`, `livekit.service.ts`).
  The pre-join card never holds a token: `useLiveClass` fetches one only after
  Join. Staging check above.
- **Waiting room + screen-share handshake.** The 2026-09-03 entry still called
  them deferred. Both shipped 2026-09-14.
- **`POST /upload/pgn` orphan note.** It has a web caller (`uploadPgn`), so the
  note was dropped.

## Questions for the owner (unattended runs)

- **Decided 2026-11-04 — the spec's seven open decisions: keep all as built.** (Merged into local `dev` the same day.) Kept for reference:
  1. Muted mic/camera: soft red (alternative: neutral grey with a slashed icon). `MeetingControlButton` variant `off`.
  2. Controls: 44px rounded squares, labels in tooltips (alternative: keep round in the room).
  3. Coach class-wide controls: one "Students" control with a menu (alternative: five buttons). `StudentControlsMenu`.
  4. Tab overflow: four stage views and three panel tabs, rest under More (alternative: every tab, scrolling). `RoomTabs maxVisible`.
  5. Coach leaving: one dialog with Leave class / End class for everyone (unchanged; it was already one dialog).
  6. People rows: mic and camera visible, the rest in a ⋮ menu (alternative: every action on the row).
  7. Smallest text: 12px everywhere (alternative: 11px for dense labels). Board coordinates are drawn by chessground and not touched.
  Also: the drafts place the coach's Chapters/Leaderboard column at the far left; the build follows the code (beside the board, only when it fits).
- **2026-11-04 — approved for build:** a coach lowering a student's hand (today hand raise is sender-only: `HandRaiseBridge`), "allow screen sharing" without a student's request (the approval flow needs a request row), a coach board on phones, and a Design System v2 `LiveClassFab`. All four built on local `dev` (d5ab2fb2, 50a4e165, and the FAB commit after them); browser checks are part of the owed test pass.
- **2026-11-03, `feat/live-class-redesign` — `GET /live-class/:id` now also returns `batchName`** (name only, no roster) for the top bar. Additive; say if you'd rather the top bar show only the head count.
- **2026-11-03, `feat/live-class-redesign` — pre-join stays a two-column card** (camera preview beside the details) rather than the spec's 448px single column, which would push the preview below the fold on laptops. Waiting and error screens are 448px.

- **2026-11-04 (overnight run), `feat/saas-phase2-foundation`: builder's calls for SaaS Phase 3 slice 6**, logged as the owner asked; change any of them:
  1. **Host-only cookies are deferred to Phase 5.** The web middleware reads the auth cookie on the web host while the API sets it from `api.nexachess.in`, so a host-only cookie would never reach the web routes. Host-only needs Phase 5's same-origin `/api`. Meanwhile the session binding (slice 1) already makes a Nexa token useless on another academy's host under `enforce`.
  2. **Recordings stay in one flat directory**, academy-distinct through the room name (`t_<tenantId>_class_<id>-<time>.mp4`). The plan's `<RECORDING_STORAGE_DIR>/<tenantId>/` was not used because LiveKit egress creating sub-directories isn't verified on this box. Per-academy recording quotas wait for Phase 4 limits.
  3. **PGN uploads stay public** in Cloudinary (the plan says move them to `authenticated`). They're now under the academy's folder; the access change is a separate step.
  4. **No per-academy throttle bucket yet** (§E "Throttling"). With one academy it changes nothing; it's listed for Phase 4 with plan limits.

- **2026-11-04 (overnight run), `feat/saas-phase2-foundation`: builder's calls for SaaS Phase 4 (platform console API)**; change any of them:
  1. **Emails stay unique across the platform until §D5**: creating an academy whose first super admin's email already has an account anywhere is refused (409) with a clear message.
  2. **Grace allowances** (what still works in grace) are four groups of API prefixes (`GRACE_ALLOWANCES` in `@nexa-chess/types`): live classes + attendance, homework/puzzles/revision, fees/invoices, chat. All four are on by default; admin growth is always blocked.
  3. **Lapse defaults:** 7 past-due days, then 14 grace days, then locked. The sweep runs hourly. A subscription with no period end (manual billing) never lapses by itself.
  4. **A plan with trial days starts TRIALING**; with none it starts ACTIVE with no period end (manual billing until Phase 6).
  5. **The support user is a `SUPER_ADMIN`** of the academy (full access, as the owner said "can control"). Reads during a visit go to the request log only; writes are counted on the visit row.
  6. **Content packs are a live reference** to Nexa's published folders (only GLOBAL + PUBLISHED puzzles, only through an entitled, published pack). A copy becomes the academy's own `source: NEXA` row; its Lichess origin isn't kept on the copy.
  7. **Only puzzle folders can be packed for now** (`ContentPackItemKind.PUZZLE_FOLDER`); puzzle sets and courses are a later kind.
  8. **The Lichess catalogue isn't a pack row yet.** It stays readable by every academy as before (platform tables).
  9. **Staging runs `TENANT_SCOPE_MODE=enforce`** from the stage API's process environment, not `apps/api/.env`. The unit tests read `.env`, and enforce there broke them. A plain `nexa.sh restart stage api` drops it (see memory).
  10. **A plan's content packs aren't versioned.** Changing a plan's `contentPackIds` reaches its academies at once (adding is harmless, and a removed pack only stops new copies; copies already made stay). Features, limits and lapse rules still wait for "Apply to existing".
  11. **Console UI (4g):** one page `/admin/platform` (Academies, Plans, Content packs, Support visits, Audit log tabs) plus `/admin/platform/academies/<id>`. It shows only for Nexa's super admins (`AuthUser.isPlatformOperator`). Academies get `/admin/content-packs` (browse, preview, copy) and a "Support visits" section on `/admin/subscription` (super admins). The banner is on every page of a support visit. Choosing time zones and countries is free text for now.
- **2026-11-05 (overnight run), `feat/saas-phase2-foundation`: builder's calls for SaaS Phase 5 (domains + branding)**; change any of them:
  1. **Default tiers:** `brandIdentity` from Growth, `customDomain` from Business, `whiteLabel` on Enterprise (the migration appends them; edit plans in the console).
  2. **Theming is client-side**, not SSR: rendering the root layout per host would make every Nexa page dynamic. An inline script hides Nexa branding and applies the academy's last saved palette before first paint; a first visit shows default colours for a moment.
  3. **White label hides "Powered by NexaChess" by default** on plans that include it; the academy can show it again.
  4. **Colours:** the main colour must give white text 4.5:1; the accent only has to stand out from white (1.5:1). The dark theme lightens both automatically.
  5. **Academy cookies are host-only and named `nexa_h_*`.** Nexa's `.nexachess.in` cookies are dropped on an academy's address (never used, even in audit mode). Moving Nexa itself to host-only cookies is built (2026-11-05, `feat/saas-followups`) behind two switches, both off: `PLATFORM_HOST_ONLY_COOKIES` (API) and `NEXT_PUBLIC_PLATFORM_SAME_ORIGIN_API` (web build). Turning them on is the owner's step after nginx's `/api/` rule on nexachess.in (docs/DEPLOYMENT.md § "Nexa on host-only cookies").
  6. **Domain check** proves the host's `/api/` reaches this API with a one-time token held in memory for a minute (one API process). DNS, nginx and certbot stay manual (owner decision).
  7. **Not tested in a real browser on an academy host tonight:** `*.nexachess.in` has no wildcard DNS or certificate yet (DEPLOYMENT.md Step 4c). Covered by integration tests (cookies, config, branding) only.
  8. **Academy home page** is a simple block (name, tagline, sign in, join, contact). The full block-based landing page builder is later.
  9. **The Nexa marketing page's analytics script and JSON-LD still load (hidden) on an academy's home page.** Fix with the remaining brand-string sweep (5e).
  10. **WhatsApp per academy:** another academy sends only from its own connected number (super admin sets it on `/admin/branding`); without one WhatsApp is off for it, never Nexa's number. Tokens use a new optional `CREDENTIALS_ENCRYPTION_KEY` (falls back to `MFA_ENCRYPTION_KEY`), so the integration suite doesn't have to switch on required MFA. Message templates must be approved on the academy's own Meta account; nothing checks that yet.
  11. **Brand strings left (5e follow-up):** done 2026-11-05 on `feat/saas-followups` except the two below. `{{academy.name}}` in every message rule and system email, payslip PDFs (author + footer), PGN `Site` / default `Event`, the live-class PiP metadata, Wall of Moments and Video Generator now use the academy's name (`BrandingService.nameFor`, the same name its pages show; Nexa's stays "Nexa Chess"). Product-name copy became neutral ("Our website", "Our own analysis", "Class games", "Purchase"). NexaChess-as-vendor copy (contact the NexaChess team, support visits, content packs, Powered by) stays on purpose. **Still open:** `features/legal/content.ts` (per-academy legal pages wait for §N-12 legal text), and the root layout / `/` metadata and JSON-LD, which stay Nexa's in the server HTML on an academy's `/` (theming is client-side by the Phase 5 builder's call 2; changing it makes those pages dynamic).
- **2026-11-05 (overnight run), `feat/saas-phase2-foundation`: builder's calls for SaaS Phase 6 (money)**; change any of them:
  1. **Plan prices exclude GST.** The checkout adds GST from the shared engine (`computeTax`): seller = the console's seller details (until saved, NexaChess academy's own invoice details), buyer = the academy's own invoice details (its GSTIN decides intra/inter-state). A blank seller GSTIN charges no GST. Default rate 18%.
  2. **The owner's Razorpay account has its own env keys** (`PLATFORM_RAZORPAY_*`), separate from NexaChess academy's student keys (`RAZORPAY_*`), even if both are the same Razorpay account. Built against mocks and test mode only; no live keys exist.
  3. **A "pay link" is an in-app checkout link** (`/admin/subscription?checkout=<id>`, open 7 days) that the owner copies from the console and sends; it is not a Razorpay Payment Link and no email goes out automatically. Only the academy's super admin can pay; its admins see the invoices.
  4. **Yearly price** = the plan's yearly price, else 12 × monthly; a deal's custom price is monthly (× 12 for yearly). A one-off pay link may set its own price.
  5. **Paying early extends from the current period end**, not from today. A checkout for another plan switches the plan when it is paid (and clears a scheduled change).
  6. **A payment for less than the order, or in another currency, is not applied** (logged; needs a manual look). A CANCELLED subscription can't be paid until the owner reopens it.
  7. **Platform invoices are a printable page** (browser print → PDF), frozen at issue, own series `<prefix>/yy-yy/00001` per financial year; no stored PDF and no invoice email yet.
  8. **Academy gateway keys: super admins only**; Razorpay and Stripe need the webhook secret before they can be switched on (Cashfree verifies with its secret key). NexaChess's academy keeps the server's env keys and can't store any. The old webhook URLs (no key) stay NexaChess's.
  9. **`WHATSAPP_CREDENTIALS_KEY` (Phase 5) is renamed `CREDENTIALS_ENCRYPTION_KEY`** and now also encrypts gateway keys (nothing was deployed with the old name).
  10. **Usage counters** (`TenantUsage`) are a nightly snapshot (02:00 UTC) of the plan-limit counts, shown on the console's academy page. Limits are still enforced from live counts.
  11. **Not done in Phase 6:** card-on-file auto-debit (v1 excludes it, §G), Cashfree/Stripe for platform billing, per-academy invoice seller details for student invoices beyond what Phase 3 slice 5 already gives, and refunds of platform payments (record them manually; no credit note flow yet).
  12. **Found by the staging browser check and fixed (`fix(web)` after Phase 6):** the Phase 5 host rule only knew `NEXT_PUBLIC_SITE_URL`, which the staging build leaves at its localhost default, so `dev.nexachess.in` was treated as an academy's address (host-only cookie names, `/api`, and a title-rewrite loop that froze the page because Nexa's name contains "Nexa Chess"). Nexa's hosts are now the site host plus the web host paired with the API host (`api-dev.x` -> `dev.x`, `api.x` -> `x`), and the title rewrite never writes an unchanged title. Production (`NEXT_PUBLIC_SITE_URL=https://nexachess.in`) was never affected; nothing is deployed.

- **2026-11-05 (unattended CodeRabbit review), `review/coderabbit-2026-11-05`: findings that need your call** (code fixes for the rest are on that branch):
  1. **Coach count on the home page disagrees with itself.** `SundayTrainingSection` (both `components/` and `v2/`) says "45+ Expert coaches"; `HeroSection` and `StatsSection` say "100+". Which is true? Options: put one number in `features/academy/content.ts` and use it everywhere, or change the Sunday card's metric. Meanwhile: nothing changed (it's a public claim).
  2. **Testimonials (`TestimonialsSection`, both versions) show parent + child names and ages beside Unsplash stock portraits**, under "Real and proud impressions from families". If invented, that's a fake-review risk; if real, publishing a minor's name and age needs recorded parental consent (`legal/content.ts` lists consent as pending) and a stock face beside a real name misleads. Options: replace with verified, consented testimonials (first name + initial, no stock photo), label them illustrative, or hide the section until then. Meanwhile: nothing changed.
  3. **Academy gateway and WhatsApp keys are cached per API process** (`GatewayCredentialsService`, `WhatsAppCredentialsService`: loaded at boot, refreshed only on the process that saved them; a turned-off or rotated token keeps working elsewhere). Fine with today's single `nexa_api` process; with replicas or a separate worker, other processes keep old/no keys until a restart (checkout says "no gateway", webhooks fail their signature). Options before scaling out: a 30–60 s TTL reload, or a Redis invalidation message. Meanwhile: nothing changed.
  4. ~~**`SystemMessageTemplate.key` is still a global primary key, and §D5 doesn't change it.**~~ **Done 2026-11-06 (owner chose A):** additive twin migration `20261106044250`, the code uses `tenantId_key`, and §D5 now re-keys the table to `(tenantId, key)`; rehearsal re-run PASS and staging updated. Original note: The first time a second academy customises a system message, its upsert (scoped to that academy) misses Nexa's row and the create collides on `key` → 500. Proposed: add to the §D5 contract `ALTER TABLE "system_message_templates" DROP CONSTRAINT "system_message_templates_pkey", ADD PRIMARY KEY ("tenantId", "key")` (like the sequence tables), the matching `schema.patch` (`@@id([tenantId, key])`), and switch `system-message.service.ts` to `tenantId_key`. Not done tonight because D5 is already applied to staging (`vps_dev_saas`) and was rehearsed as is; it must land before a second academy edits system messages. (The other natural-key `@id`s on academy tables were checked: global ids, or the sequences D5 already re-keys.)

## Open audit findings (2026-10-31)

From a ponytail audit of the API's payments, auth, backup and cron paths. The web
app, live class, chat, assignments, puzzles, payroll and AI were not audited.

None open.

## Resolved (2026-11-01) — email in messaging rules, editable system messages

Rules can send by email (off by default). Every fixed email and demo-class WhatsApp
text can be reworded, including the notices sent to admins. Both editors list each
placeholder with its meaning and an example value, and insert it at the cursor.
Details: [MESSAGING.md](MESSAGING.md) "Email channel" and "System messages".

## Resolved (2026-11-01) — automatic game sync

Daily sync of linked Lichess / Chess.com accounts, off by default. Admins set the
academy rule, coaches and admins set a per-student rule, and students have their
own switch. Details: [GAME_SOURCES.md](GAME_SOURCES.md) "Automatic sync".

## Resolved (2026-10-31) — Smart Revision reminders

New `REVISION_DUE` messaging rule, off by default. Details:
[SMART_REVISION.md](SMART_REVISION.md) "Reminders".

## Resolved (2026-10-31) — `FREE_ANALYSIS` move target

`Assignment.minMoves` (optional): the student still submits by hand, but the API
and the Submit button hold it until that many moves are played. Each side's move
counts as one, because the student plays both sides on this board.

## Resolved (2026-10-31) — tiered payroll rates in the admin UI

`CompensationProfileDialog` now authors and shows `TIER` rates
(`TierRatesEditor`). `compensationTierConfigSchema` also rejects a config whose
last tier has a cap or whose caps don't rise, because the engine pays nothing
past the last cap.

## Resolved (2026-10-31) — invoice dates and numbering in India time

- **Dates.** Invoice/credit-note dates print in IST (`DEFAULT_TIME_ZONE`) in the
  PDF and the HTML invoice, and the admin `from`/`to` filter reads India days.
- **Numbering per Indian financial year.** `InvoiceSequence` and
  `CreditNoteSequence` are keyed by `financialYear()` (April–March, IST, by its
  starting year) instead of the UTC calendar year — the GST norm, as Zoho
  Books / Tally do. No migration: today (FY 2026-27) keys to 2026, so the
  current series continues unbroken; the next reset is 1 Apr 2027 IST, not
  1 Jan. Issued invoices are unchanged.
- **GST Rule 46 number format.** New numbers read `INV/26-27/00001` /
  `CN/26-27/00001` (≤16 characters, as Indian billing software does it). The
  admin prefix is capped at 4 letters, digits or hyphens; migration
  `20261031130505_gst_document_number_prefixes` resets saved prefixes that
  don't fit to `INV` / `CN`. `PAYMENTS_INVOICE_PREFIX` now only prefixes order
  numbers. Already-issued numbers keep their old form.

## Resolved (2026-10-31) — payment/refund row locks, unused deps, ESLint 9

- **Payment status race.** `PaymentService.applyProviderState` now locks the
  payment row (`FOR UPDATE`) before reading, so a FAILED and a PAID webhook
  arriving together apply in order and the rank check holds.
- **Concurrent partial refunds.** `RefundService.applyProviderState` locks the
  parent payment row first, so sibling refunds see each other's SUCCEEDED rows.
- **Unused dependencies.** Removed `@nestjs/config` (api) and `cmdk` (web).
- **ESLint 9.** Both apps use flat config (`eslint.config.mjs`); the api is on
  `typescript-eslint` 8 (`caughtErrors: "none"` keeps v7's behaviour), the web
  wraps `next/core-web-vitals` with `FlatCompat` until Next 16. Same rules,
  same warning count; stale `no-var-requires` directives renamed.
- Held by `test/integration/payments/payment-locks.int-spec.ts` (fires both
  races against real Postgres; fails with either lock removed).

## Resolved (2026-10-31) — recordings open on the current board

The recording template started at the start position. It only caught up when
the coach answered one of the two server-injected `REQUEST_SYNC`s (4 s and 9 s
after start) or made a move. So the opening seconds were wrong, and a template
that connected late, or a class whose coach board tab wasn't connected, could
record the start position for minutes. The template's page now reads the saved
`LiveSession.boardState` server-side before it renders, through a new
`GET /live-class/:id/recorder/board-state` authenticated by the egress LiveKit
token (signature, room, hidden seat). The live sync still applies on top.
Details: [LIVE_CLASS.md](LIVE_CLASS.md) "Recording". New compose var on `web`:
`API_INTERNAL_URL` (default `http://api:3001`). This also closes the
2026-10-03 note that the recorder "still relies on the coach's FORCE_SYNC".

## Resolved (2026-10-31) — LiveKit 503s, shared accuracy maths, doc drift

- **A LiveKit outage answered 500.** Every LiveKit server call now goes
  through `LiveKitService.call`: a failure is a 503 (`LIVEKIT_UNAVAILABLE`),
  except "not found", which still passes through because callers treat an
  empty room or a departed participant as normal. Recording start/stop
  failures are 503 too. Config is now honest: production refuses to boot
  without `LIVEKIT_URL` / `_API_KEY` / `_API_SECRET` (`packages/config`
  api.ts, as before but at env-parse time with a clear message). Elsewhere the
  API boots without LiveKit and live-class calls answer 503
  (`LIVEKIT_NOT_CONFIGURED`). (The old note blamed an *unconfigured* LiveKit,
  which could not happen: `onModuleInit` threw, so the API never booted.)
- **Assignment accuracy had its own copy of the maths.** PLAY_VS_ENGINE
  accuracy (`engineMoveAccuracy`) now uses `winPercent` and
  `moveAccuracyFromLoss` from `@nexa-chess/types` game-analysis.ts. Same
  constants, so scores are unchanged; mates are now exactly 100/0 instead of
  ±100,000 cp. It still averages arithmetically (see GAME_ANALYSIS.md §12).
- **`GET /batches/:id` kept, not wired.** No screen needs it (list rows carry
  the same `BatchResponse`). It stays as the single-batch read and as the
  cross-user suite's probe of `getBatchVisibilityWhere`, which deleting it would
  lose. A comment at the route says so.
- **Doc drift.** UNDO_ARCHITECTURE.md said "not yet implemented" (77
  `useUndoableMutation` calls in 39 files exist). PUZZLE_CATALOGUE_ARCHITECTURE.md said
  "nothing implemented", and the implementation spec said PR 6 was in review.
  The catalogue API + UI and student training are built. Status lines
  corrected.

## Resolved (2026-10-31) — admin-set data retention

`chat_messages`, `live_chat_messages`, `notifications`, `message_deliveries`
and `analytics_events` were kept forever (open since 2026-10-03). They now have
one admin-set window each: a `RetentionPolicy` row per `RetentionCategory`, set
at `/admin/data-retention` (super admin only). The nightly sweep applies them
after the fixed `RETENTION_RULES`. Per-category minimums and recommendations
are in `RETENTION_CATALOGUE` (`@nexa-chess/types`). Queued (`PENDING`)
deliveries are never deleted, and Save previews how many records the window
would remove. Default is kept forever, so deploying it deletes nothing.
Details: [INFRASTRUCTURE.md](INFRASTRUCTURE.md) "Retention sweep". Migration
`20261031070905_retention_policies` (additive; also `createdAt` indexes on
`chat_messages` and `notifications`).

## Resolved (2026-10-17)

- **Unvalidated list query params reached Prisma** (found 2026-10-08 by the
  cross-user access suite). A repeated key (`?status=A&status=B`) or an
  unknown enum value answered 500 instead of 400. Fixed per endpoint: the
  shared Zod query schemas are now applied with `@Query(new ZodBodyPipe(…))`
  (puzzles, courses, analytics, admin payments/invoices, message deliveries;
  the last three used to call `.parse()`, whose `ZodError` was itself a 500),
  and single params go through `common/query-params.ts`
  (`optionalQueryString` / `optionalQueryEnum`). Payroll record/payout lists
  now require `periodId` instead of listing every period when it is missing.
- **Role checks are now proven, not just "reads the cookie"** (audit #12).
  `test/integration/access/admin-routes.int-spec.ts` calls every admin route
  as a student and a coach (and every SUPER_ADMIN route as an admin) and
  expects 403. Found on the way: `PUT /messaging/rules/:event` answered 500 for
  an unknown event (now 400), and a failed backup logged the database password
  (`pg_dump` now gets it through `PGPASSWORD`, not the command line).
- **Unknown ids no longer 500.** A probe of all 415 routes with a made-up id,
  as super admin, coach and student, now finds no 500 (batch
  archive/restore/delete, payslip PDFs, payroll period calculation and
  compensation profiles were the cases). Same run: `/coach/*` and
  `/student/dashboard` answered a wrong role with 401, which the web client
  treats as an expired session (one wasted refresh rotation per call); they
  are 403 now and `admin-routes.int-spec.ts` asserts it.
## Resolved (2026-10-16) — Smart Revision (spaced repetition)

Students had no way to come back to puzzles they missed at the right time.
Added Smart Revision ([SMART_REVISION.md](SMART_REVISION.md)): mistakes seeded
from graded attempts, coach-recommended puzzles and folders, a deterministic
spaced-repetition schedule, grades capped by the server-graded attempt, a
student session page + dashboard card, and a Revision tab on the progress
pages. Still open: lessons / REPLAY assignments / chapters as revision items
(no objective grading to cap a self-rating), and revision reminders through
the messaging rules.

## Resolved (2026-10-16) — role & permission enforcement audit

Full report, permission matrix and open items: [AUTHORIZATION.md](AUTHORIZATION.md).
Fixed: any coach could start/stop recording another coach's live class; access
tokens survived logout / password reset; admin password reset left sessions
alive; avatar delete by a copied URL; forged API-only data packets and recorder /
spectator board packets accepted from any participant; kicked students could
reconnect with an old LiveKit token; the query cache survived an account switch;
several 500s before auth. The 6h LiveKit token TTL it left open is now 10
minutes (see "Open items").

## Resolved (2026-10-15) — variations, Game Library, chat, assignment reminders

- **Moves overwrote the rest of the line.** Playing a different move on any
  analysis/class board truncated the game. The board store now holds a move
  tree (`move-tree.ts`): new moves branch, coaches promote/delete/comment, and
  PGN round-trips variations. Live sync carries the tree; old clients still get
  the current line.
- **Class games were lost after the class.** New Game Library (`ChessGame`,
  `/games`) records shared-board, simul and match games automatically and takes
  PGN imports.
- **No messaging outside a live class.** New persistent chat (`/messages`):
  batch threads, coach ↔ student DMs, coach groups — polled, no websocket.
  A websocket push is the natural next step if the 4s thread poll proves too
  slow or too costly.
- **Students had no due-date nudges beyond one in-app reminder; coaches never
  heard about overdue work.** Added the reminders banner/popup/count, the
  coach/admin "Due dates" overview and the `ASSIGNMENT_OVERDUE_COACH` rule.

## Resolved (2026-10-11) — class scheduling & attendance consistency

- **Future classes marked COMPLETED.** `startClass` had no time gate, so a
  class days ahead could be started and ended (47 dev rows, mostly e2e runs
  that start classes 48–96h out). The start window is now one shared rule,
  `getClassStartAvailability` (`@nexa-chess/types` `class-availability.ts`):
  no earlier than `CLASS_EARLY_START_MINUTES` (30) before `startsAt`, never
  after `endsAt` (reschedule via a class request). The API enforces it
  (`CLASS_START_TOO_EARLY` / `CLASS_START_WINDOW_PASSED`) and every Start
  button renders it. No migration: no row is currently COMPLETED with a future
  `startsAt`.
- **Upcoming vs Past.** `resolveClassDisplayStatus` / `isUpcomingClass` /
  `isPastClass`: a SCHEDULED class whose window passed is shown "Not held"
  (stored status untouched), a cancelled class is never upcoming and is past
  only once its date arrives. Student dashboard `pastClasses` and coach
  history use the same rule server-side.
- **Cancelled handling + legend.** Shared `CLASS_STATUS_DOT` /
  `ClassStatusLegend` (Scheduled, Live, Completed, Not held, Cancelled) on the
  student schedule and the admin schedule calendar.
- **Attendance row ↔ log dialog.** The dialog is now a React Query keyed by
  (class, student) — it used to keep the previous row's logs on screen and
  could be overwritten by a slow earlier response. The logs response carries
  `topic`, `classStartsAt`, `actualStart` and `classDuration` (actual run
  length, `classRunSeconds`, the attendance % denominator), so the dialog's
  date/duration match the row; an enrolled class with no attendance record
  opens as an empty ABSENT log instead of a 404. Classes that ended before the
  student joined the batch no longer count as absences.
- **Auto-end over-credited time.** A class the sweep ended because the coach
  left now records `endedAt` = when the coach left (not the sweep minute, up
  to the grace period later), so attendance and coach duration exclude
  minutes nobody taught.
- **Batch dates vs sessions.** `common/batch-dates.ts`: a schedule must lie
  within its batch's dates; regeneration never tops up outside them;
  shortening a schedule's end date or narrowing a batch's dates cancels (not
  deletes) the future SCHEDULED sessions now outside; extra-class / reschedule
  requests are checked on ask and on approval. Existing out-of-range classes
  (all past, mostly test data) are left as history.
- **Student class page was blank.** `/classes/:id` called the coach-only API
  for students. New `GET /student/classes/:id` (`API_ROUTES.student.classDetail`,
  enrolled students only) + `StudentClassDetailsClient`: class, coach,
  schedule, Join while live, Watch/Download once recorded, own attendance,
  loading/error states. `/classes` is now a `ROUTE_RULES` entry (any signed-in
  user); admins may read `GET /coach/classes/:id` (the analytics pages link
  there).

## Resolved (2026-10-03)

- **Session and log tables grew forever.** Every refresh-token rotation (every
  ~15 min per active tab) inserts an `auth_sessions` row and nothing deleted
  them; locally 480 of 487 rows were long expired. Added a daily retention
  sweep (`apps/api/src/retention/`) for expired sessions and tokens, old
  LiveKit webhook dedupe rows, and stale anonymous visitor sessions. Chat,
  notifications, message deliveries and analytics events got admin-set
  windows on 2026-10-31.
- **No error reporting.** Crashes were only visible in `docker logs`, which
  rotate within days, and browser errors were invisible. Added Sentry to the
  API and web (optional; unset DSN sends nothing), errors only, scrubbed to the
  user id. See CLAUDE.md §3.6d2.
- **No health endpoints.** The API container's healthcheck only opened a TCP
  socket, so an API that booted but couldn't reach Postgres still passed the
  deploy gate. Added `GET /health` (liveness) and `GET /health/ready` (Postgres
  required, Redis optional ⇒ `degraded`); the compose healthcheck now uses
  `/health/ready`.
- **Live board had no durable recovery.** Board state lived only in each
  client's memory. A coach refresh reset the coach's board to the start
  position, the next coach move overwrote every student's board, and a class
  where everyone reloaded lost the position entirely. The coach's client now
  saves a snapshot to `LiveSession.boardState` (throttled, with a keepalive flush
  on unload) and restores it on load. A restore gate stops a refreshed coach from
  sending FORCE_SYNC with an empty board, and students fall back to the snapshot
  when no coach answers. Board-control grants are deliberately not restored. The
  recorder template reads the snapshot too since 2026-10-31.

- **No DB integration tests.** Added `npm run test:integration`: `*.int-spec.ts`
  files run against a real, disposable Postgres with a non-UTC session timezone,
  and CI runs them in the `migrations` job. The first suites cover the
  soft-delete extension, `JobLockService` leases and attendance finalize. They
  found two bugs, both now fixed:
  - **`prisma.withDeleted` never returned deleted rows.** It was another
    extension layered on the soft-delete client, and the soft-delete filter ran
    after it. The result: email/username pre-checks in `auth.service` /
    `user.service` missed a deleted user, so the create hit P2002 and returned a
    500. Trash purge also never deleted a removed user's Cloudinary avatar.
    `withDeleted` is now the unextended base client on the same pool.
  - **Finalize gave every no-show a `joinedAt` timestamp.** The ABSENT row was
    created with the column's `now()` default; a second finalize cleared it, so
    the result depended on how many times finalize ran.

- **2,600-line `LiveClassService` / `AttendanceService`.** Split by concern, with
  method bodies moved unchanged. `live-class/` now has `LiveClassAccessService` (auth +
  participant/manager checks every other service uses), `-waiting-room`,
  `-pull`, `-demo`, `-chat`, `-screen-share`, `-moderation` and `-recording`
  services, plus `live-class.util.ts`. `LiveClassService` keeps
  start/token/settings/end/sweep, plus thin `resolveParticipant` /
  `resolveClassManager` / `connectedUserIds` delegators for the puzzle, simul,
  match and move-poll modules. Attendance keeps events, finalize and the policy in
  `AttendanceService`. Reports and export moved to `AttendanceReportService`, the
  dashboard, monitoring and reliability views to `AttendanceMonitoringService`,
  and the pure maths to `attendance-calc.util.ts`, which the calculations spec now
  imports instead of keeping a copy. Specs build the live-class graph from
  `LIVE_CLASS_SERVICES` (`live-class.testing.ts`).

## Resolved (2026-09-27)

- **Coaches couldn't ask for schedule changes.** Once coaches stopped creating
  and rescheduling classes themselves, they had no way to get a make-up class or
  a new time. Added coach → admin class-change requests (extra class /
  reschedule) with approval that creates or moves the class.
- **`/student/progress` was a dead nav link.** It now shows a puzzle rating and a
  daily practice streak, also visible to a student's coaches. (`/student/batches`,
  `/student/live-classes` and `/student/schedule` have since shipped; a
  2026-10-17 sweep found no nav or hardcoded link to a missing route.)

## Resolved (2026-09-19)

- **P0 classroom reliability, all 6 phases.** Design doc at
  `docs/RELIABILITY_DESIGN.md` (2026-09-04 audit). Phases 1-2 landed the
  heartbeat backbone and `getLiveClassMonitoring` presence (see design doc §2).
  Phase 3 landed the frontend half: `ConnectionStateManager`
  (`apps/web/src/features/live-class/providers/ConnectionStateManager.tsx`)
  calls `POST /live-class/:id/heartbeat` every 15s while `Connected` and
  exposes one `presenceState`/`reconnectEpoch` consumed by `useMeetingTimer`,
  `MeetingStatus`'s `ConnectionBadge`/`NetworkStatusIcon`, and `ChatProvider`
  (re-fetches `getChatHistory` on a Reconnecting→Connected transition).
  `ClassroomSessionManager` relocated `getTabClientId`/`joinedSession` into
  one context and adds a `BroadcastChannel` duplicate-tab warning toast. The
  chessboard's `useBoardSyncEngine` re-dispatches `REQUEST_SYNC` on the same
  reconnect transition, closing §2.6.
  **Phase 4**: confirmed the §2.8 multi-tab misfire (a second tab's join
  ghost-dropped the first tab's still-open session; that first tab's own
  later clean leave then closed the second tab's session out from under it,
  undercounting real presence) and fixed it — `AttendanceLog.clientId`
  (migration `20260919112041_attendance_log_client_id`) plus two pure
  decision helpers in `apps/api/src/attendance/attendance-session.util.ts`
  (`resolveJoinAction`/`selectSessionToClose`) scope the join/ghost-drop/
  leave-closing logic to the tab that actually sent the event, student-side
  only (coach path unchanged — see design doc §2.8 for why). Tests:
  `attendance-session.util.spec.ts`, `attendance-multi-tab.spec.ts`.
  **Phase 5**: `AttendanceMonitoringService.getLiveReliabilityOverview`
  (`API_ROUTES.attendance.adminLiveReliability`) is a genuinely new
  cross-class query — every `LIVE` session with a coach or student in
  `RECONNECTING`/`OFFLINE` presence — built from `ClassAttendance`/
  `CoachAttendance` rows directly (not `batch.students`, so a never-joined
  student never shows up as a false "offline"). The per-class presence
  classification was factored out of `getLiveClassMonitoring` into a shared
  `derivePresence` helper, and this is the first view to apply it to the
  coach's own connection too. Frontend: `/admin/reliability`
  (`AdminLiveReliabilityClient`, nav "Live Reliability"), polling every 15s.
  Tests: `attendance-reliability.spec.ts`; verified in-browser via `npm run
  shots -- --path admin/reliability --login admin`.
  **Phase 6**: `AttendanceMonitoringService.getReliabilityMetrics`
  (`API_ROUTES.attendance.adminReliabilityMetrics`) reports webhook-loss rate
  and heartbeat-fallback rate over a trailing window, surfaced on
  `/admin/reliability` as a "Last 30 days" panel — buildable and fully tested
  (`attendance-reliability.spec.ts`). The other half, comparing
  heartbeat-backstopped totals against real pre-heartbeat historical data, is
  a runnable script (`apps/api/scripts/reliability-reconciliation-audit.cjs`,
  `npm run audit:reliability -w apps/api -- --days 90`) but was **not**
  actually run against real data — this agent has no `vps_dev`/production
  access (`.agents/SAFETY.md`). It was run against local dev only to prove it
  executes (see design doc §6.1 for the output and its caveats). Someone with
  `vps_dev`/prod access should run it there for the real comparison.

## Resolved (2026-09-17)

- **Coach payroll & payslips.** NexaChess had no coach-compensation feature —
  coaches were paid entirely outside the system, distinct from the
  `payments`/`invoices` track which only ever handled customer billing. Added
  a parallel `payroll` API module + `features/payroll` web feature computing
  what the academy owes each coach from actual teaching activity (never
  re-derived from attendance — reads `CoachAttendance.totalDuration`/
  `boardDuration` and `CoachClass.status`/`cancelledAt`/`cancelledById`, the
  latter newly threaded through the three cancel call sites in
  `coach.service.ts`/`admin.service.ts`/`batch-schedule.service.ts`).
  New models: `CoachCompensationProfile` (engagement type EMPLOYEE by
  default; PDF framing is Payslip vs Coach Payment Statement) +
  effective-dated `CoachCompensationRate` (a rate change closes the previous
  row rather than mutating it, so a past payroll period always resolves what
  was actually in force), `PayrollRule` (cancellation/attendance/bonus/
  deduction), `PayrollPeriod` → `CoachPayrollRecord` (one per coach,
  DRAFT→CALCULATING→REVIEW→APPROVED→FINALIZED→PAID, immutable once
  FINALIZED — a correction is a `PayrollAdjustment` reversal, never a silent
  edit), `CoachPayout`, `Payslip`/`PayslipSequence`. The calculation engine
  (`payroll-calculation.engine.ts`) is pure — no Prisma import — covering all
  7 compensation models (hourly, per-class, fixed salary, hourly+class,
  tiered, percentage-of-revenue [stubbed, no revenue linkage yet], hybrid)
  with every branch producing an explainable line item, never just a final
  number. Payslip PDFs render via pdfmake off a BullMQ queue (mirrors
  `payments/invoice-*`: `--`-separated job ids, inline-render fallback when
  `REDIS_URL` is unset, job-lock `payroll.payslip-pdf-sweep` retry sweep) and auto-queue
  on period finalize. Two new messaging events, `PAYROLL_FINALIZED` /
  `PAYROLL_PAID` (enabled, in-app only, coach audience, no bank/payment
  detail in the body). Web: `/admin/finance/coach-payroll` (periods, an
  expandable per-coach breakdown + adjustments + payout actions, compensation
  profiles, rule builder) and `/coach/earnings` (history + payslip download)
  plus a dashboard widget. Permissions reuse existing `ADMIN`/`SUPER_ADMIN`
  checks — no new granular Finance/Payroll Admin role. Migrations
  `20260917044521_coach_payroll_foundation`,
  `20260917051923_payslip_pdf_attempts`,
  `20260917055223_payroll_messaging_events` (all additive).
  Explicitly out of scope: real tax/TDS calculation (placeholder columns
  only), real bank-transfer payout integration (`CoachPayout` is
  manual-status-tracking only), multi-currency math, bulk CSV import/export
  of rates, tiered-rate authoring from the admin UI (API-only for now), and
  any coach-side write capability (coaches are read-only throughout).

## Resolved (2026-09-14)

- **Screen-share request → coach approval.** A student whose class has
  `student.screenShare: DISABLED` can click "Request to share screen"; the
  coach sees it live (toast + a "Screen-share requests" section in the
  Participants panel, mirroring the waiting room) and can Approve, Deny, or
  later Revoke. A new `LiveClassScreenShareRequest` model (one row per
  session+student, `PENDING`/`APPROVED`/`DENIED`/`REVOKED`) tracks the grant;
  approval widens just that one student's LiveKit `canPublishSources` via
  `updateParticipantPermissions` (idempotent via a status-filtered
  `updateMany`, same pattern as waiting room's resolve) — the class-wide
  `screenShareMode` policy is untouched. `getToken` also re-applies an
  `APPROVED` grant on reconnect, so a refresh mid-approval doesn't silently
  drop it. The grant ends when the student stops sharing (client-driven,
  `endScreenShare`), the coach revokes it, they disconnect
  (`participant_left` webhook cleanup), or the class ends (swept in
  `internalEndClass`).

- **Waiting room / lobby.** The `waitingRoom` enum on `LiveClassSettings`
  (`@nexa-chess/types`) is now `DISABLED | ENABLED` (previously reserved to
  `DISABLED` only). A new `LiveClassWaitingParticipant` model (one row per
  session+student, `PENDING`/`ADMITTED`/`DENIED`) gates a student's `getToken`
  call — first attempt creates a `PENDING` row and blocks with a structured
  `WAITING_FOR_ADMIT` code (student polls via the same silent-retry pattern as
  the existing `COACH_NOT_JOINED` screen); a `DENIED` row blocks with
  `JOIN_DENIED` and a "Request again" action. The API server-injects a
  `waiting_room` LiveKit data packet (mirrors `LIVE_CLASS_MODERATION_TOPIC`) so
  a connected coach/admin sees a join request live via a toast + a "Waiting to
  join" section in the Participants panel with Admit/Deny actions
  (`GET`/`POST .../waiting-room[/resolve]`, coach-owner/admin, idempotent via a
  `status: PENDING` update filter). `LiveClassSettingsForm` auto-clears
  `autoJoin.student` when waiting room is enabled (and vice versa) since the
  two are mutually exclusive — `validateLiveClassSettings` already enforced
  this server-side, so the enum widen alone made that existing guard live.

- **Course / CourseModule authoring.** `Course`/`CourseModule` were a near-empty
  schema stub (`CourseModule` had only a `title` — no order/content/status) with
  no API module and no seed data; `ContinueLearning.tsx` on the student
  dashboard linked to `/student/courses` and `/student/courses/:id`, both 404.
  Built a `course` API module (`API_ROUTES.courses.*`, admin-only authoring —
  no coach/visibility scoping, unlike `Puzzle`): a `CourseModule` **references
  existing library content** (an `Assignment` or a `Puzzle` via a nullable-FK +
  `contentType` discriminator, `onDelete: Restrict` so a hard delete of in-use
  content is blocked, not silently orphaned) rather than authoring anything new.
  Lifecycle `DRAFT` → `PUBLISHED` (blocked with zero modules) → `ARCHIVED`, plus
  a separate soft delete of `Course`/`CourseModule` through the Trash module.
  Completion is an explicit `StudentModuleProgress` row per (student, module) —
  not derived from `StudentAssignment` (which requires a batch deployment via
  `AssignmentBatch` a course-attached assignment never has) — with a
  self-healing auto-complete for puzzle modules solved outside the course UI
  (detected from `PuzzleAttempt.status === SOLVED`). Web: `features/courses/*`,
  admin `/admin/courses` (+ `new` / `[id]`, reorder via up/down controls, an
  `AttachModuleModal` content picker modeled on `PuzzleAssignModal`), student
  `/student/courses` (+ `[id]`, puzzle modules deep-link to the real solver,
  assignment modules render read-only via `PgnBoardViewer`). Fixed the two
  previously-404ing dashboard links; `student.service.ts`'s dashboard mapping
  now surfaces the next incomplete module instead of a static description.
  Migration `20260914081307_course_module_authoring` (additive). Surfaced and
  fixed a latent gap while testing the new `Restrict` FK: `Assignment.remove`
  and the Trash permanent-delete paths (`permanentDelete`, `bulkPermanentDelete`,
  the retention cleanup cron) previously let a Postgres RESTRICT violation
  bubble up as an unhandled 500 — Prisma surfaces a DB-enforced RESTRICT as an
  *unknown* request error, not its own `P2003`, so `error.code` checks alone
  miss it. New shared `apps/api/src/prisma/prisma-errors.ts` (`isForeignKeyRestrictError`)
  turns it into a clear 400 everywhere, and the cron's chunked hard-delete now
  falls back to one-row-at-a-time on a blocked chunk instead of aborting up to
  500 unrelated rows.

## Resolved (2026-09-06)

- **Puzzle Library.** NexaChess had no puzzle system. Added a standalone,
  reusable puzzle library: `PuzzleTopic` / `Puzzle` (soft-deletable, wired into
  the Trash module) + `PuzzleAttempt` models; a `puzzle` API module
  (`API_ROUTES.puzzles.*`, token-string auth) covering admin-only topic CRUD +
  reassign, role-scoped puzzle CRUD (admin ⇒ GLOBAL, coach ⇒ PRIVATE — coaches
  can never publish GLOBAL and cannot edit admin puzzles), publish/archive
  toggles, duplicate, bulk actions, stats, `POST /puzzles/validate`, and the
  student practice endpoints (`/puzzles/mine*`, `/puzzles/:id/attempts*`).
  Server-side move evaluation **reuses `AssignmentEvaluationService`**
  (`normalizeSolution` / `evaluateSolveLine` / `solveLineFeedback`) — now
  exported from `AssignmentModule` — so there is one SOLVE_LINE engine. Web:
  `features/puzzles/*`, routes under `/admin/puzzles`, `/coach/puzzles`,
  `/student/puzzles` (+ `new` / `[id]` / `[id]/edit`), a reusable
  `PuzzleSolver` built on the existing `PracticeBoard` + `PositionEditor` +
  `SolutionEditor`. Seeded 8 topics + 8 puzzles + a `coach2@nexa.test` account
  for cross-coach visibility testing. Migration
  `20260906150110_puzzle_library` (all additive; partial unique indexes on
  `puzzle_topics.name`/`slug`).

- **Live-class puzzle assignment + leaderboard.** Built on top of the puzzle
  library: `LiveClassPuzzleAssignment` (references `puzzleId`, not
  trash-registered, partial unique index `WHERE status = 'ACTIVE'`), a
  `LiveClassPuzzleService` / controller in `PuzzleModule` (now imports
  `LiveClassModule`), three routes (`API_ROUTES.liveClass.puzzle` /
  `.puzzleAttempt` / `.puzzleLeaderboard`). `startAttempt` is the only new
  attempt route — save/submit/hint reuse the puzzle endpoints and now enforce
  `assertLiveAssignmentOpen` (coach-ended or timer + 15s grace). Web: `PuzzleBridge`
  + a "Puzzle" meeting sidebar panel (`MeetingPuzzlePanel`, `PuzzleAssignModal`,
  `InRoomPuzzleSolver`); the standalone `usePuzzleAttempt` hook was extracted
  from `StudentPuzzleSolveClient` and is shared. Lifecycle on
  `LIVE_CLASS_PUZZLE_TOPIC`, leaderboard polled. Timed mode + coach
  "hide leaderboard" toggle included. Migration
  `20260906155518_live_class_puzzle_assignment`. See CLAUDE.md §3.7.

## Resolved (2026-09-03)

- **Live-class pre-class settings, permissions & presets.** Live classes had no
  pre-class configuration — every class was hard-coded (all students
  `canPublish`, board `COACH_ONLY`, no auto-join, no presets). Now four
  inheriting layers (`LiveClassPolicy` → `Batch` → `CoachClass` →
  `LiveClassPreset`) resolved by a shared engine in `@nexa-chess/types`, enforced
  at the LiveKit token layer (`deriveLiveKitGrants`) and mid-class
  (`PUT /live-class/:id/live-settings` → `updateParticipant`/`mutePublishedTrack`
  + `SETTINGS_UPDATE` data packet). Config surfaces: class start page, coach
  `/coach/presets`, admin `/admin/live-class` (platform defaults + org presets +
  change history), batch "Class Settings" tab. Student pre-join previews the
  policy and honours `autoJoin`. Audit via `TrashAuditLog`
  `action: "LIVE_SETTINGS_CHANGE"`. Waiting room + screen-share
  request/approve handshake shipped later (2026-09-14). See
  CLAUDE.md §3.7.

## Resolved (2026-08-31)

- **Admin analytics dashboard.** The `/admin` landing page was a placeholder with
  hardcoded metric cards. Replaced with a full analytics system: `analytics` API
  module (21 admin-only endpoints + CSV export under `/analytics/*`),
  `features/analytics` on web (recharts, KPI cards, shareable URL date-range
  state), an `AdminSidebar` + gated `admin/layout.tsx` shell, and grouped admin
  nav in `navItems.ts` (kills the old 4-place-edit problem — `Header.tsx`
  `pageTitles`, the hardcoded chip row, and `adminNavItems` were all
  hand-maintained). Sections: executive overview, user growth, acquisition,
  students, coaches, classes, attendance, batches, recordings & storage,
  engagement, operations + alerts; drill-down sub-pages under
  `/admin/analytics/*` with paginated tables and `coaches/:id` / `batches/:id`
  detail. Migration `20260831050015_analytics_foundations` (all additive):
  `AnalyticsEvent` + `StorageSnapshot` models, `User.acquisitionSource`
  (enum, backfilled from the legacy `StudentProfile.referralSource`) + UTM
  columns, `LiveSession` recording size/duration/status columns, and analytics
  indexes. New: global `ActivityTrackingInterceptor`, `AnalyticsScheduler` daily
  storage snapshot, in-process analytics cache.

- **Acquisition tracking beyond the 4-value student enum.** `registerRequestSchema`
  / `registerCoachRequestSchema` now take `acquisitionSource` (12 normalized
  slugs) + optional `acquisitionDetail` + UTM fields; `features/auth`
  `AcquisitionSourceSelect` replaces the old dropdown on both register forms, and
  `lib/acquisition.ts` captures first-touch UTM params / external referrer into
  `localStorage` (mounted via `<AcquisitionCapture>` in `AppProviders`). Coaches
  now answer the question too. Legacy `StudentProfile.referralSource` is kept
  for back-compat.

- **No user-activity signal.** Added `User.lastActiveAt` (throttled by
  `ActivityTrackingInterceptor`, ≤1 write / 10 min / user) + an `analytics_events`
  table written fire-and-forget by `AnalyticsEventService` on login, student
  class-join, assignment submit, and recording watch. Powers real DAU/WAU/MAU +
  new-vs-returning in the engagement section (history accrues from deploy).

## Resolved (2026-08-30)

- **Board usage always 0 + reports showed scheduled, not actual, timing.**
  `finalizeClassAttendance` recomputed the coach's `totalDuration` from the
  session logs but never touched `boardDuration`, so a board tab still open at
  class end (its `BOARD_LEAVE` never arrives, or lands after finalize) was never
  counted — `recordBoardLeaveEvent`'s increment only fired on a clean close.
  Finalize now recomputes `boardDuration` authoritatively from the `BOARD_JOIN`
  logs (idempotent, like `totalDuration`). Separately, the student Attendance
  History row measured "time present / **scheduled** length" and stamped the
  **scheduled** start time; `getStudentAttendance` history now also returns
  `actualStart` / `actualEnd` / `classActualDuration`, and the student + coach
  history tables, the admin completed-classes list, and the class-detail header
  render `actualStart ?? scheduled` and divide by the actual run length.

- **Live class monitoring screen.** `GET /attendance/class/:id/live`
  (`getLiveClassMonitoring`) had no frontend. Wired up: `LiveClassMonitor` +
  `LiveClassMonitorDialog` (`features/attendance/components/`,
  `useLiveClassMonitoring` polls every 10s while `isLive`). Shows online / left /
  not-joined counts, elapsed time, and a per-student roster (connection state,
  join time, last seen, reconnect count). Rendered on `/classes/[id]` for
  coach/admin when the class is live, and behind a "Monitor Live" action on LIVE
  rows in the admin Batch Classes table. No API/schema change.

- **Assignments are now a full learning system, not just PGN replay.** Added an
  `activityType` (`REPLAY` | `SOLVE_LINE` | `PLAY_VS_ENGINE` | `FREE_ANALYSIS`) to
  `Assignment` plus interactive-activity config columns (all additive, `REPLAY`
  default — every existing row and deployment is untouched). New
  `StudentAssignmentAttempt` model + `bestScore/bestAccuracy/attemptCount` on
  `StudentAssignment`. Server-authoritative `AssignmentEvaluationService` +
  `AssignmentAttemptService` with the attempt-lifecycle endpoints under
  `/assignments/mine/:id/attempts`. Frontend: reusable `PracticeBoard`,
  `SolutionEditor`, activity-aware `AssignmentFormDialog` and
  `StudentAssignmentDetailClient`, result/review views, coach score columns and
  admin aggregate performance. Migration
  `20260830152004_add_assignment_activities_and_attempts`. See README §Features.
  Known limits: `FREE_ANALYSIS` completion is manual-submit only (no move-count
  target).

  - **PLAY_VS_ENGINE accuracy shipped.** `AssignmentEvaluationService.engineGameAccuracy`
    runs per-move Stockfish analysis on the student's moves (win%-before vs
    win%-after, Lichess per-move accuracy formula, averaged), called from
    `submit` for non-resigned games. Bounded to the first 40 student moves at a
    200 ms movetime; returns `null` (result-only score, as before) when the pool
    is down or analysis throws. `analyzePosition` gained an optional
    `{ movetimeMs }`. The result view already renders `accuracyPercent` when set.
  - **In-app notifications.** New `Notification` model + `NotificationType`
    (`ASSIGNMENT_DUE_SOON` | `ASSIGNMENT_GRADED`), prisma getter, migration
    `add_notifications`. `NotificationModule` (token-auth): `GET /notifications`
    (latest 50 + unread count), `POST /notifications/read` (ids or all).
    `NotificationService.notify` / `notifyMany` (idempotent on
    `(userId, dedupeKey)`) is exported for other modules. Triggers:
    `NotificationScheduler` (daily 8am) → students with an unfinished assignment
    due in <24h; `AssignmentAttemptService.submit` → the deploying coach when a
    student finishes an attempt. Frontend: `features/notifications/*` +
    `NotificationBell` in the app `Header` (polls every 60s). No email yet.
  - **Author a SOLVE_LINE from the live-class board.** Coach-only
    `SendPositionButton` in the shared-board header (`BoardWorkspace`) opens the
    existing `AssignmentFormDialog` seeded with the current board FEN and
    `activityType: "SOLVE_LINE"` (new optional `initialFen` / `initialActivityType`
    props; `useCoachBatches` gained an `enabled` option). No API change — reuses
    create + assign-now.
  - **SOLVE_LINE hints shipped.** `POST /assignments/mine/:id/attempts/:attemptId/hint`
    (`solveLineHintRequestSchema` → `SolveLineHint`). Progressive, derived from
    the stored solution: level 1 = which piece, 2 = origin square, 3 = the full
    move; each request bumps `hintsUsed` (only when the line is still on track).
    `AssignmentEvaluationService.solveLineHint` + `AssignmentAttemptService.hint`.
    Frontend: the `EvaluatedActivity` Hint button now works and `PracticeBoard`
    gained a `hintSquares` overlay (circle + arrow). Gated on `allowHints`.

- **Phantom "Absent with a join time" in the post-class report.** `getToken`
  opens a `ClassAttendance` row (`recordJoinEvent`, `source: "TOKEN_REQUEST"`)
  the moment a student requests a LiveKit token. A student who loaded the class
  page but never connected (tab closed, connection failed, coach ended the class
  immediately) kept that row: `finalizeClassAttendance` scored it to 0s / ABSENT
  but left `joinedAt` stamped — the summary table then showed "Absent · joined
  07:24 PM" (the class end time, because the open session clamps there). Finalize
  now nulls `joinedAt`/`leftAt` whenever a row scores to `totalDuration === 0`,
  so it reads identically to a true no-show. The `Joined`/`Left` columns were
  also removed from `ClassStudentTable` and the summary header collapsed to one
  line. (Token-request join is kept, not removed — see the LiveKit-webhooks open
  question above; it is the only attendance source if webhooks are not firing.)

- **Board control is now multi-student; PDF tab removed.** The Live Class board
  sidebar's "Board Control" panel and the Participants-panel Crown toggle went
  from single-select (`boardControlStudentId: string | null`) to a granted set
  (`boardControlStudentIds: string[]` with grant/revoke/toggle/clear in
  `LiveClassProvider`). `createBoardStore` now holds `selectedStudentIds: string[]`,
  `senderMayMutateBoard` checks `.includes`, and `UPDATE_PERMISSIONS` carries
  `selectedStudentIds`. The sidebar panel lists every meeting participant (coaches
  shown as "full control"). **Grants are now per colour**: `LiveClassProvider`
  keeps `boardControlStudents: Record<identity, "white" | "black" | "both">`, the
  store mirrors it as `selectedStudentSides`, `UPDATE_PERMISSIONS` carries it, and
  both coach surfaces use the shared `BoardControlSideToggle`
  (Off / White / Black / Both) — so two students can play each other on the
  shared board. Separately, the
  **PDF tab was removed entirely**: `PdfPanel`, the `pdf` tab, `pdfUrl`
  store/sync fields, `SET_UI_STATE.pdfUrl`, the `uploadPdf` client helper, and the
  API `POST /upload/pdf` route + `UploadService.uploadPdf`.

- **Post-class summary screen.** The "class ended" state was a dead-end
  `<RoomEnded />`. Now `GET /attendance/class/:id/summary`
  (`API_ROUTES.attendance.classSummary`, `AttendanceReportService.getClassSummary`)
  returns a role-aware payload — coaches/admins get the full `ClassDetailReport`,
  students get their own attendance row — plus a `finalized` flag the client
  (`useClassSummary`) polls on. `LiveSession.attendanceFinalizedAt` marks
  finalization; the endpoint lazy-re-runs the idempotent `finalizeClassAttendance`
  if the class ended without the marker set. `ClassSummary` renders inside the
  room's `ended` state and the `/live-class/[roomId]` ended branch; "Return to
  Dashboard" is always available. Also fixed the coach-presence check in
  `getToken` / `sweepStaleClasses` to tolerate the `_<clientId>` identity suffix
  (students were stuck in the waiting room), and the meeting timer now counts
  from `liveSession.startedAt` rather than the scheduled start.

- **Meeting countdown ignored a late start (2026-08-30).** Elapsed time already
  ran from `liveSession.startedAt`, but the timer's default countdown mode still
  targeted the scheduled `endsAt`, so a class started late silently lost the
  late-start minutes (18:00–19:00 class begun at 18:15 showed 40 min left, not
  55). `useLiveClass` now derives the countdown target as
  `startedAt + (scheduledEnd − scheduledStart)` once the session is live, so the
  class always gets its full planned duration from when it actually began. Falls
  back to the scheduled end before the class starts or on bad schedule data.

## Resolved (2026-08-29)

- **Board workspace — engine analysis, Load Game, Setup Position.**
  `POST /stockfish/analyze` was dead: `AnalyzePositionDto` had no
  `class-validator` decorators, so the global `ValidationPipe({ whitelist: true })`
  stripped `fen` and the endpoint always returned `{ error }` with HTTP 200 — the
  Engine panel rendered "MNaN". Fixed: shared `stockfishAnalyzeRequestSchema` +
  `StockfishAnalysisResult` types + `API_ROUTES.stockfish`, a decorated DTO,
  proper 400/403/503 responses (no more 200-with-error-body), UCI→SAN conversion
  server-side, and configurable `STOCKFISH_MOVETIME` (default 800ms, was 150).
  `apiFetch` now rethrows aborted requests without the network toast. "Load
  Games / Positions" dialog gained a **Load Game** tab (PGN textarea + `.pgn`
  upload) alongside the position editor; `loadPgnIntoBoard` (`lib/loadPgn.ts`) is
  the single PGN-load path. Coverage: `stockfish.controller.spec.ts`,
  `stockfish.service.spec.ts`, `upload.controller.spec.ts`, and opt-in
  `e2e/analysis-board.spec.ts`.

- **Setup Position tab — blank board + broken palette (2026-08-30).** The Setup
  Position board rendered as an empty rectangle: the spare-piece palette used
  `<div class="pawn white">` which never matches the cburnett `.cg-wrap
  piece.<role>.<color>` rules (needs a real `<piece>` element), and the board's
  chessground instance initialised against a flex item that got stretched
  non-square with no stable size / `overflow` containment, so squares and pieces
  (sized as `12.5%`) collapsed and chessground DOM spilled over the castling
  controls. Fixed by extracting a reusable, LiveKit-free
  `features/chessboard/components/board/PositionEditor.tsx` (+ pure
  `lib/fen.ts`): a controlled `{ value, onChange }` FEN editor with a
  block-level `aspect-square` `overflow-hidden` board (the working
  `PgnBoardViewer` pattern), a real `<piece>` palette, and themed side-to-move /
  castling / en-passant / move-number / FEN controls. `SetupPositionDialog` is
  now a thin consumer; the Load Game (PGN) tab is untouched. Admin Assignment
  Creation can reuse `<PositionEditor>` directly. Coverage extended in
  `e2e/analysis-board.spec.ts`.

- **Coach live-class chessboard — sync fixes + clock + detach.** Fixed: a
  student granted board control could move locally but the move was dropped by
  every other client (all board-mutating messages were blanket coach-only);
  three different participant-identity formats were used for "who has control"
  so grants from the participants panel never matched `canMove`; the coach's
  in-meeting board (`LiveChessboardPanel`) was built but never rendered, leaving
  the coach dependent on a popup window. Now: the receiver runs
  `senderMayMutateBoard` (`lib/boardSyncRules.ts`) keyed by the full LiveKit
  participant identity; one sync engine (`LiveBoardSyncBridge` → `BoardSyncContext`)
  instead of one per `RequestControlButton`. (Superseded 2026-08-30: the
  in-meeting `LiveChessboardPanel` is removed — the coach's board is the
  dedicated `/live-class/:id/board` tab only; the meeting screen stays a
  meeting. Students still see a synced inline board tile in `MeetingVideoGrid`.)
  Added: a shared chess clock (`ClockState` in `createBoardStore`, `lib/clock.ts`,
  `ChessClock`, `SET_CLOCK` message, coach-authoritative) and per-student board
  detach / "resync to coach" (`isDetached` + `detachBoard`/`resyncBoard`).
  Coverage: `e2e/live-board-sync.spec.ts` (opt-in, two real LiveKit participants).

- **PGN assignments** — new `assignment` API module + `features/assignments` web
  feature. Admins author shared library items; coaches author private ones and
  deploy any item to their batches with a due date (fans out a per-student
  completion row per batch member). Students replay the PGN on a read-only board
  and mark it complete with an optional note; the PGN string is also uploaded to
  Cloudinary for download. Fills the previously-404 `/student/practice` route
  that the sidebar + dashboard "Assignments & Practice" card already linked to.

- **`packages/ui` / `packages/utils`** — deleted. Empty shells with no importer in
  `apps/**`; the `.ai/`-manager helpers they held had already been reverted on the
  app side. Lockfile pruned, workspace listings updated.
- **Admin attendance drill-downs** — wired. `attendance.studentById` /
  `coachById` now open from `StudentAttendanceDialog` / `CoachAttendanceDialog`
  (`features/attendance/components/`) off the admin coach report and class-detail
  student table. Backend was already complete + authorized; only the UI was added.
- **God-component splits** — `ProfileForm`, `MeetingVideoGrid`, `MeetingChat`,
  `DemoClassesClient`, and `completed-classes/[id]/page.tsx` each broken into a
  sibling folder of memoized children + a `*.utils` file. Entry paths/exports
  unchanged.

