# Tournaments — implementation assessment and plan

Status: **assessment only — nothing below is built yet** (2026-11-09).
Branch: `claude/nexachess-tournament-platform-sjutfe`.

Goal: a server-authoritative tournament platform (Swiss, Arena, Round Robin,
Knockout) with live games, host commentary, spectators, standings, history and
notifications, built on the systems NexaChess already has. Lichess is the
product-quality reference only; no code or assets are copied.

---

## 1. What already exists (audit)

| Area | What is there | Reuse for tournaments |
|---|---|---|
| **Student-vs-student games** | `apps/api/src/student-match/live-class-match.service.ts` (848 lines) + `LiveClassMatchRound/Game/Challenge` models. REST move route; validation through the `common/chess/chess` wrapper; **ply-filtered `updateMany` claim** (409 on a lost race); clocks stored as "remaining ms at `turnSince`", increment applied after `MATCH_CLOCK_START_PLY`; resign, draw offer/accept, timeout claim (with insufficient-material check), coach adjudicate/abort; end detection (mate, stalemate, threefold, 50-move, insufficient material). | **The game engine.** Same lifecycle and the same concurrency guard. It is currently private methods inside a class-bound service, so it has to be extracted (Phase 0). |
| **Shared match contract** | `packages/types/src/live-class-match.ts`: `matchTimeControlSchema`, `matchEndReasonSchema`, `matchClockRemaining`, `LIVE_CLASS_MATCH_TOPIC`. | Clock maths and enums are reused; the tournament contract gets its own file. |
| **Match UI** | `features/live-class/components/meeting/match/` (`MatchStudentView`, `MatchCoachView`, `MatchClock`), `providers/MatchProvider.tsx`, `hooks/useLiveMatch.ts`. | Clock, player strip and move-sending logic reused. Not reusable as-is because it is built into the room (`useRoomClassId`). |
| **Chessboard** | `features/chessboard/components/board/ChessgroundBoard.tsx`, `ReadOnlySyncedBoard.tsx`, `BoardFrame.tsx`; `useChessAppearance()` (required on every board). | The play board and the spectator mini-boards. |
| **Simul** | `simul/live-class-simul.service.ts`: coach against many boards. | A model for the "monitor many boards" grid. |
| **Real-time** | No WebSocket/SSE gateway anywhere. The live class uses **LiveKit data packets** as server-injected nudges (`LiveKitService.broadcastData`, with optional `destinationIdentities`), with REST as the source of truth. A receive-only hidden token already exists (`generateSpectatorToken`: no publish, no data). The rest of the app **polls** with TanStack `refetchInterval` (45 places, e.g. chat). | Same pattern: REST is authoritative and LiveKit carries nudges (§4). Polling is the fallback when LiveKit is off. |
| **Game Library** | `ChessGame` + `GameRecorderService` (idempotent on `sourceKey`, `sourceRevision` only grows). Sources: `LIVE_BOARD`, `SIMUL`, `MATCH`, `IMPORT`. | Replayable archived games: add source `TOURNAMENT`, key `tournament:<gameId>`. Game analysis (finished games only) then works on tournament games. |
| **Auth / roles** | `UserRole`: SUPER_ADMIN, ADMIN, COACH, STUDENT, SALES. Token-string auth (`authenticateUser`), no guards; `assertCanX` / `getXVisibilityWhere` pattern; approvals in `approval/handlers/`. | No "tournament host" role exists. Hosts become **per-tournament grants** (§3.2), not a new `UserRole`. |
| **Multi-tenancy** | Every non-platform model has `tenantId`, filtered by the Prisma extension; background work uses `runInTenant`. | Tournaments are per academy. Cross-academy tournaments are an open question (§9). |
| **Plans** | `platform-plans.ts` features, enforced by `FeatureGateGuard` + `@RequireFeature`; refusals are 402. | New feature key `tournaments`, required by its routes, added to Enterprise by migration. |
| **Profiles / ratings** | `StudentProfile.dateOfBirth`, `chessRating` (typed in by hand), `fideId`, `experienceLevel`. Puzzle ratings only (`PuzzleRatingChange`). **No game rating system. No gender field.** | Seeding uses a rating snapshot taken at registration. Age groups come from `dateOfBirth`. Gender filtering needs a new field and an owner decision (§9). |
| **Notifications** | `NotificationService.notify/notifyMany` (with `dedupeKey`), `MessagingDispatchService` (configurable rules across email, WhatsApp and in-app), `SystemNotifier` (fixed messages). | New `NotificationType` + `MessagingEvent` values (Phase 8). |
| **Jobs** | `@nestjs/schedule` crons with `JobLockService.runExclusive`; BullMQ is optional (a no-op without Redis). | Flag sweeper, arena pairing tick, round scheduler, "starting soon" reminders. |
| **Uploads** | Cloudinary upload module; branding checks image magic bytes. | Banner and logo. |
| **Payments** | `PaymentService`, `Entitlement`, integer minor units. | Optional entry fees (Phase 2b, gated). |
| **Audit** | Per-domain audit tables (`TrashAuditLog`, `InvoiceAuditLog`, `PlatformAuditLog`). | A new append-only `TournamentAuditLog`. |

Nothing named "tournament" exists in the API, web, types or schema today (the
only matches are marketing copy on the academy landing pages). Per CLAUDE.md
§3.0 there is no half-built backend to recover.

---

## 2. What is missing

Everything tournament-specific: the domain models, pairing engines (all four
formats), standings and tiebreaks, round scheduling, the tournament real-time
channel, spectator delay, host and commentary tools, discovery, registration
and eligibility, the history archive, tournament notifications, and every
screen. There is also no game rating, so performance rating is an estimate
from seed ratings.

---

## 3. Domain design

### 3.1 Database (new models, all with `tenantId`, all with a `PrismaService` getter)

Scores are stored as **integer half-points** (`2` = 1 point), so no floats are
ever involved. Arena points are plain integers.

- **`Tournament`**: `slug`, `name`, `description`, `bannerUrl`, `logoUrl`,
  `format` (SWISS | ARENA | ROUND_ROBIN | KNOCKOUT), `status` (DRAFT →
  SCHEDULED → REGISTRATION_OPEN → REGISTRATION_CLOSED → LIVE ⇄ PAUSED →
  COMPLETED | CANCELLED), `visibility` (PUBLIC | PRIVATE | INVITATION_ONLY),
  `startsAt`, `registrationOpensAt`, `registrationClosesAt`,
  `lateRegistrationUntilRound`, `minPlayers`, `maxPlayers`, `eligibilityJson`
  (Zod: age-group set + cutoff date, rating range, experience levels, batch
  ids), `rulesText`, `prizesText`, `entryFeeMinor` + `currency`,
  `clockInitialMs`, `clockIncrementMs`, `startFen`, `rounds`, `roundBreakSec`,
  `arenaDurationMin`, `arenaConfigJson` (win/draw points, streaks, berserk),
  `knockoutConfigJson` (games per match, tiebreak game, armageddon),
  `tiebreakOrder`, `spectatorDelaySec`, `resultsPublishedAt`,
  `createdById`, `version` (optimistic concurrency for edits), `deletedAt`.
  **Soft-deletable** (Trash 7-step checklist), deletable only in DRAFT or
  CANCELLED. Indexes: `(tenantId, status, startsAt)`, unique
  `(tenantId, slug)`.
- **`TournamentHost`**: `(tournamentId, userId, role: HOST | CO_HOST | COMMENTATOR)`, unique pair.
- **`TournamentPlayer`** (registration + live status): `status` (INVITED |
  PENDING | APPROVED | REJECTED | WITHDRAWN | DISQUALIFIED), `seedRating`
  (snapshot), `seedNumber`, `registeredById` (self or admin), `withdrawnAt`,
  `pausedAt` (arena "leave pool"), `eliminatedAt` (knockout), `ageGroup`
  snapshot. **Unique `(tournamentId, userId)`** prevents duplicate
  registration.
- **`TournamentRound`**: `number`, `status` (PENDING | PAIRED | ONGOING |
  COMPLETED), `scheduledAt`, `pairedAt`, `completedAt`; unique
  `(tournamentId, number)`. Arena has no rounds.
- **`TournamentGame`**: the game row, with the same fields as
  `LiveClassMatchGame` (`fen`, `movesJson`, `ply`, clocks, `turnSince`,
  `status`, `result`, `endReason`, `drawOfferedBy`, `finishedAt`) plus
  `roundId?`, `knockoutMatchId?`, `boardNumber`, `berserkWhite/Black`,
  `isBye`, `byeKind` (FULL | HALF | ZERO | PAIRING), `forfeit`,
  `firstMoveDeadline`, and `moveTimesJson` (server timestamps per ply, used by
  spectator delay and fair-play statistics). Unique `(roundId, whiteId)` and
  `(roundId, blackId)` plus a CHECK `whiteId <> blackId`, so a player cannot
  be paired twice in a round. A partial unique index on ONGOING games per
  player makes it impossible to have two live games at once. Flag-sweeper
  index: `(status, turnSince)`.
- **`TournamentKnockoutMatch`**: `bracketRound`, `slot`, `playerAId`,
  `playerBId`, `winnerId`, `nextMatchId`, `nextSlot`, `status`.
- **`TournamentStanding`**: a cached row per player (`points`, `played`,
  `wins`, `draws`, `losses`, `streak`, `tiebreaksJson`, `rank`, `performance`),
  **rewritten in the same transaction as every result**. It is a read cache
  only and can always be recomputed from games (an admin "recompute" action
  plus a spec asserting they are equal).
- **`TournamentCommentary`**: `type` (GENERAL | GAME | PLAYER | ROUND |
  ANNOUNCEMENT | FEATURED_ANALYSIS | EMERGENCY), `body` (FormattedText),
  `gameId?`, `playerId?`, `fen?`, `ply?`, `pinnedAt`, `authorId`,
  `hiddenAt` / `hiddenById` / `hiddenReason` (moderation hides the message; it
  does not go through Trash), and `clientId` (idempotent send, unique
  `(authorId, clientId)`). Indexed by `(tournamentId, createdAt)`.
- **`TournamentFeature`** (or columns on Tournament): `featuredGameId`, `featuredPlayerId`.
- **`TournamentAuditLog`**: append-only (`action`, `actorId`, `targetType/Id`,
  `beforeJson`, `afterJson`, `reason`). It records every sensitive action:
  start, pause, resume, pairing generation, forfeit, result correction,
  disqualification, host grants, commentary moderation, publishing results.
- **`ChessGameSource.TOURNAMENT`** (enum add), archived through `GameRecorderService`.
- **Privacy**: tournament players, games, commentary and audit rows go in the
  privacy export. `features/legal/content.ts` gets reviewed.

All migrations are additive, named after the latest folder
(`20261107130309_…`), and created with `db:migrate:dev`.

### 3.2 Permissions

| Action | Who |
|---|---|
| Create or edit a tournament | ADMIN, SUPER_ADMIN of the academy. *Proposed:* a COACH may create a DRAFT, and publishing it is an approval request (`approval/handlers/tournament-publish`), in line with the permission plan. |
| Run a tournament (start, pause, pair, forfeit, correct a result, end, publish) | Admins, plus `TournamentHost` rows with role HOST or CO_HOST |
| Publish official commentary | HOST, CO_HOST, COMMENTATOR, admins |
| Moderate commentary, grant or revoke hosts | Admins, plus HOST for their own tournament (CO_HOST and COMMENTATOR cannot) |
| Register | STUDENT in the academy who passes `checkEligibility`; admins can register on someone's behalf |
| Spectate | Any signed-in academy member for PUBLIC tournaments; PRIVATE and INVITATION_ONLY only for players, hosts and admins |
| Play a move | Only the side to move in that game, checked on the server against the game row |

The checks are `assertCanManageTournament(user, tournament)`,
`assertCanComment(...)` and `getTournamentVisibilityWhere(user)`. Every route
takes the token-string auth pattern, gets a row in the access suites, and gets
a row in `cross-user-access.int-spec.ts`.

### 3.3 Server-authoritative game engine (Phase 0 refactor)

Extract the pure parts of `LiveClassMatchService` into
`apps/api/src/common/chess/game-engine.ts`:

- `applyMove(state, uci, now)` → new FEN, SAN, clocks and an end condition, or an error
- `timeoutOutcome`, `hasMatingMaterial`, `outcomeAfter`
- `remainingFor`

Both `student-match` and `tournament` call it. The existing match spec must
stay green, and the engine gets its own exhaustive spec. Persistence stays in
each service (each has its own table and its own claim).

Tournament-only rules:

- **First-move timer**: a game is aborted, or forfeited by the absent player,
  if they do not move before `firstMoveDeadline`.
- **Flag sweeper**: a cron under `JobLockService.runExclusive` every 2–5 s
  finishes games whose side to move has run out of time. A lazy claim on any
  move or action does the same. This is needed because a player who
  disappears never sends the claim.
- **Opponent-gone claim**: if the opponent is absent (presence module) for N
  seconds, the player may claim a win or a draw.
- **Draw offers**: the same as in matches. An offer expires when the offering
  side moves.
- **Results come only from the engine, or from an audited host action**
  (forfeit, correction or adjudication, with a reason). No client ever sends a
  score.

### 3.4 Result processing (one funnel)

`TournamentResultService.finishGame(tx, gameId, outcome, source)`:

1. Claims the game with `updateMany({ where: { id, status: ONGOING, ply } })`.
   If count is 0, another process already finished it, so it returns
   (idempotent; concurrent completions are safe).
2. Writes the result.
3. Recomputes that tournament's standings under `pg_advisory_xact_lock(hash(tournamentId))`.
4. For knockout, advances the bracket. For round formats, marks the round
   COMPLETED when it is the last game of the round.
5. Writes outbox rows for the nudge, the Game Library archive and
   notifications.

After commit: the LiveKit nudge, `GameRecorderService.record` (already
idempotent) and notifications run. A failure there never touches the result.

---

## 4. Real-time design

**Recommendation: one LiveKit data-only room per tournament (`tournament-<id>`),
with nudges only and REST as the source of truth**, the same pattern the live
class uses. No new infrastructure.

- Every viewer gets a hidden, receive-only token (the
  `generateSpectatorToken` shape: no publish, **no data grant**), so clients
  can never put packets on the wire. Moves go through REST.
- Packets are server-injected only, so receivers drop anything with a `from`
  (CLAUDE.md §3.7).
- Topics:
  - `tournament_state`: `{ version }`. Clients refetch the
    snapshot when `version` changes. It covers standings, pairings, round
    status and the featured game.
  - `tournament_game`: the move itself, `{ gameId, ply, uci, clocks }`, sent
    only to the two players and to hosts (`destinationIdentities`), so the
    players' own boards update without delay.
  - `tournament_spectate`: `{ gameId, ply, visibleAt }`. Spectators fetch at
    or after `visibleAt`. **The delay is enforced on the server**: the
    spectator endpoint returns only the moves whose `moveTimesJson` timestamp
    is older than `spectatorDelaySec`. Spectators therefore never receive live
    moves, even by calling the API directly.
  - `tournament_commentary`: `{ id }`, then the client refetches the feed (cursor-paged).
- **Fallback**: when LiveKit is not configured or the connection drops,
  the same hooks poll with `refetchInterval` (2 s for the player's own game,
  5 s for the snapshot). On reconnect, a fresh snapshot is fetched, so there is
  no client-side state to repair.
- **Scale**: the spectator snapshot is cached in memory per
  `(tournamentId, version)` for about 1 s, so 500 spectators refetching at
  once cost one query. LiveKit handles the packet fan-out. The move route gets
  its own `@Throttle` budget (bullet chess can go over 100 requests a minute),
  and the spectator endpoints get a separate one.

The alternative is an SSE endpoint (`@Sse`) on the API. It is simpler for
anonymous viewers, but it holds a Node connection per viewer on the single API
box and duplicates a fan-out system we already run. It is rejected unless
anonymous public spectating is wanted (§9).

---

## 5. Pairing engines (pure modules, `apps/api/src/tournament/pairing/`)

Each engine is a pure function `(players, history, config) → pairings`, with no
Prisma access. The service calls it inside a transaction that locks the
tournament row, checks that the round is still PENDING, and inserts the
pairings. The unique indexes are the final guard.

- **Swiss** (`swiss.ts`): score groups, then a **minimum-cost perfect
  matching** (Edmonds blossom, implemented in TypeScript) over a cost
  function:
  - a repeat opponent is forbidden (infinite cost), and is only relaxed when
    no repeat-free matching exists, which gets logged
  - score difference and floater handling
  - top-half vs bottom-half rank distance (Dutch-like)
  - colour balance (no 3 in a row of the same colour, and no colour
    difference above 2)
  - **Byes**: for an odd number of players, the lowest-ranked player without a
    previous bye gets a configurable bye (1 point by default). Requested
    half-point byes and withdrawals are excluded before pairing.
  - Round 1 pairs seed `1 vs n/2+1`, and so on.
  - This is "FIDE-Dutch-inspired", not certified FIDE Dutch (risk in §8).
- **Arena** (`arena.ts`): a waiting pool of players who are free. A pairing
  tick (cron, about 2 s, under the job lock, plus a nudge when a game ends)
  pairs waiting players who are close in current rank, avoids an immediate
  rematch, and alternates colours.
  - Scoring: win 2, draw 1, loss 0. On a streak (two wins in a row) points are
    doubled until the next non-win.
  - Berserk halves your clock and gives +1 for a win with at least 7 moves.
  - Draws in under 10 moves score 0.
  - Joining closes at end − X. At the end, ongoing games finish and count
    (configurable).
- **Round robin** (`round-robin.ts`): Berger tables using the circle method.
  An odd count gets a dummy player (a bye). Double round robin is optional,
  with colours swapped.
- **Knockout** (`knockout.ts`): the bracket is the next power of two, seeded
  1 vs N. Byes go to the top seeds. A match is best of N games with
  alternating colours. A level match goes to a tiebreak game, then an optional
  armageddon game. The winner advances automatically in the result
  transaction.
- **Tiebreaks** (`tiebreaks.ts`): Buchholz, Buchholz cut-1, median Buchholz,
  Sonneborn-Berger, direct encounter, number of wins, progressive score, and
  performance rating (from seed ratings, FIDE dp table). Each tournament stores
  its tiebreak order.

Tests: table-driven fixtures for every engine, plus **property tests**
(randomized 2–200 players, 1–11 rounds, random results and withdrawals) that
assert the invariants: nobody is paired twice in a round, no repeat while one
is avoidable, at most one bye per player, a round robin is complete with every
pair exactly once, the bracket always produces exactly one champion, and
cached standings equal recomputed standings.

---

## 6. APIs (all in `API_ROUTES.tournaments` + `packages/types/src/tournaments.ts` first)

| Group | Routes |
|---|---|
| Discovery | `GET /tournaments` (status tabs: upcoming, live, completed, cancelled; paged), `GET /tournaments/:id` |
| Admin / host | `POST /tournaments`, `PATCH /tournaments/:id` (versioned), `DELETE` (soft), `POST /tournaments/:id/{publish,start,pause,resume,end,cancel,publish-results}`, `POST /tournaments/:id/rounds/next` (pair and start), `PUT /tournaments/:id/hosts`, banner and logo upload (multipart) |
| Registration | `POST /tournaments/:id/registration` (self), `DELETE` (withdraw before deadline), `POST /tournaments/:id/players` (admin add), `PATCH /tournaments/:id/players/:playerId` (approve, reject, disqualify), `POST /tournaments/:id/invitations` + `POST .../invitations/:inviteId/accept`, `GET /tournaments/:id/eligibility` (dry run for the current user) |
| Live | `GET /tournaments/:id/live` (snapshot + version), `GET /tournaments/:id/standings?group=`, `GET /tournaments/:id/rounds/:n/pairings`, `GET /tournaments/:id/games` (filterable), `POST /tournaments/:id/token` (LiveKit receive-only), arena `POST /tournaments/:id/arena/{join,leave}` |
| Game | `GET /tournaments/:id/games/:gameId` (a player sees live moves; everyone else sees the delayed view), `POST .../move` `{ uci, ply }`, `POST .../action` (resign, draw offer/accept/decline, claim timeout, claim opponent gone, berserk) |
| Host game ops | `POST .../games/:gameId/forfeit`, `POST .../games/:gameId/correct` (reason required, audited, standings recomputed) |
| Commentary | `GET /tournaments/:id/commentary` (cursor-paged), `POST` (idempotent `clientId`), `PATCH .../:cid` (pin, unpin), `POST .../:cid/hide`, `PUT /tournaments/:id/featured` |
| History | `GET /tournaments/:id/results` (final table, rounds, games with Game Library links, commentary archive), `GET /me/tournaments` (my schedule, opponents, results) |

Everything is behind `@RequireFeature("tournaments")`.

---

## 7. Frontend (`apps/web/src/features/tournaments/`)

Routes are thin server pages rendering `"use client"` clients. Each needs a
`ROUTE_RULES` entry, a `matcher` entry and a `PAGE_TITLES` entry.

| Screen | Route |
|---|---|
| Discovery (tabs: live, upcoming, completed, cancelled; filters) | `/tournaments` |
| Details + registration (pre-start), live dashboard (live), results (finished): one page that changes by status | `/tournaments/[id]` |
| Play / spectate a game | `/tournaments/[id]/games/[gameId]` |
| Multi-board spectator grid | `/tournaments/[id]/boards` |
| Creation wizard (format → time control → schedule → eligibility → media → review) | `/tournaments/new`, `/tournaments/[id]/edit` |
| Host dashboard (registrations, rounds, game monitor, disputes, commentary console, audit) | `/tournaments/[id]/manage` |
| My tournaments / host list | `/tournaments/mine`, `/tournaments/hosting` |

**Design.** A dedicated tournament layout, not dashboard cards:

- The board comes first: up to about 70 vh on desktop, with the clocks and
  player strips attached above and below it, and the move list and actions in
  a side rail.
- The live dashboard is three columns on desktop (standings | featured board +
  pairings | commentary feed) and collapses to tabs on mobile, with the board
  always on top.
- It uses a dense, table-led look with clear status pills (LIVE pulse,
  ROUND n/N, countdown).

Within the repo's rules, this is a component set in
`features/tournaments/components/ui/` built **only from the Design System v2
tokens**: ESLint rejects hex, palette and `dark:` colours, so the tournament
look comes from layout, type and density, not new colours. Dark and light
themes come free from the tokens. Every board uses `useChessAppearance()`.
Dates use the `lib/datetime.ts` formatters. Commentary uses `FormattedText`.
The tournament game view **never shows engine, analysis or hint tools** while
the game is ongoing.

Responsive verification: `npm run shots -- --path /tournaments/... --devices all`
for every screen, with no horizontal overflow.

---

## 8. Security, fair play, scalability and risks

**Integrity**
- Every move is checked on the server against `ply` with a status-filtered
  claim.
- Results only come from the engine or an audited host action. No client
  score is ever read.
- Pairing runs inside a transaction that locks the tournament row and checks
  the round status, so a second "generate pairings" click is a no-op 409. The
  unique indexes are the last guard.
- Standings are recomputed under an advisory xact lock per tournament.

**Fair play.** Honest scope: there is no real cheat detection.
- Engine and analysis tools are disabled in game views.
- Spectator delay is enforced on the server.
- A player can have only one ongoing game (partial unique index).
- Per-move server timestamps allow move-time statistics.
- After a game, Stockfish analysis (the existing `game-analysis`) gives
  centipawn loss and accuracy. Outliers are flagged to the host for review,
  never punished automatically.
- Tab-blur counts are an optional signal for the host only.

**Minors**
- Students are minors. Spectating is signed-in only by default.
- Gender is not stored today (§9).
- Sentry rules are unchanged.
- Commentary is written by hosts only. No player chat is proposed for the
  first version.

**Main risks**
1. Swiss pairing quality: a blossom matcher is non-trivial; mitigated by the property tests and a "re-pair round" host action before round start.
2. Arena load: the pairing tick plus many short games. The pairing tick runs under the job lock, and the only expensive operation is a standings recompute per game end, which stays incremental.
3. LiveKit dependency: if LiveKit is down, the UI degrades to polling and keeps working.
4. Scope: this is the size of the whole live-class feature. The phases below are independently shippable.
5. The match engine extraction touches working live-class code (Phase 0), so it is kept separate and covered by the existing spec.

---

## 9. Owner decisions needed before or during build

1. **Who can create a tournament?** Admins only, or coaches with an approval
   step to publish (proposed)?
2. **Cross-academy tournaments** (the "Academy" standings filter): is a
   tournament limited to one academy (proposed for v1), or are platform-wide
   open tournaments wanted? The latter needs `asPlatform`,
   `PLATFORM_OPERATOR_LINKS` and a security review.
3. **Gender**: adding a gender field to the student profile (optional,
   admin-configurable, included in exports) involves minors' data. Proposed:
   defer, and ship the age, rating and batch filters first.
4. **Ratings**: seed from the typed-in `chessRating` (v1), or build an internal
   Glicko-2 tournament rating (later phase)?
5. **Entry fees**: needed in v1? It needs a new product type through
   `PaymentService` and an `Entitlement`. Proposed: Phase 2b behind a flag.
6. **Anonymous public spectating**: wanted? It changes the real-time choice
   (§4) and the privacy posture.
7. **Certificates**: is the existing invoice PDF pipeline acceptable to reuse
   for certificate PDFs, or is it out of scope for v1?

---

## 10. Phases (each independently testable and shippable)

| Phase | Scope | Done when / tests |
|---|---|---|
| **0. Engine extraction** | `common/chess/game-engine.ts` pulled out of `LiveClassMatchService`. No behaviour change. | The existing match spec is green; new engine spec covers every end reason, clocks, increment, flag with insufficient material. |
| **1. Domain, DB, permissions** | Models + migration + getters, `tournaments.ts` contract, `API_ROUTES`, module skeleton, `assertCan*` / visibility, feature key + Enterprise migration, audit log, soft delete (Trash checklist), privacy export. | Unit specs for permissions; access suites; `route-auth.spec`; tenant spec; `npm run typecheck` / `lint` / `test`. |
| **2. Create, discover, register** | CRUD + versioned edits, banner/logo upload, publish flow, discovery list (paged), details, eligibility engine (age group by cutoff date, rating, level, batch), self + admin registration, invitations, withdraw-before-deadline, approve/reject, wizard UI, discovery and details UI. (2b: entry fees.) | Eligibility table tests; duplicate-registration race (int-spec); cross-user rows; shots of the screens. |
| **3. Pairing engines** | Swiss, round robin, knockout, arena pool, tiebreaks: pure modules. Round generation service (transaction + lock). | Fixtures + property tests (§5); concurrent "next round" int-spec gives one round. |
| **4. Live games + results** | Tournament game routes on the engine, first-move timer, flag sweeper cron, opponent-gone claim, result funnel (§3.4), Game Library `TOURNAMENT` source, play screen. | Specs for every outcome; concurrent completion int-spec (idempotent); reconnect = snapshot refetch (Playwright, two simulated players). |
| **5. Standings + management** | Standings cache + recompute, filters (age group, rating band, batch), host dashboard: start, pause, resume, next round, forfeits, result correction with reason, disqualify, end, publish results, audit view. | Cached = recomputed (property test); correction re-ranks; audit row on every action. |
| **6. Commentary + featured** | Commentary CRUD, types, pin, hide (moderation), host grants, featured game/player/position, LiveKit room + topics, commentary console UI and feed. | Permission specs (only hosts publish; COMMENTATOR cannot moderate); idempotent `clientId`; delivery via nudge + poll fallback. |
| **7. Spectator experience** | Server-side delayed game view, multi-board grid, follow a player, switch boards, review finished games, snapshot caching, throttle budgets. | Spectator can never receive moves newer than the delay (spec + int-spec); spectator token has no data grant; moves rejected for non-players. |
| **8. Notifications + history + analytics** | `NotificationType` / `MessagingEvent`: registered, starting soon (cron, `dedupeKey`), paired / new opponent, game starting, round complete, announcement, completed, results published. Archive (champion, runner-up, rounds, games, commentary), player stats, fair-play review flags. | Dedupe specs; no double send across sweeps; history page Playwright. |
| **9. Polish + full test pass** | Mobile layouts, transitions, empty/error states, a load script (N simulated players playing at once against a local stack), docs. | `shots --devices all` clean; multi-player Playwright tournament runs end to end for each format; `npm run build -w apps/web`. |

After each phase: run the scoped checks (`typecheck`, `lint`, `test`,
`test:integration` where relevant, `build -w apps/web` for UI), update this doc
plus `CLAUDE.md` (a 1–3 line §3 summary) and `TROUBLESHOOTING.md`, and commit
in reviewable units on this branch.
