# Puzzle of the Day

A daily puzzle for every student, at three levels, with a streak. Step 1 is
in the app; step 2 tells the numbers that asked for it on WhatsApp that the
day's puzzles are ready. Feature 6 of [UNIQUE_FEATURES_PROPOSAL.md](UNIQUE_FEATURES_PROPOSAL.md).

**Status:** step 1 built 2026-11-21 on `dev` (API, student page and card, admin and coach schedule). Step 2 (WhatsApp) built 2026-11-21 on `dev`, off by default; not yet tried against Meta with a real approved template.

## Owner's calls (2026-11-21)

| Question | Answer |
|---|---|
| Who picks the puzzle | **Automatic**; an **admin** (whole academy) and a **coach** (their batch) can fully override any day and level, or **turn it off** |
| Levels | **Three a day**: Easy / Medium / Hard; a student gets the level of their training rating and may try the others |
| Streak | **Finishing** the day's puzzle keeps it, solved or not |
| When a day starts | Midnight in the **academy's** time zone (`Tenant.timezone`) |

## Rules

- **Levels** (`@nexa-chess/types` `daily-puzzle.ts`, `dailyPuzzleLevelFor`):
  Easy 800–1199, Medium 1200–1599, Hard 1600–1999 by puzzle rating. A
  student's level comes from `StudentProgress.puzzleRating` (1200 = Medium
  before their first rated puzzle).
- **Who gets it**: students with at least one batch that has puzzle training
  on (`Batch.puzzleTrainingEnabled`, the same switch as rated training) **and**
  the daily puzzle on (`Batch.dailyPuzzleEnabled`, default on), while the
  academy has it on (`DailyPuzzleSettings.enabled`, default on).
- **Which puzzle** (`resolveDailyPuzzleSource`), for a student, day and level:
  1. a coach override on the student's **home batch** — their first-enrolled
     batch that has the daily puzzle on (the same order `trainingBatches` uses);
  2. else the admin override for the academy;
  3. else the automatic pick: one quality-gated Lichess catalogue puzzle in
     the level's band, materialised through `PuzzleCatalogService`, never one
     the academy has had as a daily before (`contentHash`). Picked lazily on
     the first read of the day and stored, so everyone shares it.
  An override is a library puzzle the setter can see; a coach may pick GLOBAL
  or their own PRIVATE puzzles (students of their batch can open those).
- **Solving** reuses the attempt engine: the daily route opens a
  `PuzzleAttempt` with context `DAILY` (like training's `TRAINING`) and the
  student solves with the ordinary attempt routes, so rating, hints and the
  practice streak work unchanged. `submit` tells `DailyPuzzleService` when a
  `DAILY` attempt finishes.
- **Result and streak**: `DailyPuzzleEntry` (one per student, day and level;
  the attempt id) is written when the attempt opens and stamped when it
  finishes. The streak is **computed, never stored**: consecutive academy days
  up to today (or yesterday, while today is still open) with at least one
  finished entry (`computeDailyStreak`).
- **Off** means no card, no page content and a 403 on start, for that batch's
  students (if none of their batches has it on) or everyone (academy off).

## API (`apps/api/src/puzzle/daily-puzzle.*`, `API_ROUTES.dailyPuzzle`)

| Route | Who |
|---|---|
| `GET /daily-puzzle` | student: today's three puzzles (no solutions), their level, today's results, streak |
| `POST /daily-puzzle/start` `{ level }` | student: opens or resumes today's `DAILY` attempt at that level |
| `GET /daily-puzzle/schedule?batchId=&from=` | admin (academy, or a batch) / coach (own batch): 14 days × 3 levels, what each resolves to and from where |
| `PUT /daily-puzzle/overrides` `{ batchId?, day, level, puzzleId \| null }` | admin (academy or any batch) / coach (own batch): set or clear one |
| `PUT /daily-puzzle/settings` `{ enabled }` | admin: academy on/off |
| `PATCH /daily-puzzle/batches/:id` `{ enabled }` | admin / coach of the batch: batch on/off |

## Web

`features/daily-puzzle/`.

- **Student**: `/student/daily-puzzle` ("Puzzle of the Day" in the menu;
  `DailyPuzzleClient`): streak tiles, the three levels (their own marked),
  "Solve today's puzzle" opens the DAILY attempt and the ordinary solver
  (`usePuzzleAttempt`, which resumes it). A level finished earlier shows its
  result; one finished just now keeps the board with the solution. Dashboard
  side-rail card `DailyPuzzleDashboardCard` (hidden when off or empty).
- **Admin**: `/admin/daily-puzzle` (Learning): "Whole academy" or any active
  batch, the on/off switch, 14 days × 3 levels with their source (Automatic /
  Academy pick / Batch pick), Change (search the published library) and Reset.
- **Coach**: `/coach/daily-puzzle`, the same for each active batch they teach.
- A day that hasn't come yet with no override shows "Picked automatically on
  the day": the automatic pick happens on the first read of that day.

## Data

`DailyPuzzle` (academy or batch scope, day, level, puzzle, source AUTO / ADMIN
/ COACH, who set it), `DailyPuzzleEntry` (student, day, level, attempt,
finished, solved), `DailyPuzzleSettings` (one row per academy),
`Batch.dailyPuzzleEnabled`. Entries are the student's data: privacy export
section `dailyPuzzleEntries`. Step 2: `StudentProfile.dailyPuzzleWhatsAppAt`
(the student's switch; exported with `studentProfile`),
`WhatsAppContact.dailyPuzzleAt` (a number's PUZZLE; cleared when staff erase the
contact), `MessagingRule.scheduleDays`.

## Step 2 — WhatsApp

### Owner's calls (2026-11-21)

| Question | Answer |
|---|---|
| Meta template | Each academy's **admin picks** an approved template on the rule (the existing template picker). The rule ships off |
| Cost | Meta charges the academy per message. **The admin chooses the days** it sends (and the time); at most one message per number per day |
| Opt-in | **In-app switch** (the student's own account phone) **or** the keyword **PUZZLE** sent to the academy's WhatsApp; PUZZLE OFF or STOP ends it |
| Unverified parent numbers | **Only numbers that opted in**, and the message carries **no student data** (no name, streak or result), just the puzzle and a link that needs sign-in. The typed-in `StudentProfile.parentPhone` is never used ([PARENT_REPORTS.md](PARENT_REPORTS.md)) |

### How it works

- **The rule**: messaging event `DAILY_PUZZLE` ("Puzzle of the Day (WhatsApp)",
  `/admin/messaging`), WhatsApp only (`whatsappOnly`: the rule service refuses
  in-app or email). DAILY at 7:00 by default (daily or weekly only, `scheduledOnly`), read in the **academy's** time zone
  (`academyTimeZone`), on the days the admin picks (`MessagingRule.scheduleDays`,
  see [MESSAGING.md](MESSAGING.md) "Send days"). Placeholders: `{{academy.name}}`,
  `{{dailyPuzzle.date}}`, `{{links.dailyPuzzle}}`, nothing about the student.
  "Sending" = rule on + WhatsApp channel on + the academy's WhatsApp connected.
- **Who gets it** (`DailyPuzzleWhatsAppService`, `puzzle/daily-puzzle-whatsapp.service.ts`):
  - a student who turned it on (`StudentProfile.dailyPuzzleWhatsAppAt`), to
    `User.phoneNumber`, while Puzzle of the Day is on for one of their batches;
  - a number that sent PUZZLE (`WhatsAppContact.dailyPuzzleAt`), not STOPped.
    Needs the academy's support bot on, because the bot reads the keyword
    ([WHATSAPP_SUPPORT.md](WHATSAPP_SUPPORT.md) "Puzzle of the Day keywords").
  Both only while the academy has Puzzle of the Day on.
- **Sending**: hourly cron per academy (`JOB_LOCKS.dailyPuzzleWhatsApp`); within
  the hour before the rule's next send time it dispatches `DAILY_PUZZLE` for the
  academy day of that send. `MessagingDispatchService` makes one WhatsApp outbox
  row per number (a number reached both ways is sent once, kept on the student);
  dedupe key `DAILY_PUZZLE:<number>:<day>`, so re-runs never send twice. A
  student without a usable phone is logged SKIPPED. The outbox worker sends it
  like any rule and still checks STOP at send time.
- **Turning it off** (switch off, PUZZLE OFF, or erasing the contact) also marks
  that number's still-queued row SKIPPED (`cancelQueuedDailyPuzzle`).
- **Admin view**: the academy schedule (`/admin/daily-puzzle`, "Whole academy")
  shows whether it is sending, when, and how many students and keyword numbers
  it reaches, with a link to the rule.

| Route | Who |
|---|---|
| `GET /daily-puzzle` → `whatsapp` | student: available, on, masked phone, schedule |
| `PUT /daily-puzzle/whatsapp` `{ on }` | student: their own switch; 400 when the academy doesn't send it or the account has no usable phone |
| `GET /daily-puzzle/schedule` → `whatsapp` | admin, academy scope: `{ sending, schedule, appStudents, keywordNumbers }` (null for a batch) |

### Setting it up (an academy admin)

1. Create a template in WhatsApp Manager and wait for Meta to approve it. Meta
   will likely class it as **Marketing**. Suggested body, with one value:
   > Today's Puzzle of the Day from {{1}} is ready: Easy, Medium and Hard. Can you solve it? Reply PUZZLE OFF to stop.

   with a **URL button** to the academy's `/student/daily-puzzle` (a static URL
   button needs no value). If the template puts the link in the body instead, add a
   second value `{{links.dailyPuzzle}}`.
2. Messaging → "Puzzle of the Day (WhatsApp)": pick the template, set the value(s)
   (`{{academy.name}}`…), the days and the time, turn it on, and Send test.
3. Tell families: turn it on from the Puzzle of the Day page, or send PUZZLE to
   the academy's WhatsApp (needs the support bot on).

### Not built yet

- A **board picture** in the message (an image header). Needs a public,
  unguessable image link per day and level that Meta can fetch, rendered from
  the FEN; the message would then be the puzzle itself, not only a link.
- Answering the puzzle **by replying** on WhatsApp.
