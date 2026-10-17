# Game sources — a student's own games

Code: `apps/api/src/game-sources/` (+ `game-import.service.ts`), contract
`packages/types/src/game-sources.ts`, UI `features/game-analysis/components/GameSourcesCard.tsx`
on `/student/insights`. Routes: `API_ROUTES.games.importPgn`, `API_ROUTES.gameSources.*`.

## 1. PGN upload (always on)

- `POST /games/import-pgn` — `{ pgn, side: AUTO|WHITE|BLACK|NONE, names[], analyse }`.
  Students own what they upload (`ChessGame.ownerId`); a coach/admin upload has
  no owner and no player ids.
- Limits (`PGN_IMPORT_LIMITS`): 1,000,000 characters (this route alone accepts a
  2 MB JSON body — `app.setup.ts`), 100 games, 600 plies per game. Over the
  limit → 400 for the whole request.
- Every game is replayed with the castling-safe chess wrapper. An unreadable
  game, a variant (`[Variant]` ≠ standard) or a too-long game is reported by
  index and skipped — the rest still import.
- Headers, comments (incl. `[%clk]` clocks), NAGs and variations are kept.
  `TimeControl`, `ECO`, `Opening` (or Chess.com's `ECOUrl` slug), `WhiteElo` /
  `BlackElo`, `UTCDate`/`UTCTime` are copied to columns — only when present, never guessed.
- **Duplicates**: unique `(ownerId, contentHash)` where contentHash = sha256 of
  start position + mainline. The same game uploaded twice is counted once.
- **Side**: AUTO matches the PGN's White/Black names against `names`, the
  student's linked usernames and NexaGen username (case-insensitive). No match,
  or both match → the game is stored but the student stands on neither side, so
  it doesn't count in their insights (the response says how many).
- `analyse: true` queues STANDARD analyses at background priority, within the
  daily limit.
- Deleting: the existing Game Library delete (importer or admin, IMPORT games
  only) removes the game; its analyses cascade.

## 2. Linked Lichess / Chess.com accounts (off by default)

`EXTERNAL_GAME_IMPORT_ENABLED=false` → the card says it's not switched on and
every account route is a 503. Nothing else changes.

| | Lichess | Chess.com |
|---|---|---|
| Profile / verification | `GET /api/user/{u}` → `profile.bio` | `GET /pub/player/{u}` → `location` |
| Games | `GET /api/games/user/{u}?since=&max=&sort=dateAsc&clocks=true&opening=true&perfType=…` (PGN) | `GET /pub/player/{u}/games/archives`, then one month at a time |
| Cursor | createdAt ms of the last game seen + 1s | `YYYY/MM:<end_time>` |
| Filter | standard perf types; `[Variant]` other than Standard skipped | `rules === "chess"` only |
| Auth | none (public data) | none (public data) |

- **Only a username is stored. No password, no OAuth token, no scraping.**
  Both are the providers' documented public endpoints; requests carry a
  descriptive `User-Agent` and run one at a time (both ask for serial use).
- **Ownership is verified**: linking creates a one-time code (`nexa-xxxxxxxx`);
  the student puts it in the profile field above and presses Check. Only a
  verified link can import, and a username can be verified by one student at a
  time (partial unique index `external_chess_accounts_verified_username_key`).
  Without this, anyone could import a stranger's games as their own.
- **Sync** (`POST …/accounts/:id/sync`): claims the account atomically (one
  sync at a time; a crashed one frees itself after 10 min), fetches at most 50
  games forward from the cursor (first sync: 90 days back), imports them with
  side AUTO by username, then sets `nextSyncAllowedAt` (+10 min). A provider
  429 → `RATE_LIMITED`, wait ≥15 min (or its `Retry-After`); other failures →
  `FAILED` with the message; the cursor only moves on success.
- Chess.com's own `accuracies` in its archive JSON is **ignored** — NexaGen's
  numbers come from its own analysis.
- Ratings are stored per game as the source reported them and are never
  merged across sources (`GameAnalysisSide.rating` + source key).
- Unlink deletes the account row; `?deleteGames=true` also deletes the games
  imported through it (and their analyses).
- Not implemented: automatic background syncing (a sync is always started by
  the student), Lichess OAuth (not needed for public games), private Chess.com
  data (the PubAPI exposes none).

## 3. Who sees an imported game

Game Library visibility (`GameLibraryService.visibilityWhere`): the owner;
any coach of a live batch the owner is in; admins. Nobody else (404). Covered
by `game-analysis.int-spec.ts` and the cross-user access suite.
