# Tournaments — implementation assessment and plan

Status: **plan approved 2026-11-09; Phase 0 done, Phase 1 next** (see §11 for the
per-phase status). Branch: `claude/nexachess-tournament-platform-sjutfe`.

## 0. Owner decisions (2026-11-09)

| # | Decision | What it means for the build |
|---|---|---|
| 1 | **Admins and authorized coaches create tournaments.** A coach creates and manages tournaments they host; publishing a PUBLIC tournament needs admin approval or the academy permission. Admins have full control. | Per-academy `TournamentSettings`: `coachesMayCreate`, `coachesMayPublishPublic`. A coach publishing PUBLIC without that permission files an approval request (`TOURNAMENT_PUBLISH` handler; revalidated at approval). A coach's PRIVATE / INVITATION_ONLY tournament publishes directly, but the coach only invites or adds students from their own batches. §3.2. |
| 2 | **Single academy in v1**, with an explicit owner so inter-academy events come later without a redesign. | `Tournament.tenantId` = organizing academy. Every child row (`TournamentPlayer`, games, commentary, …) also carries its own `tenantId`, and `TournamentPlayer.tenantId` is the **player's** academy. In v1 that is checked to equal the organizer's. Nothing joins through an implicit "same academy" assumption. §3.1, §3.8. |
| 3 | **No gender field.** | Standings filters are age group, rating band and batch only. No new personal-data field. |
| 4 | **Seed from the profile rating**, rating system extensible. | `TournamentPlayer.seedRating` + `seedRatingSource` (`PROFILE` \| `UNRATED`; a future `TOURNAMENT_RATING` adds a value). Seeding reads ratings through one `TournamentRatingProvider` service, so a Glicko-style rating later replaces one class. |
| 5 | **No payment collection in v1**, extensible. | No fee columns in v1. Registration acceptance goes through one `RegistrationGate` chain (eligibility → capacity → approval), so a later payment gate plugs in as a step that hands back an `Entitlement`. `prizesText` stays as display text. |
| 6 | **Public tournaments viewable without sign-in**, with privacy safeguards. Private tournaments need sign-in and permission. **Spectator delay enforced on the server.** | A public, anonymous-safe projection (§4.1). The academy turns it on (`allowAnonymousSpectating`, default off). Anonymous viewers get only that projection, rate-limited by IP and cached. The delay applies to every non-player, signed in or not. |
| 7 | **Certificates in v1**, with templates and eligibility configured by admins. | `CertificateTemplate` per academy, eligibility rules per tournament, frozen `TournamentCertificate` rows with a verification code. PDFs use the existing `pdfmake` stack after commit, the same way invoices do. §3.6. |
| 8 | **Broadcasting is a major feature**: featured game, live and game-specific commentary, position highlighting, move-by-move commentary, announcements, a dedicated broadcast view. | §3.5. A commentary item tied to a move is held back until that move is visible to spectators, so commentary can never leak the delay. Phase 6 is split into 6a (commentary engine) and 6b (broadcast studio and view). |
| 9 | **Academy admin tournament dashboard**: all tournaments, hosts, registrations, participation, results, each student's tournament history. | `/admin/tournaments` (Phase 5) and a tournament tab in student history (Phase 8). §3.7. |
| 10 | **Tenant-aware from day one.** | Same as #2, plus: no tournament query skips the tenant extension, and any future cross-academy read goes through one `asPlatform` seam named in §3.8. |

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
  PUBLISHED → LIVE ⇄ PAUSED → COMPLETED | CANCELLED; whether registration is
  open is **derived** from the registration window by a shared resolver, never
  stored, so no cron flips a status), `visibility` (PUBLIC | PRIVATE | INVITATION_ONLY),
  `startsAt`, `registrationOpensAt`, `registrationClosesAt`,
  `lateRegistrationRounds`, `minPlayers`, `maxPlayers`, `eligibilityJson`
  (Zod: age-group set + cutoff date, rating range, experience levels, batch
  ids), `rulesText`, `prizesText` (no fee columns in v1, decision 5),
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
  (snapshot) + `seedRatingSource`, `seedNumber`, `tenantId` (the **player's**
  academy, decision 2), `registeredById` (self or admin), `withdrawnAt`,
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
- **`TournamentSettings`** (one per academy, `requireTenantId()` key):
  `coachesMayCreate`, `coachesMayPublishPublic`, `allowAnonymousSpectating`,
  `publicNameFormat` (FIRST_NAME_LAST_INITIAL by default), `defaultSpectatorDelaySec`.
- **`TournamentCommentary`**: `type` (GENERAL | GAME | MOVE | PLAYER | ROUND |
  ANNOUNCEMENT | FEATURED_ANALYSIS | EMERGENCY), `body` (FormattedText),
  `gameId?`, `playerId?`, `ply?` (move-by-move commentary), `fen?` +
  `highlightJson?` (squares and arrows for a position highlight), `releaseAt`
  (§3.5), `pinnedAt`, `authorId`,
  `hiddenAt` / `hiddenById` / `hiddenReason` (moderation hides the message; it
  does not go through Trash), and `clientId` (idempotent send, unique
  `(authorId, clientId)`). Indexed by `(tournamentId, createdAt)`.
- **Featured state** (columns on Tournament): `featuredGameId`,
  `featuredPlayerId`, `featuredAt`. Every change also writes a commentary row
  of type FEATURED_ANALYSIS, so the archive shows the broadcast timeline.
- **`CertificateTemplate`** (per academy, soft-deletable): `name`, `layoutJson`
  (title, body with placeholders from a fixed list, colours via
  `brandColorIssue`, orientation), background/signature images (magic-byte
  checked uploads).
- **`TournamentCertificateRule`** (per tournament): `templateId`, `kind`
  (PLACEMENT top N | AGE_GROUP_PLACEMENT top N | PARTICIPATION with minimum
  games played).
- **`TournamentCertificate`** (issued, never edited): `playerId`, `userId`,
  `ruleId`, a frozen `snapshotJson` (names, placement, score, dates),
  `serialNumber`, `verificationCode` (unique, random), `pdfStatus`,
  `issuedAt`, `revokedAt` + `revokedReason`. Unique `(tournamentId, userId, ruleId)`.
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
| Create a tournament | ADMIN, SUPER_ADMIN of the academy; COACH when `coachesMayCreate` (the creator becomes HOST) |
| Edit, or manage registrations of, a tournament | Admins; a coach only when they hold a HOST or CO_HOST row on it |
| Publish a PRIVATE or INVITATION_ONLY tournament | Admins; its coach HOST, inviting or adding only students from the coach's own batches |
| Publish a PUBLIC tournament | Admins; a coach HOST only with `coachesMayPublishPublic`, otherwise a `TOURNAMENT_PUBLISH` approval request (claim → revalidate the requester is still HOST and the tournament is still DRAFT and unchanged since the request → publish, in one transaction) |
| Run a tournament (start, pause, pair, forfeit, correct a result, end, publish results) | Admins, plus HOST or CO_HOST |
| Publish official commentary and broadcast controls | HOST, CO_HOST, COMMENTATOR, admins |
| Moderate commentary, grant or revoke hosts | Admins, plus HOST for their own tournament (CO_HOST and COMMENTATOR cannot) |
| Configure certificate templates and academy tournament settings | Admins only |
| Register | STUDENT in the academy who passes the `RegistrationGate` chain; admins (and a coach HOST, for own-batch students) can register someone |
| Spectate PUBLIC | Signed-in academy members; anonymous viewers too when `allowAnonymousSpectating` is on (public projection only, §4.1) |
| Spectate PRIVATE / INVITATION_ONLY | Signed in and one of: player, invitee, host, admin |
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

### 3.5 Broadcasting (decision 8)

Host **broadcast studio** (`/tournaments/[id]/studio`, Phase 6b):

- The featured board is the host's own live (undelayed) view. Next to it: a
  game picker (live boards sorted by board number, standings proximity or
  "decisive moment"), a player picker, and the commentary composer.
- Composer types: general, game, **move** (anchored to `gameId` + `ply`,
  defaulting to the current ply), player, round, announcement, featured
  analysis, emergency.
- **Position highlight**: draw squares and arrows on the board, sent as
  `highlightJson` with the FEN.
- Controls: pin and unpin, round-start and round-end templates (prefilled from
  the round state), winner announcement (prefilled from standings), and
  emergency (pinned and shown as a banner to everyone, players included).

Spectator **broadcast view** (`/tournaments/[id]/broadcast`):

- The featured board (delayed) is the primary element, with the commentary
  timeline beside it on desktop and below it on mobile.
- Move commentary is shown inline in the move list, and highlight arrows are
  drawn on the board.
- A "follow the broadcast" toggle auto-switches the board when the host
  changes the featured game. Switching it off lets the viewer browse boards
  freely.
- Opening a highlighted game goes to its board.

**Delay safety.** Each commentary row stores `releaseAt`:

- Commentary tied to a game ply: `releaseAt` = the time that ply becomes
  visible to spectators (move timestamp + `spectatorDelaySec`).
- General commentary: the time it is created.
- The feed query returns rows with `releaseAt <= now()` to everyone except
  hosts and admins.

The host sees a "visible to spectators in Ns" badge. Players see no game
commentary about their own ongoing game until it ends: the server filters it
for them (anti-assistance).

### 3.6 Certificates (decision 7)

- Admins manage `CertificateTemplate`s (`/admin/tournaments/certificates`)
  with a live preview. A host picks templates and rules per tournament.
- When results are published, `TournamentCertificateService.issueFor(tournamentId)`
  is idempotent on the unique key. It snapshots placement and score, and
  generates PDFs after commit (`pdfStatus: FAILED` can be retried; it never
  changes a result).
- A later result correction does not edit issued certificates. The host
  revokes and reissues, and both are audited.
- Downloads: the owner and academy admins (signed URL). A public
  `/certificates/verify/<code>` page shows only the name format from §4.1,
  the tournament, the placement and the date.

### 3.7 Academy admin dashboard (decision 9)

`/admin/tournaments`:

- all academy tournaments, by status, with host, player count and date
- host assignments across tournaments
- a registration queue (pending approvals across all tournaments)
- participation statistics (players per tournament, completion rate,
  no-shows and forfeits)
- results
- the tournament settings and certificate templates

A student's tournament history (tournaments, placements, score, performance,
certificates) is a tab on the existing student detail page, read from the
same standings rows.

### 3.8 Tenant-awareness for later inter-academy events (decisions 2 and 10)

- Ownership is always the organizer's `Tournament.tenantId`. Participation is
  `TournamentPlayer.tenantId`, the player's academy. Game and commentary rows
  carry the organizer's `tenantId`.
- v1 enforces `TournamentPlayer.tenantId === Tournament.tenantId` in the
  `RegistrationGate`. The nightly tenant integrity check reports any
  mismatch, so the link is not added to `PLATFORM_OPERATOR_LINKS`.
- A later inter-academy event adds an invited-academies table and a
  security-reviewed `PLATFORM_OPERATOR_LINKS` entry for
  `TournamentPlayer.tenantId → Tournament.tenantId`. The cross-academy reads
  (standings and games for a player from another academy) then go through one
  `asPlatform("inter-academy tournament", …)` seam in the tournament read
  service. No other code assumes "same academy".

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

### 4.1 Anonymous spectators (decision 6)

- **Scope.** Only PUBLIC tournaments of an academy with
  `allowAnonymousSpectating` on. Routes go on `PUBLIC_ROUTES` (and in the
  access suite's `ANONYMOUS_OK` with a reason).
- **Public projection DTO** (a separate mapper with a spec asserting which
  fields it holds):
  - display name in `publicNameFormat` (first name + last initial by default)
  - seed rating, score and results
  - no user id (an opaque per-tournament player number), no avatar, no date of
    birth, age, batch, email or profile link
  - the age-group label only when the standings filter needs it
- Commentary bodies are host-written; the console shows a "public audience"
  reminder.
- **Real-time.** Anonymous viewers get a hidden, receive-only LiveKit token
  from a public route, rate-limited by IP, for that room only (no data grant).
  They only ever receive `tournament_state`, `tournament_spectate` and
  `tournament_commentary` nudges. Player move packets use
  `destinationIdentities`, so anonymous viewers never get them. Polling also
  works.
- **Delay.** The same server-side delayed view as signed-in spectators.
- **Abuse.** IP throttles on token and snapshot routes, a cached snapshot, and
  `noindex` by default.

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
- Students are minors. Anonymous spectating is off unless the academy
  enables it, and then it shows only the public projection (§4.1).
- No gender field (decision 3).
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

## 9. Owner decisions

All seven open questions were decided on 2026-11-09 (§0). New questions get
added here as they come up.

## 10. Phases (each independently testable and shippable)

| Phase | Scope | Done when / tests |
|---|---|---|
| **0. Engine extraction** | `common/chess/game-engine.ts` pulled out of `LiveClassMatchService`. No behaviour change. | The existing match spec is green; new engine spec covers every end reason, clocks, increment, flag with insufficient material. |
| **1. Domain, DB, permissions** | Models + migration + getters (incl. `TournamentSettings`, certificate tables), `tournaments.ts` contract, `API_ROUTES`, module skeleton, `assertCan*` / visibility (§3.2), feature key + Enterprise migration, audit log, soft delete (Trash checklist), privacy export, tenant ownership rules (§3.8). | Unit specs for every permission row; access suites; `route-auth.spec`; tenant spec; `npm run typecheck` / `lint` / `test`. |
| **2. Create, discover, register** | Format-config and eligibility schemas, the registration-phase resolver, CRUD + versioned edits, banner/logo upload, publish flow (direct, or the `TOURNAMENT_PUBLISH` approval handler — moved here from Phase 1 so it ships with the publish route that files it), discovery list (paged), details, `RegistrationGate` chain (eligibility: age group by cutoff date, rating, level, batch; capacity; approval; same-academy check), self + admin + coach-own-batch registration, invitations, withdraw-before-deadline, approve/reject, wizard UI, discovery and details UI. | Eligibility table tests; duplicate-registration race (int-spec); coach cannot add a non-own-batch student; cross-user rows; shots of the screens. |
| **3. Pairing engines** | Swiss, round robin, knockout, arena pool, tiebreaks: pure modules. Round generation service (transaction + lock). Seeding through `TournamentRatingProvider`. | Fixtures + property tests (§5); concurrent "next round" int-spec gives one round. |
| **4. Live games + results** | Tournament game routes on the Phase 0 engine, first-move timer, flag sweeper cron, opponent-gone claim, result funnel (§3.4), Game Library `TOURNAMENT` source, play screen. | Specs for every outcome; concurrent completion int-spec (idempotent); reconnect = snapshot refetch (Playwright, two simulated players). |
| **5. Standings + management** | Standings cache + recompute, filters (age group, rating band, batch), host dashboard (start, pause, resume, next round, forfeits, result correction with reason, disqualify, end, publish results, audit view), **academy admin dashboard `/admin/tournaments`** (§3.7). | Cached = recomputed (property test); correction re-ranks; audit row on every action; admin dashboard only shows own-academy rows. |
| **6a. Commentary engine** | Commentary CRUD for every type incl. move commentary and position highlights, `releaseAt` delay rule, pin, hide (moderation), host grants, featured game/player, LiveKit room + topics. | Permission specs (only hosts publish; COMMENTATOR cannot moderate); idempotent `clientId`; **commentary never released before its ply is visible**; players never see commentary on their own ongoing game. |
| **6b. Broadcast studio + broadcast view** | Studio (§3.5) and the spectator broadcast page with follow-the-broadcast, inline move commentary, highlight arrows, emergency banner. | Playwright: host features a game → spectator board switches after the delay; shots of both pages on all devices. |
| **7. Spectator experience** | Server-side delayed game view, multi-board grid, follow a player, switch boards, review finished games, snapshot caching, throttle budgets, **anonymous public projection** (§4.1). | Spectator can never receive moves newer than the delay (spec + int-spec); spectator token has no data grant; moves rejected for non-players; anonymous DTO holds no user id, date of birth, batch or contact data (spec); private tournaments 401/404 for anonymous callers. |
| **8. Notifications, history, certificates, analytics** | `NotificationType` / `MessagingEvent`: registered, starting soon (cron, `dedupeKey`), paired / new opponent, game starting, round complete, announcement, completed, results published. Archive (champion, runner-up, rounds, games, commentary archive), student tournament-history tab, **certificate templates, rules, issue/revoke, PDF, verification page** (§3.6), fair-play review flags. | Dedupe specs; no double send across sweeps; certificate issue idempotent; failed PDF never changes a result; history page Playwright. |
| **9. Polish + full test pass** | Mobile layouts, transitions, empty/error states, a load script (N simulated players playing at once against a local stack), docs. | `shots --devices all` clean; multi-player Playwright tournament runs end to end for each format; `npm run build -w apps/web`. |

After each phase: run the scoped checks (`typecheck`, `lint`, `test`,
`test:integration` where relevant, `build -w apps/web` for UI), update this doc
plus `CLAUDE.md` (a 1–3 line §3 summary) and `TROUBLESHOOTING.md`, and commit
in reviewable units on this branch.

A phase is **done** only when its server rules, permissions and tests are in
place. A screen without its enforced API behaviour does not count.

---

## 11. Phase status and Phase 0 scope

| Phase | Status |
|---|---|
| 0 | **Done** (2026-11-09): `common/chess/game-engine.ts` + spec (37 tests); `LiveClassMatchService` delegates to it. The match spec ran unchanged: the student-match, simul and common/chess suites went from 5 suites and 187 tests to 6 and 224, all passing; the full API unit run had 207 suites and 2994 tests passing, with 2 suites skipped because they need a real Stockfish binary. |
| 1 | **Done** (2026-11-09), see "Phase 1 as built" below. |
| 2 | **API done** (2026-11-09): create, edit, publish (direct or `TOURNAMENT_PUBLISH` approval), cancel, delete, images, hosts, discovery, registration. Screens follow with the other phases' screens (see "Build order"). |
| 3 | **Done** (2026-11-09): pure engines (`apps/api/src/tournament/pairing/`) and their database orchestration (`TournamentEngineService`). |
| 4 | **API done** (2026-11-09): moves, actions, the clock sweeper, the result funnel, Game Library archive. |
| 5 | **API done** (2026-11-09): standings (cached, recomputable, filterable), host controls, live snapshot, audit. Admin dashboard screens with the web pass. |
| 6 | **API done** (2026-11-09): commentary engine (all types, delay release, own-game filtering, pin, moderation, featured), LiveKit nudges. Studio and broadcast screens with the web pass. |
| 7 | **API done** (2026-11-09): delayed game view (Phase 4), anonymous public projection, cached snapshots, throttles. Spectator screens with the web pass. |
| 8–9 | Not started |

**Build order (2026-11-09).** The owner asked for the whole feature. The API of
Phases 2–8 is built first, one committed phase at a time, each with its own
unit and integration tests. The screens come after, in one pass, because most
of them combine several phases (the live dashboard shows pairings, standings,
games and commentary). Phase 9 then runs the responsive screenshots and the
multi-player end-to-end tests.

### Phase 0 — exact scope (confirmed before starting)

**Goal.** Move the pure chess-game rules out of `LiveClassMatchService` into a
reusable, database-free module, so the Phase 4 tournament games run on the
same rules. **No behaviour change.**

| File | Change |
|---|---|
| `apps/api/src/common/chess/game-engine.ts` | **New.** Pure functions, no Prisma and no Nest: `sideToMove`, `remainingClockMs`, `clockAfterMove`, `hasMatingMaterial`, `timeoutOutcome`, `replayGame`, `playUciMove`, `outcomeAfterMove`, `resignationOutcome`. Types come from `@nexa-chess/types` (`MatchColor`, `MatchMove`, `MatchEndReason`, `MatchGameResult`), which are string-identical to the Prisma enums. |
| `apps/api/src/common/chess/game-engine.spec.ts` | **New.** Covers every end reason, clock start ply, increment, the timeout-vs-insufficient-material draw, replay with a stored-FEN fallback, illegal and malformed moves, promotion. |
| `apps/api/src/student-match/live-class-match.service.ts` | Private `remainingFor`, `timeoutOutcome`, `hasMatingMaterial`, `replay`, `outcomeAfter` and `turnOf` become thin calls to the engine. The move-parsing block in `move()` uses `playUciMove`. Persistence, claims (`updateMany` on `ply` + status), broadcast and recording are **unchanged**. |

**Not touched.**
- the live-class match controller, module, DTOs, `packages/types`, the schema
  and migrations
- every web file
- `simul/live-class-simul.service.ts`: it has its own `replay` / `outcomeAfter`
  with simul-specific enums and per-side clocks. Moving it onto the engine is a
  possible later clean-up, kept out of Phase 0 to keep the change small.
- `puzzle-activity/playout-position.ts`: different rules (goal-based)

**Verification.**
- `src/student-match/live-class-match.service.spec.ts` runs **unchanged**
  (baseline: the student-match, simul and common/chess suites, 5 suites and 187
  tests, passed before the change), plus the new engine spec.
- `npm run typecheck -w apps/api` and `npm run lint -w apps/api`.
- The full API unit run.

### Phase 1 — as built (2026-11-09)

**Scope decisions made while building.**
- **Each phase adds its own tables.** Phase 1 adds only `Tournament`,
  `TournamentHost`, `TournamentPlayer`, `TournamentSettings` and
  `TournamentAuditLog` (migration `20261109102638_tournament_domain`, additive).
  Rounds and games (Phases 3–4), commentary (6) and certificates (8) arrive with
  the phases that use them, so no table sits unused or gets redesigned later.
- **Stored statuses are DRAFT, PUBLISHED, LIVE, PAUSED, COMPLETED and
  CANCELLED.** Registration open/closed is derived (Phase 2 resolver).
- **The publish approval handler moved to Phase 2**, with the publish route that
  files it. Phase 1 has the policy that decides when one is needed
  (`tournamentPublishPath`).
- **Format-config and eligibility schemas moved to Phase 2**, with creation.
- **Plan tier.** `tournaments` is on Enterprise only, so Nexa's academy has it.
  Offering it on Business or Growth is a pricing decision: one more
  `array_append` migration plus the `DEFAULT_PLATFORM_PLANS` list.
- **Spectator delay defaults to 15 s**, for the academy and per tournament
  (safe by default; 0 is allowed).

**What exists.**

| Piece | Where |
|---|---|
| Schema | 9 enums, 5 models, `PrismaService` getters. CHECK constraints refuse untimed clocks, fewer than 2 players, a cap below the minimum, an inverted registration window, and negative delays or round counts. Unique `(tenantId, slug)` and `(tournamentId, userId)` for both hosts and players. |
| Contract | `packages/types/src/tournaments.ts`: enums, labels, `formatPublicPlayerName` (never the full last name), the settings request/response, `TournamentPublishPath`. `API_ROUTES.tournaments.adminSettings`. Plan feature `tournaments`. |
| Permission policy | `apps/api/src/tournament/tournament-policy.ts`: `canCreateTournament`, `canManageTournament`, `tournamentPublishPath`, `canBroadcast`, `canModerateTournament`, `canViewTournament`, `getTournamentVisibilityWhere`, `canHoldHostRole`, `playerAcademyAllowed`. Every row of §3.2 that Phase 1 can decide. |
| Settings | `GET/PUT /admin/tournaments/settings` (admins, `@RequireFeature("tournaments")`). One row per academy. The update runs under a per-academy advisory transaction lock and writes a `SETTINGS_UPDATED` audit row holding only the changed fields, before and after. |
| Audit | `TournamentAuditService.record(tx, …)`, always inside the caller's transaction. |
| Trash | `Tournament` is a Trash entity. Its hosts and players are hidden with it (`parentScopedWhere`) and come back on restore. The web Trash filter lists it. |
| Privacy | The export gains `tournamentEntries` and `tournamentHostRoles` (trashed included; other people's ids omitted) and `tournamentAuditActions` (no before/after values). The legal page lists tournament entries. |

**Tests.**
- Unit:
  - `tournament-policy.spec.ts` (20): every rule, plus a check that the list
    filter agrees with `canViewTournament` across every combination of role ×
    status × visibility × host role × player status. Mutation-checked:
    removing the hosts clause fails it.
  - `tournament-enums.spec.ts` (18): shared enums equal the Prisma enums, and
    the public-name formats.
  - `tournament-settings.service.spec.ts` (7).
- Integration: `tournament-domain.int-spec.ts` (22):
  - the HTTP rules (admin only, 400 on bad bodies, 401/403, 402 without the
    plan feature)
  - the audit row and two concurrent saves
  - per-academy rows and academy separation
  - the duplicate-registration refusal and each CHECK constraint
  - Trash hide/restore of players and hosts, and the Trash list
  - the privacy export
  - no cross-academy player rows

### Phase 2 — as built (API, 2026-11-09)

- **Contract** (`tournaments.ts`): config schemas (time control, eligibility,
  arena, knockout), `tournamentConfigIssues` (the
  cross-field rules shared by create and the merged result of an update),
  `resolveTournamentPhase` (registration phase derived from the window),
  `tournamentEligibilityIssue` (the one eligibility rule: age on the cutoff
  date, rating band and unrated players, experience level, batches),
  `ageOn` / `tournamentAgeGroup`, and the DTOs. **Update schemas never apply
  create defaults** (zod 4 applies `.default()` under `.optional()`), so an edit
  never silently resets a field.
- **Services** (`apps/api/src/tournament/`):
  - `TournamentAccessService` loads a tournament with the viewer's host and
    player rows through scoped queries; anything the viewer may not see is a 404.
  - `TournamentService`: create (a coach creator becomes HOST), edit (needs the
    current `version`; after publishing the format is fixed, and after the start
    only the texts and the delay may change), publish, cancel (with a reason),
    delete (Trash, drafts and cancelled only, HOST or admin), banner and logo
    (magic-byte check, the shared `common/sniff-image.ts`), hosts (active staff
    only; a coach HOST can't remove themselves), list by tab (live, upcoming,
    completed, cancelled, mine, hosting, drafts; paged, searchable) and detail
    with the viewer's permissions and registration state.
  - `TournamentRegistrationService`: the registration gate (window → role →
    academy → eligibility → capacity → approval).
    - Capacity is checked under `SELECT … FOR UPDATE` on the tournament row,
      and a second entry hits the unique key.
    - Self-registration is for PUBLIC tournaments only. PRIVATE tournaments are
      host-entered. INVITATION_ONLY entry is invite, then accept or decline.
    - A coach host only reaches students of their own live batches; admins
      reach any academy student.
    - Approval-required tournaments take entries as PENDING.
    - Withdrawal is possible while the tournament is still PUBLISHED. A
      withdrawn player may re-enter; rejected and disqualified players may not.
    - Seed rating and age group are snapshotted at entry.
  - `approval/handlers/tournament-publish.handler.ts`: snapshot = the
    tournament `version`. Approval re-checks that it is still a draft, still
    unedited, not yet started, and that the requester is still the HOST on an
    active staff account.
- **Tests**:
  - `tournament-rules.spec.ts` (28 tests).
  - `tournament-lifecycle.int-spec.ts` (21 tests), including a five-way race
    for the last two places (exactly two succeed), the full approval round trip,
    and an edit voiding a pending approval.
  - 10 cross-user rows and 3 own-data twins in the access suites, which the
    cross-academy suite also replays.

### Phases 3–5 — as built (API, 2026-11-09)

**Engines** (`apps/api/src/tournament/pairing/`, pure, 37 tests):
- `blossom.ts`: maximum-weight matching, a port of the public-domain
  mwmatching reference, checked against brute force on 600 random graphs.
- `swiss.ts`: repeat-free whenever possible (proved by running the matcher
  without repeat edges first), byes to the lowest ranked player without one,
  colour needs, Dutch-style top v bottom half.
- `round-robin.ts`: Berger tables, colour difference at most 1.
- `knockout.ts`: seeded power-of-two bracket, byes to the top seeds, best of
  N, sudden death (at most 3 games), then the higher seed.
- `arena.ts`: pool pairing and 2/1/0 scoring with streaks, no points for
  quick draws, and a berserk bonus.
- `standings.ts`: all tiebreaks, shared ranks on a full tie, performance.

**Schema** (migrations `…_tournament_games`, `…_tournament_game_library`):
- `TournamentRound`, `TournamentGame` (byes are games with no Black),
  `TournamentKnockoutMatch`.
- Standings cache columns on `TournamentPlayer`, which `computeStandings` can
  always recompute.
- `currentGameId` on the player: a game is created only by claiming both
  players where it is null, so nobody is ever in two live games. A unique
  index can't express this, because both players hold the same id.
- CHECKs: two different players per game, clocks never negative.
- `ChessGameSource.TOURNAMENT`.

**Rules as built:**
- **Lock order:** any transaction that can finish a game locks the tournament
  row first, then claims the game. A move that doesn't end the game only claims
  the game row (`ply` + status). So a player's move and a host's forfeit never
  deadlock.
- **Result funnel** (`TournamentEngineService.finishGame`): claim → free both
  players → arena no-show leaves the pool → the next knockout game or the match
  decision (a withdrawn or disqualified side loses by forfeit) → round
  completion (which completes the tournament after the last round) →
  standings recompute.
- **Clocks:** they start after both first moves. The first move is due within
  60 s, or that side loses by NO_SHOW; an arena no-show is void and the absent
  player is paused. The flag sweeper (`TournamentScheduler`, every 5 s, job
  lock, once per academy) finishes flags and no-shows, pairs the arena pool,
  ends arenas, starts the next round after `roundBreakSec`, and auto-starts at
  `startsAt` when enough players are approved.
- **Pause** stops new rounds and pairings; games in play keep their clocks.
- **Withdraw / disqualify after the start:** the game in play is forfeited
  to the opponent, a knockout match goes to the opponent, and the player is
  never paired again. Their results stay in the table.
- **Corrections:** reason required, guarded by the game's `version`, audited
  with before and after values. Refused for a knockout match that has moved on.
- **Spectator delay:**
  - Each stored move carries its server time and the mover's clock.
  - Non-players (who aren't hosts) get the position, the moves and the clocks
    as they stood `spectatorDelaySec` ago; the result is held back until the
    delay passes too.
  - Players and hosts see everything live.
- **Game Library:** every finished game is archived through
  `GameRecorderService.recordTournamentGame` from an after-commit event
  (idempotent on `tournament:<gameId>`).
- **Events:** `TournamentEventsService` is the after-commit hook (the live
  `version`, archiving, and the Phase 6 real-time nudges).

**Tests:**
- `tournament-play.int-spec.ts` (14): whole Swiss, round-robin, knockout and
  arena events played over HTTP, plus:
  - concurrent completion of a round (it completes exactly once)
  - two hosts asking for the next round at once (one round)
  - a ply race (one move wins)
  - a checkmate through the engine
  - spectator delay vs live views
  - no-show and flag through the sweeper
  - mid-event withdrawal, correction with a stale version, and cached
    standings = recomputed standings
- 10 more cross-user rows and 4 own-data twins.

### Phases 6–7 — as built (API, 2026-11-09)

- **`TournamentCommentary`** (migration `…_tournament_commentary`):
  - Types: GENERAL, GAME, MOVE (anchored to `gameId` + `ply`), PLAYER, ROUND,
    ANNOUNCEMENT, FEATURED, EMERGENCY (always pinned).
  - Optional FEN, plus a `highlight` of squares and arrows validated by
    `tournamentHighlightSchema`.
  - Idempotent on `(authorId, clientId)`.
  - **`releaseAt`**: commentary about a ply is released at that move's time
    plus the delay. Commentary about a game in play is released at now plus the
    delay. Everything else is released at once.
  - Non-hosts only get released, unhidden items. A player never gets
    commentary on their own game while it is in play.
  - Pin (any host role), hide (HOST / admin, audited `COMMENTARY_HIDDEN`).
  - Cursor-paged feed plus up to 5 pinned items.
- **Featured** game and player (columns on `Tournament`): any host role; it
  writes a FEATURED item into the feed.
- **Real time** (`TournamentRealtimeService`):
  - One room per tournament, `tournament-<tenantId>-<id>`.
  - `POST …/realtime-token` gives a hidden seat with no publish and no data
    grant. Identity: `tu_<userId>`, or `anon_<random>` on the public route.
  - Topics: `tournament_state` and `tournament_commentary` (everyone);
    `tournament_game` (only the two players, through `destinationIdentities`);
    `tournament_spectate` (everyone, with `visibleAt`).
  - Packets are nudges: clients refetch over REST, which applies permissions
    and the delay.
  - `LiveKitService` is the module's own instance, so the tournament module
    doesn't import the live-class room. Without LiveKit the token route says
    `enabled: false` and the web polls.
  - The live `version` is in-memory per API instance; a mismatch only causes a
    refetch.
- **Anonymous projection** (`TournamentPublicService`, `/public/tournaments/…`,
  on `route-auth.spec` PUBLIC_ROUTES):
  - A 404 unless `allowAnonymousSpectating` is on and the tournament is PUBLIC
    and not a draft.
  - Players are `{ number, name (publicNameFormat), rating }`, never a user id,
    avatar, date of birth, batch or contact data. Hosts and commentary authors
    also get the public name format.
  - Games are always the delayed view. Commentary is released only, without
    hidden items.
  - Live and standings are cached for 1 s per academy and tournament.
  - Throttles are per route (10–120 per minute; the token is 10 per minute).
- **Privacy:** the export gains `tournamentCommentary` (what the account wrote).
- **Tests:** `tournament-broadcast.int-spec.ts` (13 tests):
  - permissions, idempotency, delayed release and own-game filtering
  - highlight validation, emergency pin, moderation, featured, the cursor
  - the token's claims
  - the projection, which holds no user id, `userId`, avatar or full last name
  - delayed games for anonymous viewers; private tournaments and drafts are
    404s
