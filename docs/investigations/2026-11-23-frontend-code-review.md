# Frontend code review — 2026-11-23

Scope: `apps/web` and how it uses `packages/types`, on `dev` at `d9dfcd3e`. This was a read-only
review: no code was changed, nothing was built, and nothing was committed. The companion backend
review is [2026-11-23-backend-code-review.md](2026-11-23-backend-code-review.md). Where a web
finding meets a backend one, the backend id (B1, P6, …) is named.

How it was done. `apps/web/src` has about 168,000 lines in 1,319 files, too many to read line by
line in one pass, so two kinds of check were combined:

1. **Rule sweeps across all of `apps/web/src`.** Every CLAUDE.md, `docs/UI_RULES.md` and
   `docs/RESPONSIVE.md` rule that can be searched for was grepped, and each hit was read in context.
   The table at the end lists them.
2. **Close reading of the high-risk paths:** the session and route gate (`middleware.ts`,
   `lib/routeAccess.ts`, `lib/api.ts`, `SessionBootstrap`, the role switch, logout); checkout and
   the gateway handoff; live-room packet handling, board sync and persistence; the student
   assignment attempt; tournament realtime; the backup page.

Areas that only got the rule sweep are marked **(sweep only)**. An empty part means nothing was
found in what was read. It does not mean the area is clean.

Severity: **important** means users can hit a real bug. **minor** means narrow impact or a rule
broken without visible harm today. **nit** is style or convention. Every **important** finding
was re-read against the code before it was listed (✓). **DECISION:** marks a choice the owner
has to make.

---

## 1. Auth, session and routing

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| AU1 | **important** ✓ | `lib/api.ts:79-100` → `middleware.ts:44-48` | A failed **token refresh** signs the user out even when the refresh failed because of the network or a 5xx. `clearSession()` runs on every refresh failure, and `auth:logout` fires whenever a user was in the store. The tab goes to `/login`. The cookies are still valid, so the middleware sends it straight back to the dashboard. The user sees "Session Expired" and loses the page they were on: a live class, a half-solved assignment, a checkout. This breaks the rule `SessionBootstrap.tsx:14` states: "a network blip or 5xx must not sign the user out". The access token expires every few minutes, so on a weak phone connection this happens regularly. | Clear the session and fire `auth:logout` only when the refresh comes back 401/403. For a network error or a 5xx, reject the waiting requests with the error and leave the store alone, so the next request tries the refresh again. |
| AU2 | minor | `features/auth/components/LogoutButton.tsx:34-39` | When the logout request fails, `onSettled` still clears the store and opens `/login`. The cookies are still there, so the middleware redirects back to the dashboard and `SessionBootstrap` restores the session. The user believes they signed out but did not, which matters on a shared or family device. | On error, keep the dialog open and offer a retry ("Couldn't sign you out"). Leave the page only after a successful logout. |
| AU3 | minor | `middleware.ts:52-55`, `features/auth/hooks/useLoginFlow.ts:69` | The redirect to `/login` drops the page the user was going to, and login always lands on the role dashboard. A student who opens a class or checkout link from WhatsApp or email while signed out has to find that page again. | Add `?next=<path>` to the redirect and follow it after login. Accept only a relative path that starts with `/` and not with `//` (no open redirect), and only one `canAccessPath` allows for the role. |
| AU4 | minor — **DECISION:** | `stores/authStore.ts:44` (`partialize: { user }`), `packages/types/src/index.ts:363-373` | The whole `AuthUser` is saved in `localStorage` (`nexa-auth`): email, phone, and for students `dateOfBirth`, `parentName`, `parentEmail`, `parentPhone`. Students are minors. The data stays on the device until the next visit clears it, so a browser closed on a shared computer keeps it. | Persist only what the first paint needs (`id`, `role`, `roles`, `firstName`, `avatarUrl`, `isPlatformOperator`). Read the rest from the `/auth/me` query. **DECISION:** whether minors' profile details may live in browser storage at all; `features/legal/content.ts` should say what is stored. |
| AU5 | minor | `lib/routeAccess.ts:24-53`, `middleware.ts:66-82` | `/live-class/[roomId]` is missing from `ROUTE_RULES` and from the middleware `matcher`. A signed-out visitor gets the room shell and a token request rather than a redirect to `/login`, and the client-side guard doesn't fence a SALES account out. The API still refuses both, so this is a convention gap (CLAUDE §3.5: a protected route needs a `ROUTE_RULES` entry and a `matcher` entry). Demo guests use `/demo/[classId]`, which stays public. | Add `{ prefix: "/live-class", roles: null }` and `"/live-class/:path*"` to the matcher. |
| AU6 | minor | `lib/routeAccess.ts:26,31`, `components/layout/SuperAdminOnly.tsx:17` | `/admin/backups` and `/admin/platform` are fenced by role (`SUPER_ADMIN`) only. Every academy's owner is a SUPER_ADMIN (backend B1), so any owner can open these pages by URL. The nav hides them correctly with `isPlatformOperator` (`navItems.ts:203-204`). Today the backups page **works** for them because of B1. Once B1 is fixed it becomes a page of errors. | Add a `PlatformOperatorOnly` wrapper (checking `user.isPlatformOperator`) and use it on both pages, plus every page whose nav item is `platformOnly`. Fixing B1 is still the real fix. |

Checked and fine: the role switch clears the whole query cache and reloads (`useSwitchRole.ts`).
A change of user drops cached queries (`SessionBootstrap.tsx:72-80`). The middleware reads the
academy's host-only cookies by host, and the legacy cookies only on Nexa's own hosts. MFA and
support-visit 401s are kept out of the refresh path. No page checks the auth cookie itself.

## 2. Data fetching and caching

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| D1 | minor | `app/admin/_components/BackupManager.tsx:52,68,82` | Three hardcoded API paths (`"/admin/backups"`, `/trigger`, `/download?key=`), none of them in `API_ROUTES` (CLAUDE §3.1 / §7.3). The response type is local, data is loaded with `useEffect` + `useState` rather than TanStack Query, and errors show raw text. This is the only file that skips `API_ROUTES`. | Add `API_ROUTES.backups` and response types in `packages/types`, then a `features/backups/api` + hook in the usual pattern. Fix together with AU6 and B1. |
| D2 | minor | `usePaymentsApi.ts:128-133` (`usePaymentStatus`) | Polling stops whenever there's no data (`!data?.pending` → `false`). If the first status request fails (a mobile blip right after the gateway closes), the checkout page never polls again and shows nothing until the user reloads. | Keep polling while `!data \|\| data.pending`, backing off after errors. |
| D3 | minor | `ScheduleBuilderClient.tsx:58`, `DailyPuzzleAdminClient.tsx:11`, `KnowledgeArticleEditorClient.tsx:217`, `knowledge/components/admin/PreviewPanel.tsx:29`, `FeedbackFormEditor.tsx:77` | Batch pickers load `pageSize: 100` and show that list as if it were all of them. An academy with more than 100 batches can't pick the 101st and isn't told. CLAUDE §3.5 says "never a silent `take: N` cap". | Use a searchable `Combobox` backed by the server's `search`. At minimum, show "first 100 shown, type to search". |
| D4 | minor | 68 call sites, e.g. `CheckoutClient.tsx:156,205`, `DiscountField.tsx:61`, `ChaptersPanel.tsx:110,143,195`, `TopicManager.tsx:588,859`, `PuzzleImportDialog.tsx:150`, `SupportInsightsClient.tsx:88`, `BackupManager.tsx:76` | Toasts and inline errors show `(error as Error).message` directly. A 5xx or a driver message reaches the user word for word. `getErrorMessage` (`lib/errors.ts`) exists to turn these into plain sentences (UI_RULES §5). | Replace them all with `getErrorMessage(error)`. A lint rule (no `.message` inside `toast.*(` arguments) would keep it that way. |
| D5 | nit | `useTournaments.ts:15,19,22,121`, `TournamentPageClient.tsx:236,591-593`, `ManageClient.tsx:532,650-651`, `useTournamentRealtime.ts:43`, `useActivityQueue.ts:83`, `TenantBrandProvider.tsx:64` + `useBranding.ts:36` | Query keys written as literal arrays rather than built from `lib/queryKeys.ts`. Each one matches the builder today (checked), so nothing is broken. But renaming a key would silently stop these invalidations. `["tenant","public-config"]` has no builder at all. | Add prefix builders (`tournaments.standingsAll(id)`, `gamesAll(id)`, `activityQueues.all(classId)`, `tenant.publicConfig`) and use them. |

Checked and fine: with one exception, every `apiFetch` path comes from `API_ROUTES`. The raw
`fetch` calls (keepalive saves, the engine stream, the recorder) all build URLs from `API_ROUTES`
+ `apiBaseUrl()`. The engine stream falls back to the axios call, which handles 401 → refresh.
Chat and presence polls are bounded and stop on hidden tabs where they should.

## 3. Forms and validation

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| F1 | minor | `features/assignments/components/AssignmentFormDialog.tsx:290,381-455` | The largest form in the app (941 lines) has no schema. It checks a few required fields by hand on submit and nothing else: title length, time limit range and description length aren't mirrored from the API DTO. Bad values come back as a server error toast instead of a message under the field. UI_RULES §5 says client limits mirror the API's schema. | Build a Zod schema from the shared assignment types and use `zodResolver`. Keep the hand checks that depend on the activity type as a `superRefine`. |
| F2 | minor | `features/daily-puzzle/components/DailyPuzzleScheduleManager.tsx:324` | `useForm` without `mode`, so errors appear only on submit, not after leaving the field (UI_RULES §5: `mode: "onTouched"`). | Add `mode: "onTouched"`. |
| F3 | minor (sweep only) | 19 files with a `<form>` but no `noValidate`, e.g. `auth/components/ProfileForm.tsx`, `payments/components/GatewayKeysPanel.tsx`, `admin/components/demo-classes/DemoScheduleFormDialog.tsx`, `platform/components/AcademyDomainsCard.tsx`, `branding/components/WhatsAppConnectionClient.tsx`, `tournaments/components/ReasonDialog.tsx`, `tournaments/components/StudioClient.tsx` | Where these fields have `required` or `type="email"`, the browser's own bubble appears instead of `FieldError` (UI_RULES §5: "Forms are `noValidate`"). The room's chat and timer forms are on the list too; they have no constraints, so nothing shows there. | Add `noValidate` to each. Optional: a lint rule for `<form` without it. |

## 4. Live class

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| L1 | minor | `features/live-class/api/live-class.ts:70-79` (`saveBoardStateOnUnload`), `features/live-captions/api/transcriptApi.ts:15-23` | The last save before the page unloads uses `fetch(..., { keepalive: true })`. Browsers cap keepalive bodies at **64 KB in total**. A long class's board state (the whole move tree with variations and comments) can pass that, and the browser then refuses the request. The `.catch` hides it, so the coach's last moves are lost without a trace. *Plausible: the size limit wasn't measured on a real class.* | Measure `JSON.stringify(state).length`. Above about 60 KB, skip keepalive and rely on the regular debounced `PUT` (flush it on `visibilitychange` → hidden, which fires before unload). Log oversize cases to Sentry with the size only. |
| L2 | minor (rule) | `features/chessboard/hooks/useBoardSync.ts:521-524` | Board persistence takes the class id from `useParams().roomId`, which CLAUDE §3.7 forbids. Nothing breaks today (the coach writes from `/live-class/[roomId]`, and demo guests don't read), but on any route without `roomId` (`/demo/[classId]`) persistence silently turns off. | `useRoomClassId()` (or pass `classId` in from the provider). |

Checked and fine: every `useDataChannel` receiver on an API-only topic drops packets that have a
sender (13 receivers). Board sync trusts a peer only when its LiveKit metadata says `COACH`, and
students can't rewrite their metadata (`deriveLiveKitGrants` → `canUpdateOwnMetadata: false`). The
per-call `mutate(…, { onSuccess })` uses in the room only close dialogs or clear inputs, never
follow-up work. `MeetingParticipants` uses the plain `useParticipants()` because it shows mute
state, which needs track events. `ChessgroundBoard`'s `useLocalParticipant` only runs inside the
room (`BoardWorkspace` is only mounted on `/live-class/[roomId]/board`).

## 5. Payments and billing

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| P1 | **important** ✓ | `features/payments/components/CheckoutClient.tsx:236-239` (label at `:382`), `DiscountField.tsx:53-54` | The checkout screen works out tax and total itself (`percentOf(discountedSubtotal, taxPercent)`) and prints "Pay ₹X securely" from that. The API already sends the real figures: `CheckoutConfigResponse.taxAmount/total`, and `ApplyDiscountResponse.subtotal/taxAmount/total`, whose comment reads "so the screen never does the maths". `DiscountField` passes only `result.discount` up and drops those totals. Since `16795a6f` (review P4), the server's tax comes from the invoice engine (`priceForUser` → `invoices.taxFor`), which can round per component or change with the buyer's billing profile. So the button can show a different amount from what the gateway charges. This also breaks CLAUDE §3.6g ("tax only via the shared engine"). | Show `config.taxAmount` and `config.total` when no code is applied. When a code is applied, keep the preview's `{ subtotal, discountAmount, taxAmount, total }` in state (change `onApply` to pass the whole result). Remove `percentOf` from the screen. |
| P2 | **important** ✓ — **DECISION:** | `features/payments/lib/checkoutKey.ts:18`, `CheckoutClient.tsx:68,112` → API `payment.service.ts:308-321`, `:1347-1353` | The idempotency key is per **plan** only, and stays for the whole tab session. Once an order exists, the API replays it by key and opens new attempts with `appliedFromOrder(order)`, so it never reads the `discountCode` (or a changed method) sent with the request. Scenario: the student opens Razorpay, closes it to find a code, the attempt expires or fails, they apply the code, the button now says "Pay ₹800". The gateway opens for ₹1,000, and the screen then quietly drops the discount line (`setDiscount(session.discount)`). The only way out is a new browser session. | Web: make the key cover the intent, i.e. `planId + method + code`, so a changed code opens a new order. Server: refuse a replay whose code differs from the order's with a 409 the screen understands, rather than silently charging the old price. **DECISION:** whether a second unpaid order for the same plan may exist while the first is open. This interacts with backend P6 and P8 (one attempt in flight per order; a limited code reserved per open order). |
| P3 | **important** ✓ | `CheckoutClient.tsx:131-135` vs `:180-185`, `lib/gatewayHandoff.ts:90` | The first payment attempt opens Razorpay without `merchantName`, so the sheet's title falls back to **"NexaChess"** for every academy. Only the retry path passes `brandName`. An academy's students see another company's name on the payment sheet, which breaks the rule in `gatewayHandoff.ts:89` ("the academy being paid, never the platform (§F)") and costs trust at the moment of paying. | Pass `merchantName: brandName` in `handlePay` as well. Better: make the option required, so a future call can't forget it. |

Checked and fine: the screen never decides that a payment succeeded. It verifies on the server
and renders what the server says. A payment already in flight is picked up after a refresh.
Gateway scripts load from the CSP-listed hosts only (`next.config.mjs:41-55`). The UPI QR shows the
amount the server charged (`qrAmount`).

## 6. Admin (sweep only, plus the backup page)

No admin-only findings beyond D1 (backup page), D3 (batch pickers) and AU6 (platform-only
pages fenced by role). The admin tables that were opened use `DataTable`/`useServerTable`, and no
raw `<table>` or native date input remains in admin code.

## 7. Coach (sweep only)

No coach-only findings. Coach screens share the live-room code (part 4) and the batch pickers
(D3).

## 8. Student

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| S1 | minor | `features/assignments/components/activities/EvaluatedActivity.tsx:162-171`, `:174-189` | Progress is saved 700 ms after the last move, but `doSubmit` doesn't cancel that timer, and nothing cancels it on unmount. A move followed quickly by Submit sends the progress save **after** the submit, against a submitted attempt. The API refuses it and the `.catch` swallows that, but it's a wasted request, and in the worst case it fails a check the server makes after submit. Leaving the page within 700 ms also sends a save from an unmounted component. | Clear `saveTimer` at the start of `doSubmit` and in an unmount cleanup. |
| S2 | minor | `EvaluatedActivity.tsx:249,272,499,517,524` | `void doSubmit(...)` leaves a failed submit as an unhandled rejection. The hook's `onError` already shows the toast, so each failure is also reported to Sentry as a separate `unhandledrejection` with no user meaning. | `try/catch` inside `doSubmit` (the toast is already shown). |

Note: the backend review's S1–S4 (solve-the-line answers sent with the assignment, engine moves
from client FENs, client-reported scores) are server fixes. The web page renders what it's given
and needs no change of its own for them.

## 9. Tournaments

No tournament-only findings beyond D5 (literal query keys) and U1 (the move list scrolls the
page). Realtime drops packets that have a sender, keeps REST as the source of truth, and polls
faster without LiveKit. The `/watch` pages poll at 4–15 s per anonymous viewer when LiveKit is
off, which is fine at today's audience.

## 10. Shared UI and accessibility

| # | Severity | Where | Problem | Fix |
|---|---|---|---|---|
| U1 | minor (verify with `npm run shots`) | `features/chessboard/components/panels/MoveTreeView.tsx:94`, `features/tournaments/components/GameBoardPanel.tsx:144` | Both follow the current move with `scrollIntoView`, which RESPONSIVE §7 rule 12 forbids because it scrolls every ancestor. On a phone, where the move list sits below the board, each move made or received can jump the page down to the list. That affects the Game Library viewer, the `/chess-board` sidebar, and a spectator watching a live tournament game. (`SetupPositionWorkspace.tsx:109` is a one-time scroll on opening and is fine.) | Scroll the list's own box: set `scrollTop`, or use a `scrollToChild(list, item)` helper the way `MeetingChat.tsx` and `SimulMoveList.tsx` already do. |
| U2 | minor | `features/live-class/components/meeting/MiniPlayer.tsx:126-145` | `title=` used as the tooltip on two plain buttons (not Radix triggers). Touch users never see it (UI_RULES §3 / RESPONSIVE rule 7). | `SimpleTooltip`. |
| U3 | nit | `ActivityQueueProgressGrid.tsx:50`, `puzzle-rush/RushParts.tsx:192`, `academy/components/DemoBookingSection.tsx:381` | Raw `<table>` (two) and raw `<select>` (one, on the marketing page's demo form) outside `components/ui`. | `Table` / `Select`. |
| U4 | nit | `components/ui/KpiCard.tsx:27-29`, `features/analytics/lib/format.ts:11,21` | `toLocaleString()` with no locale, so digit grouping follows the browser (1,00,000 or 100,000) and the same number reads differently on two screens. Other screens fix `en-IN`. | One shared number formatter with a fixed locale. |
| U5 | nit | `features/live-class/components/EndClassButton.tsx:56` | Cancel is `variant="outline"`. UI_RULES §3 says the negative half of a confirm pair is `neutral`. | `variant="neutral"`. |
| U6 | nit | `features/live-class/components/meeting/SetupPositionControl.tsx:29` | A 20 px (`size-5`) icon button, well under the 44 px touch target. | Make the hit area larger (padding or a `::before`) and keep the visual small. |

Checked and fine: no `window.confirm`, no `Loader2`, no native date/time inputs, no
`next/font/google`, no `vh` units, no `Chess` from `chess.js` outside `lib/chess.ts` (two
type-only imports remain: `createBoardStore.ts:2` `Move`, `PracticeBoard.tsx:8` `Square`).
`dangerouslySetInnerHTML` is only used for the font CSS, the theme init script and JSON-LD.
`toLocale*` in components is limited to number formatting. There are 205 raw `<button>` elements
outside `components/ui`, mostly room chips and board controls; they weren't checked one by one.

## 11. Performance

No findings. LiveKit is only imported by the room, the live monitor and tournament realtime.
three.js loads as a separate chunk after the hero is on screen (`HeroStage.tsx` → `import("./scene")`).
Gateway SDKs load on demand. Ten `page.tsx` files are `"use client"`, all of them the room,
attendance and class pages that need it. Possible follow-up: a bundle analysis
(`@next/bundle-analyzer`) wasn't run, because it needs a build and this checkout serves staging.

---

## Rule sweeps (whole `apps/web/src`)

| Rule | Check | Result |
|---|---|---|
| CLAUDE §3.1 no hardcoded API path | `apiFetch("…` / raw `fetch(` | 1 file (D1). OK otherwise |
| §3.5 query keys from `queryKeys.ts` | `queryKey: [` literals | 24 hits: 12 spread a builder, 12 literal (D5) |
| §3.5 no silent list cap | `pageSize\|limit: ≥100` | 5 batch pickers (D3) |
| §3.5 every protected route in `ROUTE_RULES` + matcher | top-level `app/` dirs vs rules | `/live-class` missing (AU5) |
| §3.6 never `window.confirm` | grep | 0 |
| §3.6 dates never `toLocale*` in a component | grep | Only number formatting (U4) |
| §3.6j never `next/font/google` | grep | 0 |
| §3.7 room code never `useParams().roomId` | grep | 1 (L2) |
| §3.7 API-only topics drop packets with a sender | each `useDataChannel` receiver | 13/13 OK |
| §4 `Chess` never from `chess.js` | grep | Wrapper + 2 type imports. OK |
| UI_RULES: no raw table/select/date input | grep | 2 tables, 1 select (U3); 0 date inputs |
| UI_RULES: no `title=` tooltip on interactive elements | grep | 2 plain buttons (U2); the rest are Radix triggers, which are allowed |
| UI_RULES §5: `getErrorMessage` for errors | `as Error).message` | 68 hits (D4) |
| UI_RULES §5: forms `noValidate`, `mode: "onTouched"` | grep | F2, F3 |
| RESPONSIVE rule 5: `dvh` not `vh` | grep `[0-9]vh` | 0 |
| RESPONSIVE rule 12: no `scrollIntoView` to follow a list | grep | 2 (U1) |
| CSP lists every third-party host used | gateway, Lichess, Sentry, Meta hosts in `next.config.mjs` | OK |

## Checks run

On `dev` at `d9dfcd3e`, read-only. The backend session was committing in the same checkout;
none of its files were touched.

- `npm run typecheck -w apps/web`: passed, no errors.
- `npm run lint -w apps/web`: passed, 0 errors, 1 warning (`<img>` in
  `features/academy/components/TestimonialsSection.tsx:159`).
- `npm run build`, `npm run shots` and Playwright: **not run** (the build would replace the
  staging `.next`). U1 and L1 should be confirmed with `npm run shots` or a measured board state
  before they are fixed.

## Suggested order

1. **P3** (one line, every academy's checkout) and **P1** (the shown price can differ from the charge since `16795a6f`).
2. **AU1**: phone users get signed out mid-class on a network blip.
3. **P2**, after the owner decides on open orders; do it together with backend P6/P8.
4. **AU6 + D1**, together with backend B1.
5. Then the minor items: D2, D3, AU2, AU4 (decision), L1, U1, S1, F1. The nits can go in one cleanup PR.
