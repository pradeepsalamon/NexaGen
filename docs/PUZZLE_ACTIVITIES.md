# Unified Puzzle Library: MCQs and Playouts

One library, one folder tree, one sharing workflow, three kinds of activity:

| Kind | Stored in | Student answers through |
|---|---|---|
| Chess puzzle | `puzzles` (unchanged) | `PuzzleAttempt`, as before |
| MCQ | `library_activities` | `live_class_mcq_attempts` |
| Playout | `library_activities` | `live_class_playout_games` |

Admins prepare MCQs and Playouts in the Puzzle Library. A coach only picks them
into the existing activity queue, shares them and watches. Code:
`apps/api/src/puzzle-activity/`, contract `packages/types/src/puzzle-activity.ts`,
web `features/puzzles/components/activities/` (library) and
`features/live-class/components/meeting/activity-run/` (room).

## Rules you must not break

- **`configJson` holds the answer key.** It only leaves the API on staff routes
  (`GET /puzzles/activities/:id`). A student gets `StudentMcqState`, built in
  `ActivityRunService.mcqState`, with `isCorrect` stripped. Option ids are
  meaningless and are never derived from an option's position or correctness.
- **Decide the goal with `decidePlayoutOutcome`, nowhere else.** It reads the
  position and the game's events, never a move count. A checkmate goal needs a
  real mate given by the student. Being mated is never a success, whatever the
  goal says. `maxStudentMoves` can only fail a game.
- **No coach path into a game's writes.** Every `PlayoutGameService` write first
  requires the caller to be the student who owns the game (another student's
  game id is a 404). Monitoring is `GET` only. The coach's only controls are the
  activity's own: **End activity** and **Reveal answer**.
- **Game state goes to managers alone.** `PLAYOUT_UPDATE` is addressed with
  `destinationIdentities`; `ActivityRunEventsService` never calls `broadcastData`
  with an empty list, which LiveKit reads as the whole room. Room-wide packets
  (`RUN_CHANGED`) carry no game data. Receivers drop a packet with a `from`.
- **Packets are never the record.** Nothing here may throw into a move. A dropped
  packet delays a board until the next 15 s poll; REST restores everything after
  a reconnect.
- **The computer never makes a random move instead.** An engine failure leaves
  the game on the computer's turn with `engineRetry: true`, and the client asks
  `playoutContinue` again. A student could otherwise "beat" a defence nobody played.
- **A run freezes its config.** Editing or deleting the library item changes
  neither a running class nor past results.
- **Every game write is a claim:** `updateMany where { id, ply, status: IN_PROGRESS }`.

## Why a separate table from `puzzles`

Every puzzle query (training, homework sets, courses, revision, the catalogue)
assumes a position plus a solution line, so adding rows without them would mean a
new filter on every one of those queries, and any miss would be a production bug.
Instead `library_activities.topicId` points at the same `puzzle_topics`, and:
the folder delete, archive, reassign and copy routes carry activities along;
`GET /puzzles/library` is one SQL `UNION ALL` over both tables, so sorting and
paging are exact across kinds. No existing puzzle row, route or attempt changes.

`LibraryActivity` is soft-deletable and Trash-registered. Runs, attempts and games
are operational records and are not: they survive the item being purged
(`activityId` is `SetNull`; title and config are frozen on the run).

## "Independent Stockfish session" means

Each student has their own game row: position, history, PGN, clock, attempts,
engine settings. Each engine search is handed exactly that row's position and
settings by the shared `StockfishService` pool, as Simul does, and keeps no game
state between searches. It is **not one OS process per student**: on this box
(2 cores, pool of 4) that would be 30 engine processes for a class.

Measured on this 2-core box with real Stockfish, `playout-engine.real.spec.ts`:
**30 simultaneous replies at skill 5 took 864 ms** (one run, nothing else loading
the box). A weakened engine stops at
depth `level + 1`, so low levels barely queue. At Maximum (level 20) each search
runs its full `movetimeMs`, so a class all moving at the same moment queues behind
the pool: keep Maximum for small groups or a short thinking time.

The engine replies inside the student's move request, and there is no per-student
background worker, so nothing keeps running for a student who has left.

## Flow in class

1. Coach adds library items to a queue (`QueueLibraryPicker`, in the room or on
   `/classes/:id`). Items store `activityId`, no copy.
2. When the class reaches an item, `ActivityQueueService.activate` calls
   `ActivityRunService.start`, which creates the `LiveClassActivityRun`. One
   `ACTIVE` run per class: hand-written partial unique index.
3. Every client opens the `activity` stage tab (`ActivityRunProvider`,
   `ClassroomLayout`); below md it is a dialog (`ActivityRunHost`).
4. Next / End early / the class ending close the run through `closeActivityRun`.
   Open games end with `ACTIVITY_ENDED`, position kept. History shows them as
   unfinished rather than wrong.

Demo guests have no account to own an answer or a game, so they don't take part.

## When the coach drops out

Nothing on a student's path needs the coach: moves are REST, the engine is on the
server, and monitor packets are dropped when no manager is connected. A student
who reloads gets back in too: `getToken` skips its `COACH_NOT_JOINED` gate while a
run is `ACTIVE`. The coach's board and gallery come back from REST on return.

**The limit:** the existing stale sweep ends a class once the coach has been gone
`LIVE_CLASS_COACH_ABSENT_GRACE_MINUTES` (default 10). The room closes and open games
end there with `ACTIVITY_ENDED`, position kept. So a coach's blip never interrupts
a game; a coach who stays away past the grace period ends the class, as today.

## MCQ reveal

| `revealMode` | Student sees right or wrong | Student sees the key and explanation |
|---|---|---|
| `ON_SUBMIT` | Straight away | Once right, or out of tries |
| `ON_ACTIVITY_END` | When the activity ends | When the activity ends |
| `COACH` | When the coach reveals | When the coach reveals |

While verdicts are hidden, a right answer doesn't stop a further try: refusing
would itself give the answer away. The best try counts. Multiple-correct questions
are all or nothing.

The coach's monitor marks the correct *option* only after reveal, so a shared
screen can't give it away. It does show each student's right or wrong from the
start, which the coach needs in order to teach: a coach watching closely can
infer the key.

## Timers

- **MCQ:** one deadline for the class, `run.endsAt`. Past it (plus
  `ACTIVITY_SUBMIT_GRACE_SECONDS`) the next read ends the run, with or without a
  coach connected. There is no cron.
- **Playout:** each student's own clock, `game.endsAt`, from when their game
  opens; a retry gets a fresh one. Settled on that student's next call, or by the
  coach's monitor.

## Permissions

| | Admin | Coach | Student |
|---|---|---|---|
| Create, edit, delete, publish activities | Yes | No | No |
| Browse the library | Everything | Published, plus own private puzzles | No route |
| Read an activity with its key | Yes | Published | No route |
| Queue and share | Any class | Own class | No |
| Monitor, end, reveal | Any class | Own class | No |
| Answer, play | No | No | Own, in a class they belong to |

## Images

Uploaded through `POST /puzzles/activities/image`: admin only, PNG / JPG / WebP,
5 MB, into their own Cloudinary folder under a random id. A save rejects any image
URL outside that folder (`isActivityImageUrl`), so no outside host can be put in
front of a class of minors. **Known limit:** the delivered URLs are unguessable but
public, like every other Cloudinary image in the app, not signed per viewer.

## Tests

- `playout-rules.spec.ts`: goals, scoring, reveal, merge rules (no database).
- `activity-run-events.service.spec.ts`: who gets which packet.
- `puzzle-activity.int-spec.ts`: everything over HTTP against real Postgres, engine stubbed.
- `cross-user-access.int-spec.ts`: another class's game, and a coach writing to a game.
- `playout-engine.real.spec.ts`: real Stockfish (`STOCKFISH_TEST_PATH=…`).
- `e2e/puzzle-activities.spec.ts`: the whole flow in a browser (`RUN_ACTIVITIES_E2E=1`).

## Known limits

- **A coach can't try a Playout before class.** The preview shows the position,
  goal and settings; nothing plays it without a class.
- **Next moves everyone on at once**, as the queue does for puzzles: anyone mid-game
  stops there. The coach's gallery shows who is still playing, but Next doesn't ask.
- **MCQs and Playouts are live-class only**: not homework, courses or training.
- **Only admins author them**, unlike puzzles, which coaches can also write.
- **Teacher takeover is deliberately absent.** Any future control over a student's
  game must be designed and permissioned separately from monitoring.
