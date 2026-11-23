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

- **Deploys and rollbacks aren't safe once a migration is involved (audit 2026-11-23).** Rollback has never run in production, puts old code on the migrated schema unchecked, and every container start re-runs migrations (P3009 crash loop after a failed one). There is no backup right before migrating, no alerting (Sentry DSNs unset), only two local image generations, and `nexa.sh restart prod` bypasses every safeguard. Plan, evidence and order: [DEPLOY_ROLLBACK_HARDENING.md](DEPLOY_ROLLBACK_HARDENING.md) (P0 items 1–6 first). Owner decisions listed at its end.
- ~~**E2E specs collide on one coach's time slot (found 2026-11-04).**~~ **Fixed 2026-11-05:** the specs' own cleanup cancelled leftovers with the coach's direct cancel, which V10 refuses within 24 h, so it did nothing. `clearE2EClasses` (`e2e/fixtures.ts`) now cancels the real way (the coach files CLASS_CANCEL / CLASS_CANCEL_EXCEPTIONAL, the admin approves) and runs before every `scheduleClass` and in `live-board-recovery`.
- ~~**E2E UI logins don't back off on the login throttle (found 2026-11-04).**~~ **Fixed 2026-11-05:** `loginViaUI` waits out a 429 like `loginContext`, and `analytics-dashboard` uses it. Also for split hosts (staging `dev.` + `api-dev.`): every request sends the web `Origin` (`playwright.config.ts` `extraHTTPHeaders`; without it `TENANT_SCOPE_MODE=enforce` refuses `/auth/login` with a 500), and `login()` keeps the cookie's own `Domain` so cookies added to a browser context reach the web host. `findInDataTable` moved to the fixtures and also pages "Next page" pagers (admin completed classes are oldest first). Still not runnable on staging: `recording-flow` (the staging API's `/recordings` doesn't exist on the host).
- ~~**`progress/activity-history.int-spec.ts` "buckets by day in the viewer's own timezone" fails in the last hour before midnight in `America/Los_Angeles`**~~ **Fixed 2026-11-05:** the server's window was already built from local calendar days; the 24 h steps were in the web's `dayIn` (`features/progress/lib/activityFilters.ts`, so "Last 7 days" covered 6 or 8 days around midnight in the week after a DST change) and in the spec's copy of it. Both now step calendar dates (`addDays` from `@nexa-chess/types`); `daysFromToday` in `lib/datetime.ts` (Today/Tomorrow labels) had the same drift and was fixed too. Reproduced and verified with the Node clock shifted to 23:30 PST on 5 Nov.
- ~~**`approval/handlers/class-cancel.handler.spec.ts` fails about 1 run in 6**~~ **Fixed 2026-11-05:** the fixture's `startsAt` and the request's snapshot were each built from `Date.now()`, so a millisecond tick between them read as "rescheduled" (409). The spec now runs on one fixed clock (`jest.useFakeTimers({ now })`).
- ~~**A cold `tsc --noEmit` in `apps/api` runs out of memory on the 11 GB box (found 2026-11-04).**~~ **Fixed 2026-11-05:** the api `typecheck` and `test:integration` scripts run Node with `--max-old-space-size=6144` (written as `node … ../../node_modules/<tool>` so it works in PowerShell too). Measured: a cold typecheck peaks at 3.06 GB against Node's 2,096 MB default heap here, and a cold `test:integration` (ts-jest type-checks the whole program) died with a heap OOM before its first file; with the flag it passed 682/684.
- ~~**Saving a PGN "to Cloud" without Cloudinary credentials returns 400**~~ **Fixed 2026-11-04:** every Cloudinary upload is a 503 "File uploads aren't set up on this server" without `CLOUDINARY_*` (`assertUploadsConfigured`, `upload.service.spec.ts`). `analysis-board.spec.ts` still needs real Cloudinary credentials for its Save to cloud step.
- ~~**Empty 400s right after an engine analysis stream (found 2026-11-05; production since 2026-10-03).**~~ **Fixed on `dev` 2026-11-05 (`a74cad1b`), verified on staging (0 failures, was ~12 %); in production since 2026-11-14** through hotfix PR #138 (`051df8a3`, the fix alone on top of `e04a39b4`). Baseline before it: on class days, 93–100 % of streams were followed by an empty 400 (107 on 2026-11-10). Verify with the query in the write-up §8. **Release done 2026-11-15:** release PR #129 had been merged by mistake and reverted on `main` by #137; the release PR #142 (`639a175c`) brought `dev`'s work back, so nothing is left to revert. The Node API rejects (`HPE_CLOSED_CONNECTION`, "Data after `Connection: close`") the next request nginx sends on an upstream connection that last served `POST /stockfish/analyze/stream`. Node answers it with a bare 400: no headers, so the browser reports a CORS error.
  - **Cause:** `stockfish.controller.ts` `analyzeStream` sets `Connection: keep-alive` on the response, while nginx asks for `Connection: close` (the `$connection_upgrade` map) and keeps an upstream pool (`keepalive 64`). nginx then reuses a connection Node is closing.
  - **Not the cause:** HTTP/2 (reproduced over HTTP/1.1, 4/4) or the web cancelling the stream.
  - **Impact:** about 55 % of streams poison one pooled connection, and the next request from any user fails: board saves, room loads, heartbeats, PGN upload, a WebKit room reload ("Connection lost"). Over 500 failures in two weeks of production logs.
  - **Recommended fix:** remove that one header line, plus a spec and a regression check. Optional later nginx clean-up.
  - Full write-up: [investigations/2026-11-05-empty-400-after-engine-stream.md](investigations/2026-11-05-empty-400-after-engine-stream.md).
- **Enforce the full web CSP (opened 2026-11-05).** Reports now reach the API (`csp-violation` log lines, docs/AUTHORIZATION.md "CSP reports"). **The release-cycle clock started 2026-11-15 20:13 UTC**: before then reports never reached production's API (nginx had no `/api/` rule for them; added that evening, [DEPLOYMENT.md](DEPLOYMENT.md) Step 4). After a release cycle from that moment, read them, add any missing host to `reportOnlyCsp()` or fix the page, then move the policy from `Content-Security-Policy-Report-Only` to `Content-Security-Policy`. `script-src 'unsafe-inline'` stays until nonces are wired through middleware, so enforcing still blocks foreign hosts but not inline script.

### P3 — feature follow-ups (net-new, each needs a product yes)

- **Tournament platform (logged 2026-11-09; built 2026-11-09 on
  `claude/nexachess-tournament-platform-sjutfe`; **released to production 2026-11-15** in #142).**
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
  disappears behind the root spinner. **2026-11-14:** navigation started in
  code starts it too: `useRouter` comes from `@/lib/navigation` (45 files;
  ESLint rejects the `next/navigation` one), whose `push`/`replace` fire
  `nexa:navigation-start` when the path changes. **Checked 2026-11-15 on a
  production build** (`next start`, Chrome "Slow 4G", `/` → `/login`): with the
  page prefetched the bar shows at the click and the page lands in ~30 ms; with
  the prefetch held back 6 s the bar shows at the click (+0 ms) and stays until
  the page lands (+3.4 s), then finishes. It only makes the wait visible; a slow
  server needs its own look.

- **Smart Revision:** non-puzzle item kinds (lessons / `REPLAY` assignments,
  course modules, live-class chapters). Blocked by design: no graded attempt to
  cap a self-rating ([SMART_REVISION.md](SMART_REVISION.md)).
- ~~**Email opt-out.**~~ **Built 2026-11-13:** every rule email has the
  recipient's unsubscribe link, and the profile page has the same switch
  ([MESSAGING.md](MESSAGING.md) "Email channel"). **2026-11-15:** per-kind
  switches (six kinds), RFC 8058 one-click unsubscribe, the link and opt-out on
  staff-written email, and Admin → Email → Opted out. Nothing left open.
- **Payroll:** percentage-of-revenue is a stubbed ₹0 line (no revenue linkage,
  `payroll-calculation.engine.ts` `case "PERCENTAGE"`). No bank payout
  integration, no multi-currency, no rate CSV import/export.
  **Owner 2026-11-15:** leave percentage-of-revenue as it is for now.
  **TDS built 2026-11-15** (owner: admin-set rate): an admin-set rate and yearly
  threshold, a coach's own rate, and a TDS line on every payslip
  ([FEATURES.md](FEATURES.md) "Coach payroll: TDS"). Still not built: a TDS
  return (Form 26Q) export, TDS certificates, an automatic higher rate for a
  coach without a PAN, salary TDS by slab.
- **Chat push:** a websocket only if the 4 s poll proves too slow or costly.
  There is no evidence of that yet.
- **Referrals** ([REFERRALS.md](REFERRALS.md), shipped 2026-11-02, rebuilt
  2026-11-07 as points + vouchers for students, money for staff).
  **Built 2026-11-13:** notifications (stage move, reward credited, voucher
  request / withdrawal decided), a CSV export of withdrawals to pay in bulk,
  and optional points expiry. **2026-11-15:** a 7-day points-expiry notice, a
  "taken back" notice (credited reward cancelled, voucher code revoked), Import
  paid CSV (the export filled in with references marks them paid), and
  admin-created accounts link by email like sign-up. **Still open:** onboarding
  is still an admin move, and free days given by a voucher can't be taken back
  from the referral board (adjust the access in Payments).

- **Mini plan + fee tracking on every plan (built 2026-11-20, branch
  `feat/mini-plan-fee-tracking`, PR into `dev`).** Manual (cash / UPI / bank)
  payments, fee plans, invoices and billing moved to a new `feeTracking`
  feature on every plan; online payments (`studentPayments`) stay Growth up and
  imply it ([SAAS_PLANS.md](SAAS_PLANS.md) "Fee tracking and online payments").
  New **Mini** plan: 25 students, 1 coach, 5 batches, 1 live class, ₹999/month,
  ₹9,990/year, 14-day trial (placeholder: the owner sets prices live in the
  platform console). **Owner 2026-11-20:** in-class activities
  (`interactiveClassroom`) on every plan, so Mini and Starter have them. A solo
  coach still needs one admin + one coach account until multi-role accounts
  with a role switch are built (proposed 2026-11-20, not started).

### Needs someone with `vps_dev` / production access

- ~~Confirm `LiveKit webhook: event=…` lines in the API logs during a real class
  (§ "Runtime open question" below).~~ **Confirmed 2026-11-14 from production's
  `processed_webhook_events`:** 1,382 events in the 30 days to 2026-11-13
  (participant_joined/left 287 each, track published/unpublished 274 each,
  room_started/finished 107 each, participant_connection_aborted 46).
- ~~Run `npm run audit:reliability -w apps/api -- --days 90` against real data.~~
  **Done 2026-11-14 against production: healthy** (3 classes that really ran
  over, no runaway student duration). The script was fixed to judge each
  student, not the sum, and to use the stored `totalDuration`. Results:
  [RELIABILITY_DESIGN.md](RELIABILITY_DESIGN.md) §6.1.
- ~~Staging-check the 10-minute LiveKit token TTL (below) across a class longer
  than 10 minutes.~~ **Done 2026-11-15 on staging:** a coach and a student (headless
  Chromium, fake media) stayed in one class for 11.5 minutes; neither lost the room
  and the browser consoles showed no disconnect or token error (test passed in
  11.8 min). The check is now `e2e/livekit-token-refresh.spec.ts`
  (`RUN_TOKEN_REFRESH_E2E=1`, PR #145). Still not tried: a real device on a flaky network.

### Waiting on an owner decision (designs exist, nothing to build yet)

[SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) (proposal),
[WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) Phases 3–4 (Phases 1–2 are built, see below),
[PARENT_REPORTS.md](PARENT_REPORTS.md) (blocked on a verified guardian
identity), the AI roadmap phases after 2 / 3a
([ai/architecture/ROADMAP.md](ai/architecture/ROADMAP.md)), and puzzle-catalogue
Phase 6 training modules ([PUZZLE_CATALOGUE_ARCHITECTURE.md](PUZZLE_CATALOGUE_ARCHITECTURE.md) §G.3;
its precondition, the student training surface, now exists).

- **WhatsApp support bot: Phases 1–2 built, switched off** (2026-11-14,
  `feat/whatsapp-support-bot`; [WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) §0).
  Also built: saved answers (instant replies to course questions, "Did you
  mean …?" for spelling slips, a list of questions it couldn't answer), "Book a
  free demo" → `Lead`, staff reminders and one parent nudge. Before switching on,
  admins should write the saved answers (fees, timings, levels…) at
  `/admin/support/saved-replies`: nothing is pre-loaded.
  To switch on, the owner needs to: (1) give staging its own Meta test number and token (it still
  shares production's, so dev would answer real customers); (2) set
  `WHATSAPP_APP_SECRET` + `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and point the Meta
  webhook at `/webhooks/whatsapp` (`messages` field); (3) optionally get a
  reply template approved (`SUPPORT_AGENT_REPLY_TEMPLATE`, {{1}} reference, {{2}}
  text); (4) roll out with `SUPPORT_TEST_NUMBERS_ALLOWLIST` = staff numbers.
  Open questions: §12 items 2 (which number; is it on the Business app today),
  5 (Leads/Frappe), 6 (account linking), 7 (refund policy text, SLAs), 8 (support
  hours / out-of-hours reply), 12 (AI); a legal (DPDP) review of the new
  privacy-policy wording in `features/legal/content.ts`. ~~Gaps to build: an nginx IP limit on `/webhooks/whatsapp`~~
  **Built 2026-11-15** as two nginx snippets ([WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md)
  "Edge rate limit"); **still not installed on the box as of 2026-11-15 (the owner's step)** (the contact
  export/erase action and `message_deliveries` status updates were built in
  Phase C, 2026-11-14).
  **Phase B and Phase C were built unattended on 2026-11-14** (branch
  `feat/whatsapp-native-complete`, PR into `feat/whatsapp-multi-academy`): every
  academy's own number, team hours, delivery status, real demo slots, contact
  export/erase, template status, images/PDFs, the Frappe push, ownership events,
  `/admin/support/insights`, the configurable main menu and Phase D (staff-issued
  WhatsApp link codes, "next class" for linked families). The questions that
  run left are under "Questions for the owner" below (2026-11-14 entry).
  **Next phases are planned in [WHATSAPP_SUPPORT_MODES_PLAN.md](WHATSAPP_SUPPORT_MODES_PLAN.md)
  (2026-11-14, proposal; open decisions in its §0 come first; D3, D6, D12,
  D13 answered).** Its G1 finding is fixed: a bot reply staff overtook is no longer sent.
  ~~Found while building Phase C (2026-11-14): messaging rules and system
  messages build their links with `getFrontendUrl` (Nexa's address) for every
  academy.~~ **Fixed 2026-11-15:** `AcademyLinksService` puts every link on the
  academy's own address ([SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) § "Links in messages").

- **Unused asset: `apps/web/public/auth/auth_light.webp`** (2026-11-03). Since the
  M4 auth redesign the auth panel is navy in both themes and shows only
  `auth_dark.webp`, so nothing references the light artwork. Kept on purpose:
  assets and images are only deleted with the owner's yes (keep it, delete it,
  or bring back a light panel that uses it).

- **Unused assets: `apps/web/public/academy/hero_light.webp` and `hero_dark.webp`**
  (2026-11-14). Both hero sections (`/` and `/academy`) now show the 3D board
  (`features/academy/hero3d`) on a drifting-light and faint-chessboard backdrop,
  so nothing references the hero photos. Kept on purpose, as above: the owner
  decides (delete them, or use them as the picture shown where WebGL is missing).

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

- **2026-11-22 night run, branch `feat/lead-pipeline-ad-measurement` (one lead pipeline + Meta ad measurement; [LEAD_STAGES.md](LEAD_STAGES.md), [AD_MEASUREMENT.md](AD_MEASUREMENT.md)).** All six phases built, everything **off by default and Nexa's academy only**. Nothing was sent to Frappe or Meta, nothing touched staging, `vps_dev` or production; browser checks ran on a private stack (worktree, `_int` database `nexa_gen_night_int`, which you can drop, `:3100/:3101`, every outside service blanked). PR into `dev`, not merged.
  - **Results.** (1) Frappe → NexaGen stage return (`FRAPPE_CRM_STAGE_RETURN`). (2) Every new WhatsApp chat becomes a lead, ad chats tagged with their click (Admin → Support → Settings "Make every new chat a lead"; sends nothing, bot stays off). (3) Conversions API outbox: Lead / LeadSubmitted, Schedule / QualifiedLead, Purchase with value (`META_DATASET_ID` + `META_CAPI_ACCESS_TOKEN`). (4) Meta Pixel behind an Accept/Decline banner and a new "Ad measurement" privacy section (`NEXT_PUBLIC_META_PIXEL_ID`). (5) Admin Leads → Funnel tab, with optional read-only ad spend (`META_ADS_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID`). (6) Docs. Two migrations (`…_lead_capture_ad_clicks`, `…_meta_capi_events`), both additive and in the D5 contract.
  - **Defaults from the plan, as built:** stages can change in either place and the latest wins; lead details go NexaGen → Frappe only; a chat becomes a lead unless the number is an account (student phone or parent phone) or has an open lead (90 days, not Lost / Converted); Frappe names NexaGen doesn't know are ignored on the way back.
  - **Defaults I took (each easy to change):**
    1. **Won leads ignore Frappe entirely.** A Converted / Active student lead is never read back, so marking it Lost in Frappe doesn't move it in NexaGen. Option: allow Enrolled → Lost from Frappe.
    2. **Capture is Nexa only**, a switch on the support settings page shown only for the platform number, not a per-academy feature. Option: open it to academies with their own number later.
    3. **Captured leads' child details aren't re-sent to Frappe** once the bot (or an admin) fills them in: the Frappe lead keeps "Student: not given yet" in its note. Option: send an update of the details (would break "details flow once").
    4. **Leads and their ad clicks aren't in an account's privacy export** (a lead isn't an account; this was already so). Option: include a parent's leads in their export when the phone matches.
    5. **No pixel on `/plans`**: it needs a sign-in, so there is no ViewContent event. Option: fire ViewContent when the home page's pricing section comes into view.
    6. **Organic WhatsApp chats send no Conversions API event** (only chats with a Click-to-WhatsApp click id). Meta's business_messaging events need the `ctwa_clid`.
    7. **Funnel spend uses the ad account's days** (Meta's reporting zone) while leads use the academy's; with both in India time they match. Spend is cached six hours.
    8. **"Change cookie choices"** sits on `/privacy` only, as a button at the end of the policy. Option: a footer link on every public page.
    9. **Website conversions need the banner's Accept**: a visitor who never answers is treated as no. Decline also withdraws a queued website event for an earlier lead from that browser.
  - **Your steps (morning checklist, in order):**
    1. Events Manager: create the dataset, link it to the WhatsApp account and the website, verify the `nexachess.in` domain, give the system user access; make the read-only token with `ads_read` for the funnel spend.
    2. **Decide on Frappe's "New Lead Welcome"** before capture goes on: every new WhatsApp lead reaches Frappe, so it would message each of them (paid).
    3. After the release, switch on in this order: `FRAPPE_CRM_STAGE_SYNC` (production), `FRAPPE_CRM_STAGE_RETURN`, then move the number's webhook to NexaGen (`WHATSAPP_APP_SECRET` + `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `messages` subscribed, bot off) and turn on lead capture; then the Conversions API with `META_CAPI_TEST_EVENT_CODE` (check Test events), then without it, then `NEXT_PUBLIC_META_PIXEL_ID` (build-time: rebuild web).
    4. Have the "Ad measurement" privacy text read by whoever signs off the policy.
  - **Not done:** a real Frappe round trip and a real Meta event (both forbidden tonight; specs use mocked HTTP), and staging checks (staging pushes into the real CRM).

- **2026-11-21 night run, branch `feat/daily-puzzle-whatsapp-step3` (Puzzle of the Day step 3 + step 2 on by default, [PUZZLE_OF_THE_DAY.md](PUZZLE_OF_THE_DAY.md)).** Built from the plan and your calls in that doc; these are the defaults I took where the plan was silent. Each is easy to change.
  1. **Where it went.** The branch starts from local `dev`, which had 8 unpushed commits (Puzzle of the Day step 1 docs, step 2 `35ed3273`, the plan docs), so the PR into `dev` carries those too. Pushed the branch and opened a PR into `dev`; nothing merged, staging not rebuilt (it serves the `dev` checkout).
  2. **A shared phone and an image-header template.** Your call: a phone on 2+ student accounts gets the link only. An approved template that has an Image header can't be sent without a picture, so with such a template a shared number gets the picture too, but its replies still get "solve it in the app". With free text (no template) it gets the text only. Other option: a second, picture-less template for shared numbers.
  3. **Which accounts make a phone "shared".** Any active student account with that number, even one whose Puzzle of the Day is off or who switched WhatsApp off (a sibling could still answer from that phone).
  4. **Answering needs the support bot on.** Replies reach the API only through the WhatsApp webhook the support bot handles, so an academy without the bot gets the picture but no answer checking. Not while staff own the conversation either (the move goes to staff as text).
  5. **"Correct" finishes the day as solved.** Only the first move is asked on WhatsApp, so a right first move finishes the attempt SOLVED at 100% (rating and streak count) even when the line is longer; the reply links to the app to play out the rest, where it shows as finished. ANSWER (after the threshold) and running out of tries finish it FAILED; the streak still counts (finishing keeps it).
  6. **HINT text.** The puzzle's own first hint if it has one, else "move your knight" (which piece, never the square). Counted once as a hint on the attempt.
  7. **Signing key.** New optional `DAILY_PUZZLE_PICTURE_SECRET`; unset = a key derived from `CREDENTIALS_ENCRYPTION_KEY`, else `MFA_ENCRYPTION_KEY`, so production works without a new secret. Set it if you'd rather keep them separate (changing it only breaks picture links of the last 3 days).
  8. **Picture look.** The academy's admin board theme and piece set (not a student's own), 824×888 PNG with coordinates and "White/Black to move". A test send of a rule with an image-header template uses the site's share image, not a board.
  9. **Old step 2 data.** The opt-in column `StudentProfile.dailyPuzzleWhatsAppAt` and the keyword column `WhatsAppContact.dailyPuzzleAt` are no longer read but kept (migrations stay additive). Numbers that had sent PUZZLE without an account stop getting it. Staging (`vps_dev_saas`) already has step 2's migration; this branch adds two more (`…_daily_puzzle_whatsapp_default_on`, `…_daily_puzzle_whatsapp_answers`), applied only to the `_int` database `nexa_gen_potd3_int` (drop it when done).
  10. **Not done tonight:** a real Meta template and a real reply (needs an approved template and the academy's number), a browser check of the admin settings form and the student card (staging serves `dev`).

- **2026-11-21, branch `feat/saas-finish` (finish SaaS: roster import, academy closure, production rehearsal, cutover runbook).** Built to the owner's 2026-11-21 answers; the run's hook stopped questions, so these are my defaults. Each is easy to change.
  1. **Undo window and confirmation.** A deletion waits **7 days** after approval (`ACADEMY_CLOSURE_UNDO_DAYS`); every request and approval needs the academy's name typed back. Options: 0, 7 or 30 days; name or a code. Change the constant to move it.
  2. **What "delete" keeps.** Orders, payments, refunds, invoices, credit notes, the invoice audit log, manual payment records, coach payroll records, payroll adjustments, payslips and referral cash withdrawals (`RETAINED_MODELS`, the records tax law requires). Everything they point at stays too, and the people they name are anonymised. Options: also delete these (illegal for invoices in India), or keep more. Please confirm the list with your accountant.
  3. **Not purged:** LiveKit recording files and database backups in object storage (the purge removes the rows, not the files; backups age out on their own schedule). Option: a later step that deletes the academy's recording files too.
  4. **Who may close.** As answered: operators (audit-logged) and the academy's own super admin by request, an operator confirming. I left out the academy's ordinary admins and the platform support account on a support visit. Option: let admins ask too.
  5. **Roster import by operators** works through a support visit (the console's "Support" into the academy, then Users → Import). I didn't build a separate console import page. Option: a console page per academy.
  6. **Closed academies are frozen:** the subscription lapse sweep skips a `DEACTIVATED` academy, so closing doesn't also produce lapse emails or status changes. Reopening leaves the subscription as it was; check it then.
  7. **Two cutover gaps found and fixed (please review):** (a) `docker-compose.yml` never passed `TENANT_SCOPE_MODE` to the API container, so setting `enforce` in production's root `.env` would have done nothing. It now passes it, default `audit`. (b) Nested Prisma creates (e.g. a chat's `members: { create: [...] }`) didn't get the academy from the tenant-scope extension and fell back to the `'tenant_nexa'` column default. Another academy's rows would have been labelled Nexa's, and after D5 they'd fail. The extension now stamps nested writes (`stampNested`), and `tenancy/nested-writes.int-spec.ts` holds it.
  8. **Production rehearsal.** Ran once on a read-only production `pg_dump` (no Lichess puzzle rows) into a throwaway container: PASS. Dump shredded, container removed. Production was never written. Re-run it right before promoting D5 (runbook C.1).
  9. **Puzzle of the Day and future tables.** PotD's three tables and `user_role_changes` were added to the D5 contract. From now on `tenancy/d5-contract.spec.ts` fails CI when a new academy table lands without its contract line, so PotD's later steps will be asked for theirs.
  10. **Browser testing was not on staging.** Staging (`dev.nexachess.in`) was serving the unmerged Puzzle of the Day branch (PR #168). Moving it to this branch would have replaced that build and migrated the staging database ahead of `dev`. So I ran this branch on a private stack from its worktree instead: API :3101 and web :3100 on a scratch `_int` database, every outside service blanked, and the academy at `rook.localhost` (Chromium resolves `*.localhost` itself, so no `/etc/hosts` or nginx change). It covered the console creating the academy, CSV import, the data download, the closure request, approval, cancelling the deletion and reopening, no horizontal overflow at 390/1280 px, and `e2e/white-label.spec.ts` 4/4. Option: repeat it on staging once both PRs are in `dev`.
  11. **A closed academy's address shows a broken dashboard, not a "this academy is closed" page.** Open tabs get "Session expired" and failing widgets (the API refuses its origin while it is closed). Nothing leaks; it just isn't friendly. Option: a closed-academy page from `public-config`. Not built.
  12. **Fixed on the way (please review):**
      - A tab left open across an academy closing and reopening never went back to `/login`. `lib/api.ts` now sends the tab there whenever a refresh is refused with 401 (the API has cleared the cookies by then).
      - Re-importing a file created the no-email people again. They are now matched by name and role.
      - `e2e/white-label.spec.ts` sent Nexa's Origin, so it checked Nexa's branding, not the academy's.
  13. **Where it went.** Pushed `feat/saas-finish` and opened a PR into `dev` (unmerged). Nothing was deployed. The production order is in [SAAS_CUTOVER_RUNBOOK.md](SAAS_CUTOVER_RUNBOOK.md); every stage there is your call.
- **2026-11-20, branch `feat/multi-role-accounts` (multi-role accounts, [MULTI_ROLE_ACCOUNTS.md](MULTI_ROLE_ACCOUNTS.md)).** The run's hook stopped questions, so I took these defaults; each is easy to change.
  1. **Where it went.** Pushed `feat/multi-role-accounts` and opened a PR into `dev`. Nothing was merged. Options I saw: a PR into `dev` (taken), push the branch only (saves Actions minutes), or commit straight to `dev` (the /goal rule forbids it).
  2. **Testing.** Unit and integration tests ran on a private `_int` database (`nexa_gen_multirole_int`; drop it when done). The staging e2e in the design doc §6 was **not** run: staging serves the `dev` checkout, so it would mean merging into `dev` first. Option: merge the PR into `dev`, rebuild staging, then sign in as an admin who can teach, record a cash fee in admin view, switch, and start a class in coach view.
  3. **A super admin may tick "Can also teach" on their own account.** Taken, because a solo academy owner has only one login (it is still recorded in `user_role_changes`). The other option is to require a second super admin, which would leave a solo owner needing Nexa support.
  4. **Removing the role keeps the account as coach of its batches.** As the design says, the admin is shown the list; nothing is reassigned automatically.

- **2026-11-17 night run (its plan file is removed by this PR; it is in git history as `docs/NIGHT_RUN_2026-11-17.md`): results, and what I assumed.** PRs, all into `dev`, none merged: **#156** app shell overlay nav (`feat/app-shell-overlay-nav`), **#157** form validation (`fix/form-validation-ux`), and this docs PR.
  1. **Results as they came out.**
     - **#156:** typecheck ✓, lint 0 errors (1 existing `<img>` warning), worktree `next build` ✓. `e2e/app-shell-nav.spec.ts`: Chromium 14/14. WebKit 12/14 on the first run: the two phone drawer guards (light and dark) tapped the backdrop mid-slide in WebKit's slow Linux build. Both passed once the test waited for the slide; a full WebKit re-run afterwards passed 14/14.
     - **#156 shots:** 126 across `/admin`, `/coach`, `/student` × 21 devices × light/dark, plus 18 desktop expanded and flyout cases (1280, 1440, 1920 px); 0 horizontal overflow.
     - **#157:** typecheck ✓, lint 0 errors (same warning), worktree `next build` ✓. `e2e/form-validation.spec.ts` in Chromium: 22 passed, 2 skipped (batch edit at 390 px: batches are cards there).
     - **#157 shots:** 252 with errors showing (login, register, reset password, and three dialogs: new sales account, new voucher, add referral stage; each × 21 devices × light/dark); 0 overflow, 0 page errors.
  2. **`main`'s rect from the sidebar spec**, identical on the rail, expanded and collapsed again, in both themes and both browsers. The header toggle's and logo's rects were equal too.
     - 1440 px: `{x:64, y:64, width:1376, height:2178}`
     - 1280 px: `{x:64, y:64, width:1216, height:2238}`
  3. **Forms:** 105 files audited (`docs/FORM_VALIDATION_AUDIT.md`; 42 with `<form>`, 17 with `useForm`, 72 dialogs with inputs).
     - Tested automatically: **6**.
     - Clicked through by hand: **0**.
     - Read only (changed or inheriting the new `FormField`, checked by typecheck, lint and build but never driven in a browser): **49**.
     - Not tested (unchanged): **50**.
     - Some read-only rows could still hide a regression. The ones most worth a click: class request, deploy assignment, voucher, credit note, refund, withdrawal, stage editor.
  4. **Client vs server rules.** Coach registration accepted a FIDE rating up to 9999 and up to 99 years of experience; the API allows 4000 and 80, and the client now enforces the API's limits. Two client rules are stricter than the API, as before, and were left: student registration requires "How did you hear about us?" (optional in the API), and age must be 3–99 (the API only asks for digits). Say if either should match the API.
  5. **Calls made on your behalf.** The seven in the plan, all built as written:
     - the page is offset by the rail only, and the panel slides over it
     - the panel behaves like a popover and closes after navigation
     - the rail is the resting state; the saved `collapsed` is no longer read, but the key is kept
     - flyouts open on click and on hover after 150 ms, close 250 ms after the pointer leaves, and work from the keyboard
     - phones and tablets unchanged
     - field messages anchored under the field, never adding height
     - form and server errors as toasts, except a lockout's wait time
  6. **Calls I added (each yours to change):**
     - **Nav:**
       - The expand toggle keeps the rail's position in both states; the logo now sits to its right when expanded, where it used to be on the left. This is so the toggle never moves.
       - The panel sits above the header's left end (`z-[45]`).
       - A hover-opened flyout that is then clicked stays open.
       - The flyout is navy like the nav, not the light popover style.
       - The nav link list was diffed before/after in the browser for every role. Super admin, coach and student: unchanged. Admin: staging has no ADMIN-role account (`admin@nexa.test` 401s; creating one was blocked by the session's permission check), so the admin menu was rendered from a super admin session with only `user.role` rewritten to `ADMIN` in the browser (Playwright rewrote `/auth/me` and the saved `nexa-auth`; no database writes). The panel footer read "Admin", and the six super-admin-only links (backups, batch classes, data retention, demo classes, platform console, trash) dropped out as expected. On `dev` and on the branch: 46 links at 1440 px and in the 390 and 768 px drawers, identical in order, 0 overflow. The source-level `getAdminNavGroups("ADMIN")` comparison also matched (91 entries with and without the platform-operator flag). SALES wasn't rendered: no SALES user exists on staging, and its code path is unchanged.
     - **Forms:**
       - Messages are announced once, when they appear (`role="alert"` on mount), rather than only after a submit.
       - Auth forms got a fixed 20 px field gap; other forms keep 16 px or more.
       - A group's message (assignment solution and batches) sits on its title line.
       - The bulk puzzle edit's "why Review is disabled" is a fixed one-line slot.
       - The original home page kept at `/academy` shows its checks as toasts, not field messages.
       - The shared `Form` no longer toasts the list of field errors.
       - The guest demo-join page got its own name and contact checks.
     - **Left in place:** WhatsApp connection, gateway keys and the academy detail form still rely on browser `required` (they have no client validation; an empty submit gets the API's own message).
  7. **Staging and the box.**
     - Staging's dev-mode API (`nest start --watch`) had crashed out of memory at 20:09 before the run began. I relaunched only that window with `NODE_OPTIONS=--max-old-space-size=6144`. Say if `scripts/nexa.sh` `DEV_API_CMD` should set that.
     - `TENANT_SCOPE_MODE` is unset in `apps/api/.env`, so dev mode runs the code default rather than `enforce` as stage does. Not changed.
     - **An incident I caused and repaired.** I started a worktree's web with `scripts/nexa.sh start dev web`. Its `install_deps_if_needed` ran `npm install` (a fresh checkout's lockfile is always "newer"), and through the worktree's symlinks npm renamed 393 packages in the main checkout's `node_modules` (scoped folders, `.bin`, `apps/{api,web}/node_modules`) and created 121 empty folders before failing. Nothing ran from them in the meantime; staging's processes had their modules loaded already.
       - Repaired by renaming each package back. The empty folders were moved into the session scratchpad, not deleted.
       - Installed versions match `package-lock.json`. The `npm ls` complaints left (ajv / deepmerge-ts / chokidar ranges and 3 extraneous packages) are in files last written 2026-11-07 and 2026-11-16, i.e. they predate this run.
       - Worktrees are now launched with tmux directly, and the memory notes say never to use `nexa.sh start` from a symlinked worktree.
     - A `pkill -f` I ran matched only my own shell; no other process was touched.
  8. **Dev servers:** back on this checkout (`dev`, dev mode, :3010/:3011, tmux `nexa-dev`) through `NEXA_NO_PULL=1 scripts/nexa.sh start dev web` and `… start dev api`, with `NODE_OPTIONS=--max-old-space-size=6144` set in the `nexa-dev` tmux session environment so the dev API keeps its larger heap. Confirmed: both processes' working directory is this checkout, `api-dev …/health` 200, `dev.nexachess.in/login` 200.
  9. **Tidy-up:** removed this run's three worktrees (`app-shell`, `forms`, `night-results-1117`; all clean, PRs open). Their screenshots were moved first to `scripts/responsive/shots/night-2026-11-17-*` in this checkout (gitignored, 9 folders). Last night's worktrees are untouched. No branch was deleted locally or on GitHub.
- **2026-11-16 night run (its plan file was removed once these results were in; it is in git history as `docs/NIGHT_RUN_2026-11-16.md`): results, and every call I made for you.** PRs, all into `dev`, none merged: **#150** home/academy swap, **#151** Storm/Racer same-start-position fix, **#152** D5 contract + rehearsal, **#153** WebKit PDF import, **#154** solo Storm/Racer follow-ups. Nothing touched `main` or production (production was only read: one read-only `pg_dump` for the rehearsal, deleted afterwards).
  1. **Home swap (#150).** `/` renders the v2 page with all of `/`'s metadata, JSON-LD, `AcademyHome` + `platform-brand-only` and tracking; `/academy` the original page (`AcademyHomeV1`), `noindex`, canonical `/`, no JSON-LD. Nothing deleted. v2 needs neither the old font variables nor `ScrollObserver`, so `/` dropped them. Verified: typecheck, lint, worktree web build, shots 42 + 42 with 0 overflow, no console errors (WebGL off: only three.js's own context errors), academy host shows its own home. **Not changed, pre-existing:** Nexa's JSON-LD `<script>` sits inside the hidden wrapper, so it is still in the HTML of an academy's `/` (it was before the swap too). Say if it should be left out on academy hosts (needs the host at render time).
  2. **Same-start-position Storm bug (#151).** Fixed in the solo **and** live-class players (`resetKey = rushBoardKey(run)`: puzzle index + ply). Reproduced on a private stack (second mate not counted), then both mates counted in Storm and Racer. The live-class player wasn't browser-tested (needs a room). Real catalogue on `vps_dev`: 4 pairs out of 3,740,588 puzzles share start FEN and setup move, so real runs practically never hit it.
  3. **Solo Storm/Racer calls (#154), each yours to change:** leaderboard names are **first name + last initial** ("Arjun K."); **who may play, points, rating and history unchanged**; leaderboard **polls every 45 s** while on screen and visible, refreshes at once after a finished run, no websocket; **dashboard card** in the side rail under Smart Revision, shown only to eligible students: this week's best per mode or "Try Puzzle Storm". The week is the leaderboard's rolling 7 days, not a calendar week. Data comes from the existing `GET /puzzle-rush/solo` (new `weekBests` field), so no new route. Verified: API tests 3,334 passed, typecheck/lint/web build, private-stack browser check (short name, instant refresh, 2 polls in 100 s, card full and empty), 84 shots with 0 overflow.
  4. **WebKit PDF import (#153): not a Safari bug, as far as a headless engine can tell.** pdf.js loads, renders and reads text in Playwright's WebKit; the spec **passed 11/11 in WebKit against staging** (twice). Its Linux build renders a page ~16x slower than Chromium (8.3 s vs 0.5 s), so a busy box ran out the 10–15 s waits. The WebKit project now waits longer and the suite is `test.slow` there; no change to `lib/document-reader`. **Still worth a real-device check** (steps in TROUBLESHOOTING): import `book-two-diagrams.pdf` in Safari on a Mac and an iPhone. WebKit needs system libraries this box doesn't have; I ran it from the `mcr.microsoft.com/playwright:v1.62.1-noble` image instead of installing packages on the production host (Playwright's WebKit build is now in `~/.cache/ms-playwright`). The staging runs left a Game Library import as `coach@nexa.test` on `vps_dev` (the draft puzzle is cleaned up by the spec).
  5. **D5 (#152): stale as expected, fixed, rehearsal PASS on a fresh production dump.** `solo_puzzle_rush_runs` gained its raising default; `schema.patch` rebuilt (applies clean); counts, money, FKs unchanged, rollback drill matches, `migrate diff` to the patched schema empty. Rehearsal databases, container and dump deleted. D5 applied nowhere. **Suggested, not built:** a unit spec that fails when a model still defaults `tenantId` to `"tenant_nexa"` without a matching line in `migration.sql`, or when `schema.patch` stops applying, so CI catches this the day a new academy table lands. Also found: a dangling Docker volume from 2026-11-15 22:03 UTC (`30c02929…`) that may be the previous rehearsal container's Postgres data (its databases were dropped then); not mine, so left. `docker volume rm` it if you agree.
  6. **Tidy-up.** Removed the merged worktrees `academy-v2`, `d5`, `deps`, `docs`, `e2e-fixes`, `solo-rush`. **Left `mutation-toasts`**: its only change is a modified `apps/web/next-env.d.ts` (the rewrite every `next build` makes), but the rule was to keep any worktree with changes. No branch deleted locally or on GitHub. This run's worktrees (`home-v2`, `rush-fen`, `solo-followups`, `webkit-pdf`, `d5-solo`, `night-results`) stay until their PRs are reviewed; `rush-fen` and `solo-followups` hold a copy of `apps/api/.env` (gitignored) for the private stack.
  7. **How I tested a branch that isn't on staging.** API built in the worktree on :3101 and `next dev` on :3100 against `nexa_gen_saas_int` (truncated, seeded, plus 22 fixture mate-in-one puzzles); stopped by PID afterwards. A worktree needs its own `node_modules` whose `@nexa-chess/*` links point at the worktree's packages, or a `packages/types` change is invisible to the apps.
- **2026-11-16 (night run, item 10, `feat/solo-puzzle-rush`): solo Storm / Racer built; what I assumed.** Page `/student/puzzle-rush`, docs [PUZZLE_RUSH_SOLO.md](PUZZLE_RUSH_SOLO.md).
  1. **Who may play: students of a batch with puzzle training on** (the existing `puzzleTrainingEnabled` switch), so no new setting. Say if solo play should be its own switch, or open to coaches.
  2. **Leaderboard = best finished run per student, per batch, per mode**, "this week" or "all time", showing first and last names like the live standings. Students are minors: if names should be shortened to first name + initial, it is one line in `SoloPuzzleRushService.leaderboard`.
  3. **No points, rating or history**: solo runs don't touch the puzzle rating, Smart Revision or the activity history. Say if they should.
  4. **Not done**: live leaderboard push, dashboard badge. Browser-checked 2026-11-16 on a private stack (this branch's API + `next dev`, `_int` database, because staging runs `dev`): login, overview, a Racer run with a mating move, summary, leaderboard row, no overflow at 1280 and 375 px. A full Storm run (3:00, summary, score on the board) and the batch picker with two batches were checked the same way. In that stack's first Storm run only 1 of 2 mates counted: every seeded puzzle had the same start position, so the board never resynced between puzzles; with distinct positions four mates in a row counted 1-4. (Real catalogue puzzles that repeat the previous start FEN would stall the same way; not seen, not fixed.) **Fixed 2026-11-16 night run (`fix/puzzle-rush-same-start-fen`):** the board's `resetKey` is now the puzzle index and ply (`rushBoardKey`), in the solo player and the live-class `RushPlayer` (same bug). Reproduced first on a private stack with two seeded puzzles sharing a start position and setup move (second mate not counted), then both mates counted in Storm and Racer. Catalogue on `vps_dev` (read-only): of 3,740,588 puzzles a run can draw, only 4 pairs share start FEN and setup move (2 pairs within 150 rating points), so a real run practically never hits it. **Checked on staging 2026-11-16** (after the merge into `dev`): login, nav link, batch picker (13 batches), Storm clock waiting at 3:00, a Racer run on real catalogue puzzles (countdown, Skip plays the expected move for no point, summary), own row on the batch leaderboard, no overflow at 1280 or 375 px, no page errors. A finished run that scored 0 still gets a leaderboard row.

- **2026-11-15 night run (its plan file was removed once these results were in; it is in git history as `docs/NIGHT_RUN_2026-11-15.md`): results, and what I assumed.** Item 10 (solo Puzzle Storm / Racer) was not started: it needed the owner's yes in the start message and there wasn't one. PRs, all into `dev`, none merged: #143 error toasts + Tabs a11y, #144 home page v2, #145 e2e fixes + token spec, #146 D5 contract, #147 dependency bumps.
  1. **Staging was down when the run began** (the `nexa-dev` tmux session was gone, `/health` 503, so the first WebKit pass failed 27 tests on login). I relaunched its two windows from the existing builds (no rebuild). Cause unknown; nothing in this run stopped it.
  2. **Error toasts (#143):** 46 mutations got a hook-level toast. Skipped on purpose: callers with their own handling (undo, try/catch, inline error state), the live-class room, the demo form, autosave and mark-read. A few callers may now show an inline message and a toast; say if you'd rather have only one.
  3. **Stale tests (#145):** one more was stale: the redesigned tab strip collapses into a "Choose a tab" menu, `analysis-board` couldn't find its Engine tab (helper fixed, spec passes). WebKit: 37 passed / 2 failed / 2 flaky / 11 skipped. **Not diagnosed:** the PDF diagram import finds no diagram in WebKit (Safari) within 15 s (two tests); it may be a real Safari problem with pdf.js, worth trying on a Mac/iPhone. The tournaments flow and the attendance page are flaky, not broken.
  4. **The skipped board specs ran** on a `NEXT_PUBLIC_E2E=1` build; staging is back on a normal build (build id matches the served one).
  5. **Decided 2026-11-16: swap them.** `/` renders v2 and `/academy` the original page (`feat/home-v2-swap`, night run 2026-11-16); no component, CSS or image deleted. Original note: **Home page v2 (#144), your call needed: should `/` become the v2 page?** I did not switch it and deleted nothing. **The "exact 3D model" assumption:** both pages render the same `HeroStage`, and its lights, key position and mood colours already equal `theme work/scene/`. The pieces are the sculpted CC0 set (`d776f4a8`, made after your reference commit), the glow light is cheaper (`d3f6020b`). I read your words as "the built hero should look like the reference" and changed nothing; if you meant the procedural lathe pieces from `theme work/scene/geometry.ts`, say so, that replaces the sculpted set. Headless Chromium here has no GPU, so the board draws without pieces on both pages there: I could not compare the two by eye. Also assumed: the section artwork sits behind each section faded into its colour (the old page's layout, simplified), testimonials untouched.
  6. **D5 rehearsal (#146):** failed on today's production dump because the contract file was 32 tables behind; fixed, now PASS (details in its README). Whenever D5 is promoted, re-run the rehearsal first, because every new model with a `tenantId` makes the file stale again. D5 was not applied anywhere.
  7. **Dependabot #124 was never recreated** (the `@dependabot recreate` comment did nothing: still the 2026-11-01 commit, 301 commits behind `main`). **#147 applies the same bumps on `dev` and its CI is green** (lint+unit, integration, build). What the bumps broke, for whoever reviews it: (a) the integration tests: the lockfile held two `@nestjs/common` copies (11.2.10 under `apps/api`, 11.2.7 at the root), so `instanceof HttpException` failed and every 4xx became a 500; fixed by re-resolving the four `@nestjs` lock entries to one copy. (b) the build: `pdfjs-dist` 5.7 no longer types `isEvalSupported` (kept through a cast; I can't tell if 5.7 still reads it), and `@livekit/components-core` is now declared in `apps/web` because `ChatProvider` imports it without declaring it. (c) `react`/`react-dom` 19.3.1 are **left out**: the root `overrides` pin them to 19.3.0 and moving both left two Reacts in the lockfile. The lock was regenerated with npm 11.15 (this box has npm 10, which hoists differently). Merging #147 into `dev` is yours; merging it to `main` deploys. Do not merge #124.
  8. **Screenshots and accessibility:** `npm run shots -- --devices all --theme both` (21 devices incl. tablets, light and dark) on staging: 14 admin routes (588 shots), `/student/referrals` (42), `/unsubscribe`, `/watch`, `/certificates/<bad code>` (126): **0 horizontal overflow**. `/academy` on the v2 worktree: 42 shots, 0 overflow. axe (WCAG 2.1 A/AA) on the same 18 routes at phone and desktop, light and dark: 72 runs, 0 page errors, the only criticals were in `Tabs.tsx` (fixed on #143, re-run clean). Home v2 with WebGL off: loads in about 2.3 s, clock shows 55, three.js only logs its own "no WebGL context" console errors; with reduced motion: clock is final at once, no errors. Shots are on the box under `scripts/responsive/shots/night-run-2026-11-15-*` (gitignored). The CI run the plan asked for on Dependabot's own branch (`gh workflow run ci.yml --ref`) fails on the stale tree (the integration suites #147 had to fix, plus no LiveKit on the runner); #147 is the one to look at.

- **2026-11-14 (unattended WhatsApp Phase B/C run, `feat/whatsapp-native-complete`): what I assumed or skipped.**
  1. **D5 was still open; I built option (a)** (the plan's recommendation): fixed flows in code, and on Support → Settings each academy turns main-menu options on/off, reorders and renames them. "Talk to our team" can't be switched off. No flow builder. Change of mind = say so, nothing else depends on it.
  2. **Routing per intent was not built.** With no helpdesk connected, every hand-off has one destination (the Nexa inbox), so a routing table would have nothing to choose. It comes with Phase E (Crisp), which waits on D1.
  3. **Frappe push** (owner 2026-11-15: "Frappe is the sales desk, Nexa is the WhatsApp robot"): website-form leads now go too (source "Website Form"), and a number Frappe already has a lead for (last 90 days) gets a note instead of a twin. The API key exists (Frappe user `nexagen-push@nexachess.in`) and is set on staging. **Production's env was set 2026-11-15** (`FRAPPE_CRM_URL`, key and secret; the key was checked from the API container after the deploy). Still owed: the first real lead reaching Frappe. **Still open:** should a booked demo time set Frappe's status to "Demo Scheduled"? Should a lead Frappe marked lost get a new lead instead of a note? Who should own a copied lead in Frappe? (It arrives unassigned: Sales Managers see it, a plain Sales User doesn't until it is assigned; no Assignment Rule exists.) Connecting the Facebook page for ad-form leads (Frappe → Settings → Lead Syncing) needs the owner's Facebook login. More follow-ups than the bot's one nudge need the owner's texts, timings and (after 24 hours) Meta-approved templates.
  4. **Phase D built in its narrowest form, D8 assumed "link code only"**: there are no parent accounts, so a code shown to a student's own login would let a minor link any number. Instead **only an admin** makes a one-time code for a student (Admin → Users → student → WhatsApp link code) and gives it to a family they have checked; the family sends `LINK <code>`. A linked number can only ask "next class" (time + batch name). Off until Support → Settings → "Answer linked families". Please confirm: is staff-issued OK, should coaches issue codes too, and may the bot later say more (join link, homework, fees due)?
  5. **Phases E/F (Crisp) skipped**: D1 says wait. **Phase G (AI answers) skipped**: needs a decision (plan §12, D12 AI).
  6. **Privacy text**: `features/legal/content.ts` doesn't yet mention that files customers send on WhatsApp are kept (private Cloudinary storage) or that WhatsApp and website-form leads are copied to Frappe CRM (self-hosted, same server). Needs the DPDP review already pending before the bot is switched on.
  7. **Insights history starts 2026-11-14**: hand-off and first-reply figures come from the new `support_conversation_events` table, so older conversations count in volume but not in hand-offs.

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
  10. **WhatsApp per academy:** another academy sends only from its own connected number (super admin sets it on `/admin/whatsapp`; moved off `/admin/branding` 2026-11-15 so plans without `brandIdentity` can reach it); without one WhatsApp is off for it, never Nexa's number. Tokens use a new optional `CREDENTIALS_ENCRYPTION_KEY` (falls back to `MFA_ENCRYPTION_KEY`), so the integration suite doesn't have to switch on required MFA. Message templates must be approved on the academy's own Meta account; nothing checks that yet.
  11. **Brand strings left (5e follow-up):** done 2026-11-05 on `feat/saas-followups` except the two below. `{{academy.name}}` in every message rule and system email, payslip PDFs (author + footer), PGN `Site` / default `Event`, the live-class PiP metadata, Wall of Moments and Video Generator now use the academy's name (`BrandingService.nameFor`, the same name its pages show; Nexa's stays "Nexa Chess"). Product-name copy became neutral ("Our website", "Our own analysis", "Class games", "Purchase"). NexaChess-as-vendor copy (contact the NexaChess team, support visits, content packs, Powered by) stays on purpose. **Still open:** `features/legal/content.ts` (**done 2026-11-15**, owner: each academy writes its own text; Admin → Branding → Legal pages, built-in text until it does, [SAAS_MULTI_TENANCY.md](SAAS_MULTI_TENANCY.md) §F "Legal pages"), and the root layout / `/` metadata and JSON-LD, which stay Nexa's in the server HTML on an academy's `/` (theming is client-side by the Phase 5 builder's call 2; changing it makes those pages dynamic).
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
  10. **Usage counters** (`TenantUsage`) are a nightly snapshot (02:00 UTC) of the plan-limit counts, shown on the console's academy page. Limits are still enforced from live counts. *(2026-11-13: extended with storage, live-class minutes, messages and engine analyses, kept per day in `TenantUsageDay`, with a console Usage tab; analytics only. docs/SAAS_PLANS.md § "Usage history". ~~`StorageSnapshot`'s per-academy rows still hold the whole recordings folder~~ (fixed 2026-11-15: another academy's rows and storage gauge hold only its own recordings). Open: no usage alerts, storage limit or overage billing yet, by the owner's decision.)*
  11. **Not done in Phase 6:** card-on-file auto-debit (v1 excludes it, §G), Cashfree/Stripe for platform billing, per-academy invoice seller details for student invoices beyond what Phase 3 slice 5 already gives, and refunds of platform payments (record them manually; no credit note flow yet).
  12. **Found by the staging browser check and fixed (`fix(web)` after Phase 6):** the Phase 5 host rule only knew `NEXT_PUBLIC_SITE_URL`, which the staging build leaves at its localhost default, so `dev.nexachess.in` was treated as an academy's address (host-only cookie names, `/api`, and a title-rewrite loop that froze the page because Nexa's name contains "Nexa Chess"). Nexa's hosts are now the site host plus the web host paired with the API host (`api-dev.x` -> `dev.x`, `api.x` -> `x`), and the title rewrite never writes an unchanged title. Production (`NEXT_PUBLIC_SITE_URL=https://nexachess.in`) was never affected; nothing is deployed.

- **2026-11-05 (unattended CodeRabbit review), `review/coderabbit-2026-11-05`: findings that need your call** (code fixes for the rest are on that branch):
  1. **Decided 2026-11-14: 45+.** Every section now reads `ACADEMY_COACH_COUNT` from `features/academy/content.ts`. Original note: **Coach count on the home page disagrees with itself.** `SundayTrainingSection` (both `components/` and `v2/`) says "45+ Expert coaches"; `HeroSection` and `StatsSection` say "100+". Which is true? Options: put one number in `features/academy/content.ts` and use it everywhere, or change the Sunday card's metric. Meanwhile: nothing changed (it's a public claim).
  2. **Decided 2026-11-14: left as they are (owner's call).** Original note: **Testimonials (`TestimonialsSection`, both versions) show parent + child names and ages beside Unsplash stock portraits**, under "Real and proud impressions from families". If invented, that's a fake-review risk; if real, publishing a minor's name and age needs recorded parental consent (`legal/content.ts` lists consent as pending) and a stock face beside a real name misleads. Options: replace with verified, consented testimonials (first name + initial, no stock photo), label them illustrative, or hide the section until then. Meanwhile: nothing changed.
  3. **Done 2026-11-14 (the TTL option):** every API process reloads all academies' gateway keys and WhatsApp tokens every 60 s (`reloadAll`, `@Interval(CREDENTIALS_RELOAD_MS)`). It swaps in a whole new map, so a failed read keeps the old keys; the saving process still refreshes at once. A key rotated or switched off elsewhere stops working within a minute. Original note: **Academy gateway and WhatsApp keys are cached per API process** (`GatewayCredentialsService`, `WhatsAppCredentialsService`: loaded at boot, refreshed only on the process that saved them; a turned-off or rotated token keeps working elsewhere). Fine with today's single `nexa_api` process; with replicas or a separate worker, other processes keep old/no keys until a restart (checkout says "no gateway", webhooks fail their signature). Options before scaling out: a 30–60 s TTL reload, or a Redis invalidation message. Meanwhile: nothing changed.
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

