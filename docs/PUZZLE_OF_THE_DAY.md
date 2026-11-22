# Puzzle of the Day

A daily puzzle for every student, at three levels, with a streak. Step 1 is
in the app; step 2 sends it on WhatsApp to every student account's phone
(the student can switch it off in the app); step 3 adds a board picture and
answering by reply. Feature 6 of [UNIQUE_FEATURES_PROPOSAL.md](UNIQUE_FEATURES_PROPOSAL.md).

**Status:** step 1 built 2026-11-21 on `dev` (API, student page and card, admin and coach schedule). Step 2 (WhatsApp) built 2026-11-21 on `dev`, off by default. Step 3 (board picture, answering by reply) and step 2's change to the owner's final calls built 2026-11-21 night run on `feat/daily-puzzle-whatsapp-step3` (PR into `dev`). None of it tried against Meta with a real approved template yet.

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
| `PUT /daily-puzzle/settings` `{ enabled?, whatsapp? }` | admin: academy on/off; step 3's picture level and reply limits |
| `GET /daily-puzzle/picture/:token` | **public**: the WhatsApp picture's position (step 3); the signed token is the credential |
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
section `dailyPuzzleEntries`. Step 2: `StudentProfile.dailyPuzzleWhatsAppOffAt`
(the student switched it off; exported with `studentProfile`),
`MessagingRule.scheduleDays`. Step 3: `DailyPuzzleSettings.whatsappLevel`,
`whatsappMaxTries`, `whatsappHintAfter`, `whatsappAnswerAfter`;
`DailyPuzzleEntry.whatsappTries`, `whatsappHintAt` (exported with the entries);
`MessageDelivery.imageLink`; `MessagingRule.whatsappTemplateImageHeader`. No
longer read, kept because migrations stay additive: `StudentProfile.dailyPuzzleWhatsAppAt` (the first version's opt-in) and
`WhatsAppContact.dailyPuzzleAt` (its PUZZLE keyword; cleared when staff erase the
contact).

## Step 2 — WhatsApp

### Owner's calls (2026-11-21, final)

| Question | Answer |
|---|---|
| Meta template | Each academy's **admin picks** an approved template on the rule (the existing template picker). The rule ships off |
| Cost | Meta charges the academy per message. **The admin chooses the days** it sends (and the time); at most one message per number per day |
| Who gets it | **Every student account's phone, automatically** (`User.phoneNumber`), while the admin has the rule on and the student's Puzzle of the Day is on. Only student accounts: the typed-in `StudentProfile.parentPhone` is never used ([PARENT_REPORTS.md](PARENT_REPORTS.md)) |
| On/off | **The student's switch in the app is the only on/off** (on by default). No WhatsApp keywords. STOP (WhatsApp-wide) still blocks every proactive message |
| A phone on 2+ student accounts | Sent **once, link only** (we can't tell which student) |
| Streak | **Per account**: the student's one streak, never a streak per phone number |
| Student data in the message | None in step 2 (puzzle + link that needs sign-in) |

The first version (35ed3273, same day) was opt-in and let any number sign up
with PUZZLE / PUZZLE OFF; step 3 phase 0 changed it to the calls above.

### How it works

- **The rule**: messaging event `DAILY_PUZZLE` ("Puzzle of the Day (WhatsApp)",
  `/admin/messaging`), WhatsApp only (`whatsappOnly`: the rule service refuses
  in-app or email). DAILY at 7:00 by default (daily or weekly only, `scheduledOnly`), read in the **academy's** time zone
  (`academyTimeZone`), on the days the admin picks (`MessagingRule.scheduleDays`,
  see [MESSAGING.md](MESSAGING.md) "Send days"). Placeholders: `{{academy.name}}`,
  `{{dailyPuzzle.date}}`, `{{links.dailyPuzzle}}`, nothing about the student.
  "Sending" = rule on + WhatsApp channel on + the academy's WhatsApp connected.
- **Who gets it** (`loadDailyPuzzleAudience`, `messaging/daily-puzzle-deliveries.ts`,
  the one rule, used by the send and the admin summary): every active student
  whose Puzzle of the Day is on (a batch with training and the daily puzzle on,
  academy not off), on `User.phoneNumber` normalized like a send, unless they
  switched it off (`StudentProfile.dailyPuzzleWhatsAppOffAt`). Never a bare
  WhatsApp contact, never `parentPhone`. A student with no or an unusable phone
  is skipped quietly (no row per student per day; the admin page counts them).
  A number on **2+ active student accounts** (any of them, on or off) is sent
  once, link only (`studentId: null` in the audience).
- **Sending**: hourly cron per academy (`JOB_LOCKS.dailyPuzzleWhatsApp`); within
  the hour before the rule's next send time it dispatches `DAILY_PUZZLE` for the
  academy day of that send. `MessagingDispatchService` makes one WhatsApp outbox
  row per number (the first student on it is the row's recipient); dedupe key
  `DAILY_PUZZLE:<number>:<day>`, so re-runs never send twice. The outbox worker
  sends it like any rule and checks STOP at send time.
- **Switching off** also marks that number's still-queued row SKIPPED
  (`cancelQueuedDailyPuzzle`), unless another student on the same number still
  has it on.
- **Admin view**: the academy schedule (`/admin/daily-puzzle`, "Whole academy")
  shows whether it is sending, when, students and numbers it reaches (shared
  numbers among them), students who turned it off, students with no usable
  phone, a consent reminder, and a link to the rule.

| Route | Who |
|---|---|
| `GET /daily-puzzle` → `whatsapp` | student: available, on, masked phone, schedule, `sharedPhone` |
| `PUT /daily-puzzle/whatsapp` `{ on }` | student: their own switch (400 without a student profile) |
| `GET /daily-puzzle/schedule` → `whatsapp` | admin, academy scope: `{ sending, schedule, students, numbers, sharedNumbers, turnedOff, noPhone }` (null for a batch) |

### Setting it up (an academy admin)

1. Create a template in WhatsApp Manager and wait for Meta to approve it. Meta
   will likely class it as **Marketing**. Suggested body, with one value:
   > Today's Puzzle of the Day from {{1}} is ready: Easy, Medium and Hard. Can you solve it? You can turn these off on the Puzzle of the Day page.

   with a **URL button** to the academy's `/student/daily-puzzle` (a static URL
   button needs no value). If the template puts the link in the body instead, add a
   second value `{{links.dailyPuzzle}}`.
2. Messaging → "Puzzle of the Day (WhatsApp)": pick the template, set the value(s)
   (`{{academy.name}}`…), the days and the time, turn it on, and Send test.
3. **Consent:** Meta expects people to have agreed to business messages. Tell
   families at registration or in the welcome message ("a daily chess puzzle on
   WhatsApp; reply STOP anytime"). Nothing in the app asks for it.

## Step 3 — board picture and answering by reply

Built 2026-11-21 night run (`feat/daily-puzzle-whatsapp-step3`), with step 2's
change to the final calls (phase 0) first.

### Owner's calls (2026-11-21)

| Question | Answer |
|---|---|
| Picture in the message | **Yes**: the puzzle's position as an image at the top of the WhatsApp message |
| Which level is pictured | Default taken: **the admin picks one level** on the Puzzle of the Day page, starting at **Medium** |
| A batch's own (coach's private) puzzle | Default taken: the picture is always the **academy-wide** puzzle for that level, never a batch's private one |
| Answering by reply | **Yes** |
| Who gets it at all (owner, later on 2026-11-21; **changes step 2**) | **Every student account's phone, automatically** (no opt-in): each active student whose Puzzle of the Day is on gets it on `User.phoneNumber`, once the admin turns the rule on. **The student's app switch is the only on/off** (on by default); no PUZZLE / PUZZLE OFF keywords. `STOP` (WhatsApp-wide, existing) still blocks it. A number on **no** student account gets nothing |
| Whose streak a reply counts for | **Per account**: the student's one streak (the same as the app); the phone is on **exactly one** such student account → the answer is that student's daily puzzle (entry, attempt, streak and rating). **Never a streak per phone number** |
| A phone on 2+ student accounts (siblings) | Sent **once, link only**: no picture answering, replies not checked, no streak (we can't tell who answered) |
| What must be right | **The first move only** (the key move). Then "Correct!" and the link to play out the rest in the app |
| Tries | **Admin-set per academy**: maximum tries, wrong tries before a hint can be asked for, wrong tries before the answer can be asked for. Defaults taken: max 3, hint after 1, answer after 3 (hint ≤ answer ≤ max) |

### How it works

- **Picture.** When the hourly sweep queues the day's messages it first
  resolves (and if needed picks) the **academy-wide** puzzle at the pictured
  level (`DailyPuzzleService.academyPuzzle`, never a batch's own pick), then
  signs a link to it (`puzzle/daily-puzzle-picture.ts`: HMAC-SHA256 over
  academy, day, level and puzzle id; valid for the day and 3 days after). The
  key is `DAILY_PUZZLE_PICTURE_SECRET`, else one derived from
  `CREDENTIALS_ENCRYPTION_KEY` / `MFA_ENCRYPTION_KEY` (never a JWT secret);
  none = no picture, the message goes as in step 2.
- **Drawing it.** The web route `/daily-puzzle-picture/<token>.png`
  (`app/daily-puzzle-picture/[token]/route.ts`, public, outside the middleware)
  asks the API `GET /daily-puzzle/picture/:token` (public, `PUBLIC_ROUTES`;
  it re-checks the signature and that the puzzle is still one of the academy's
  picks for that day and level) for the position and the academy's board look,
  and draws an 824×888 PNG with `next/og`
  (`features/chess-appearance/lib/boardPicture.tsx`: square colours copied from
  `boards.css`, the vendored piece SVGs, coordinates, flipped when Black is to
  move, "White/Black to move" under it). No solution, no student data. Cached
  a day (same picture for every number).
- **Sending it.** The rule's `pictureVariable` is `links.dailyPuzzlePicture`.
  `MessagingDispatchService` stores the link on the outbox row
  (`MessageDelivery.imageLink`): with an approved template only when the rule
  says the template has an IMAGE header (`whatsappTemplateImageHeader`, a
  switch in the rule editor; then every number gets it, a shared one too,
  because the template can't go without; no picture that day = SKIPPED); with
  free text, the student's own number gets the picture with the text as its
  caption and a shared number the text only. `WhatsAppService.trySendMessage`
  sends it as the template's image header or an `image` message.
- **Answering** (`DailyPuzzleAnswerService.reply`, called by the support bot
  first for every typed text, inside its transaction under the contact's lock,
  not while staff own the conversation; null = the bot goes on as before, its
  state untouched). It answers only when the academy sends the rule, Puzzle of
  the Day is on, and the number's message for **today** was SENT with a picture
  link (the link's signed claims name the day, level and puzzle). So the
  academy's **support bot must be on** for replies to arrive.
  - `parseDailyPuzzleReply` (`@nexa-chess/types`): `HINT`, `ANSWER`, or text
    shaped like a move (SAN or UCI; `+ # ! ?` optional; castling with O or 0);
    anything else goes to the bot.
  - The number must be the account phone of **exactly one** active student
    (any active student account counts): else "more than one student uses this
    number, solve it in the app".
  - The student's `DailyPuzzleEntry` for the pictured level is opened with the
    pictured puzzle (a `DAILY` attempt through `PuzzleAttemptService`), unless
    they started that level in the app (then: finish it there) or already
    finished it (then: their result and streak).
  - The move is read by the game engine in the puzzle position (SAN as
    written, then with a lower-case piece letter capitalised, then UCI);
    illegal = "isn't possible", not a try. Right or wrong is
    `solveLineFeedback` on the first move (any mate counts where the line ends
    in mate).
  - Right → the attempt is finished SOLVED (100%) and the reply says "Correct!",
    the streak and the link (play out the rest in the app when the line is
    longer). Wrong → `whatsappTries` + the attempt's `wrongMoves` go up; at the
    limit the attempt is finished FAILED with the answer, and the streak still
    counts (finishing keeps it). HINT after `hintAfter` wrong tries: the
    puzzle's own first hint, else which piece moves (never the square);
    counted once in `hintsUsed`. ANSWER after `answerAfter` wrong tries:
    finishes it FAILED with the answer.
  - Rating and analytics run after the bot's transaction commits, like a
    finished attempt in the app.
- **Settings** (admin, `/admin/daily-puzzle` → Whole academy → "Picture and
  answering by reply"): pictured level (Medium), wrong tries allowed (3), hint
  after (1), answer after (3); hint ≤ answer ≤ max, max 10.
- **Rule editor**: "The template has an image header" switch (only on rules with
  a `pictureVariable`). The test send of such a rule uses the site's share image
  (`/opengraph-image`) as the picture.

### Setting it up (on top of step 2)

1. Make the WhatsApp template with an **Image** header (a sample picture is
   enough for approval), e.g. body "Today's Puzzle of the Day from {{1}}: can you
   solve it? Reply with your move, like Nf3." and the URL button to
   `/student/daily-puzzle`. Turn on "The template has an image header" on the
   rule. Without an image header the message goes without the picture and
   replies aren't checked.
2. Turn on the academy's WhatsApp support bot, so replies reach the academy.
3. Optionally set the pictured level and the reply limits on the Puzzle of the
   Day page.

### Still not planned

- Playing out the whole line on WhatsApp move by move.
