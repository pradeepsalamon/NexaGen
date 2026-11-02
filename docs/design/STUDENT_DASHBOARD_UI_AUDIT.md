# NexaChess Student Dashboard — Deep UI & Data Audit for Redesign

**Document Status:** Final Audit & Redesign Specification  
**Role:** Senior Product Designer, UX Researcher, Frontend Architect & EdTech Product Specialist  
**Audience:** NexaChess Product, Design, and Engineering Teams  
**Target File:** `docs/design/STUDENT_DASHBOARD_UI_AUDIT.md`  
**Date:** November 2026  
**Scope:** Strict inspection of live code, Prisma schemas, API controllers, and frontend routes. Zero mock data or invented backend capabilities.

---

## 1. Executive Summary

### 1.1 Context and Purpose
NexaChess is a modern, high-performance chess academy platform built with Next.js (App Router), NestJS, PostgreSQL/Prisma, LiveKit (real-time video and chess board classrooms), and Stockfish engine integration. It caters to a wide spectrum of students—from young beginners (ratings 600–1000) learning tactical fundamentals to ambitious competitive players (ratings 1500–2000+) seeking master-level coaching, deep game analysis, and spaced-repetition training.

This audit is an exhaustive, code-grounded inspection of the existing **Student Dashboard** (`/student`) and its satellite learning environments (`/student/progress`, `/student/insights`, `/student/practice`, `/student/training`, `/student/revision`, `/student/courses`, `/student/schedule`, `/student/attendance`, `/student/billing`, `/student/batches`, `/games`, `/messages`).

### 1.2 The Core Problem
The current student dashboard operates primarily as an **administrative ERP course viewer** rather than a **motivating, high-performance chess training cockpit**.

When a student logs in today:
1. **Chess Identity is Missing:** The hero section and primary stat cards display administrative metrics ("Classes Attended: 4", "Lessons Completed: 12", "Attendance: 92%"). The student's core chess identity—**Current Rating**, **Peak Rating**, and **Daily Practice Streak**—is nowhere to be found on the main screen. The student must navigate away to `/student/progress` to see how they are rated.
2. **Tactical Insights are Buried:** NexaChess already houses an engine-driven game analysis pipeline (`StudentGameInsights`, `MotifInsight`) evaluating centipawn loss, blunder rates, and tactical motifs (Pins, Forks, Skewers, Discovered Attacks) with automated verdicts ("Strength", "Recurring Weakness"). Yet, zero tactical insights appear on the dashboard; they remain hidden under `/student/insights`.
3. **Fragmented Learning Actions:** Daily practice is scattered across four disparate screens: coach assignments (`/student/practice`), adaptive rated puzzles (`/student/training`), spaced-repetition error flashcards (`/student/revision`), and playlist curricula (`/student/courses`). The dashboard does not unify these into a clear **"Today's Chess Training Loop"**.
4. **Alert Fatigue and Visual Redundancy:** Students entering `/student` are frequently bombarded with stacked alert surfaces: an `AssignmentReminderPopup` modal, a full-width `AssignmentReminderBanner` alert, a `DashboardFeedback` modal prompt, a `NextClassCard` hero, and an `UpcomingClasses` card that repeats the exact same class below it.
5. **No Chess Presence:** Despite being a chess academy, the main dashboard contains zero chess board previews, no daily puzzle teaser, and no visual chess artifacts, relying instead on generic decorative SVG vector illustrations.

### 1.3 Redesign Objectives
Transform the NexaChess Student Dashboard into an authoritative, personalized, and motivating command center that instantly answers the seven critical student questions:
1. **Where am I currently?** (Rating, batch, coach, streak)
2. **How am I progressing?** (Rating trajectory, solve accuracy, academy consistency)
3. **What am I good at?** (Recognized tactical strengths: e.g., Pins, Deflections)
4. **Where do I need improvement?** (Identified tactical weaknesses: e.g., Knight Forks, Endgame conversions)
5. **What should I learn next?** (Curriculum progress & coach-assigned homework)
6. **When is my next class?** (Next class countdown, 1-click LiveKit room entry, coach presence)
7. **What should I do today?** (A unified, 3-step Daily Training Loop)

All recommendations strictly adhere to existing business logic, database relationships, security constraints, and the **NexaChess Design System v2** (`docs/UI_RULES.md`).

---

## 2. Current Dashboard Structure

### 2.1 Route Architecture & Layout
The student experience is centered around `apps/web/src/app/student/page.tsx`, which mounts `StudentDashboardClient.tsx` wrapped in `StudentDashboardLayout` (`apps/web/src/app/student/layout.tsx`). The layout supplies the global `AppShell`, role-based navigation drawer (`RoleSidebar` -> `StudentSidebar`), and a maximum content width container (`max-w-[1180px]`).

### 2.2 Component Breakdown of the Current Home Page (`/student`)

```
StudentDashboardClient (`/student`)
 ├── Header: Welcome Back, {firstName}! + Batch subtitle + "My Progress" CTA button
 ├── AssignmentReminderPopup (Modal on mount if assignments are due/overdue)
 ├── AssignmentReminderBanner (Top alert banner with left accent border)
 ├── DashboardFeedback (Modal prompt to rate completed classes)
 ├── NextClassCard (Dynamic: Live class banner OR Next scheduled class OR "No classes" empty card)
 ├── ProgressOverview (3-column stat grid: Classes Attended, Lessons Completed, Attendance %)
 ├── RevisionDashboardCard (Smart Revision summary: Due today, Overdue, New, Done today, Streak, CTA)
 ├── 2-Column Responsive Grid (`lg:grid-cols-2`):
 │    ├── UpcomingClasses (List of next 3 scheduled classes with date blocks and Join buttons)
 │    ├── PracticeSection (List of up to 5 assignments with difficulty badges and due dates)
 │    ├── ContinueLearning (Rendered only if enrolled courses > 0: title, module, progress bar)
 │    └── Announcements (Rendered only if active announcements exist: title, date, description)
 └── PastClasses (Table of up to 10 completed/cancelled classes with "Watch" and "Download" buttons)
```

### 2.3 Sidebar Navigation (`StudentSidebar.tsx`)
The student sidebar defines 17 items (subject to subscription plan gating via `filterNavByPlan`):
1. **Dashboard** (`/student`)
2. **Schedule** (`/student/schedule`)
3. **Live classes** (`/student/live-classes`)
4. **My batches** (`/student/batches`)
5. **Assignments** (`/student/practice`)
6. **Puzzle training** (`/student/training`)
7. **Smart revision** (`/student/revision` — feature gated: `smartRevision`)
8. **Progress** (`/student/progress`)
9. **Game insights** (`/student/insights` — feature gated: `gameAnalysis`)
10. **My courses** (`/student/courses` — feature gated: `courses`)
11. **Messages** (`/messages` — feature gated: `directChat`)
12. **Game library** (`/games` — feature gated: `gameLibrary`)
13. **Attendance** (`/student/attendance`)
14. **Billing** (`/student/billing` — feature gated: `studentPayments`)
15. **Help centre** (`/help`)
16. **Chess board** (`/chess-board`)
17. **Profile & settings** (`/profile`)

Live status badges appear dynamically on `/student/live-classes` ("Live" blinking pill), `/student/schedule` ("X Today"), `/student/practice` (overdue/due count), `/student/attendance` (percentage chip), and `/messages` (unread chat count).

---

## 3. Existing UI Observations & Screen Walkthrough

### Screen 1: Top Bar & Greeting Header
- **Elements:** Fixed 64px header (`Header.tsx`) with Brand Logo, current page title, unread `NotificationBell`, `ThemeToggle` (light/dark), and `UserNavMenu`.
- **Greeting Section:** `Welcome back, {firstName}!` in `text-2xl font-bold font-display`. Subtitle displays either `data.batchName` or a fallback inspirational quote: *"Keep learning, keep improving. Chess is a journey, and you're on the right track!"*.
- **Top Action:** Secondary button `<Button asChild><Link href="/student/progress">My Progress -></Link></Button>`.
- **Observation:** The greeting is pleasant, but immediately funnels the user away from the dashboard to `/student/progress` to see actual progress metrics.

### Screen 2: Modal Popups & Alert Stacking
- **Elements:** 
  - `AssignmentReminderPopup`: Evaluates `counts.overdue` and `counts.dueToday`. If present, renders a modal on first load.
  - `DashboardFeedback`: Evaluates pending post-class feedback questionnaires. If present and not dismissed in `sessionStorage`, triggers another dialog.
  - `AssignmentReminderBanner`: A full-width `rounded-2xl border-l-4` card in warning or danger tone listing urgent assignments.
- **Observation:** A student logging in on a class day can be confronted with two stacked modal dialogs and a large alert banner before even seeing their class or training materials. This creates severe banner blindness and annoyance.

### Screen 3: Next Class Hero Card (`NextClassCard.tsx`)
- **Elements:**
  - *If Live:* Prominent card with a pulsing red beacon, "Live now", topic title, coach name, elapsed timer (`live for MM:SS`), ends-at time, and a red `<Button variant="destructive">Join class</Button>`. Also warns if coach has not yet connected (`Waiting for your coach to join`).
  - *If Scheduled:* Shows topic, starts-at time, relative day (e.g. "Today"), coach name, and a neutral "Join Class" button (disabled until started) or "View class".
  - *If None:* CalendarX2 icon with "No classes scheduled" and "View Assignments" button.
- **Observation:** This is one of the strongest components in the current dashboard. The live timer, coach presence check, and direct join action are excellent. However, when a class is not live, it takes up substantial vertical space while communicating minimal information.

### Screen 4: Progress Overview Tiles (`ProgressOverview.tsx`)
- **Elements:** A 3-column grid of rounded cards containing:
  1. *Classes Attended:* Numeric value + GraduationCap icon + decorative chess piece watermark SVG.
  2. *Lessons Completed:* Numeric value + BookOpen icon + decorative book watermark SVG.
  3. *Attendance:* Percentage (e.g., 95%) + Target icon + decorative bar-chart watermark SVG.
- **Observation:** 
  - These metrics represent institutional attendance compliance, not chess capability.
  - A chess student cares primarily about their rating change, tactical sharpness, and streaks. Attendance % belongs in a secondary compliance box or the attendance sub-page.
  - The vector watermarks look dated and generic, clashing with the sleek, data-first EdTech aesthetic of the rest of the application.

### Screen 5: Smart Revision Card (`RevisionDashboardCard.tsx`)
- **Elements:** Full-width card with Brain icon, "Smart Revision" title, and a 4-column metric DL: *Due today*, *Overdue*, *New*, *Done today*. Below: session size (e.g. "5 items · about 8 min"), active streak ("4-day revision streak"), and primary CTA button "Start Revision".
- **Observation:** Extremely valuable functionality backed by an Anki-style spaced-repetition algorithm (`RevisionItem`). However, occupying full-width between the progress overview and the two-column grid stretches the 4 small metric tiles unnaturally on wide screens (1440px+).

### Screen 6: Asymmetrical 2-Column Grid
- **UpcomingClasses:** Displays the next 3 scheduled classes with day-month calendar blocks, topic, coach name, batch type badge, Join button, and "View class" link.
- **PracticeSection:** Displays up to 5 assignments with difficulty badge (Beginner, Intermediate, Advanced), due date, status badge, and "View all" link.
- **ContinueLearning:** Displayed only if `data.courses.length > 0`. Shows course title, next module name, progress percentage, and progress bar.
- **Announcements:** Displayed only if `data.announcements.length > 0`. Shows title, date, and markdown body.
- **Observation:** 
  - Having 4 potential cards in a 2-column grid creates awkward vertical gaps when row counts differ (e.g., 5 assignments on the right vs. 1 upcoming class on the left).
  - `UpcomingClasses` directly duplicates the class already highlighted in `NextClassCard` 200 pixels higher up.
  - Adaptive rated puzzle training (`/student/training`) has no card in this grid at all!

### Screen 7: Past Classes Section (`PastClasses.tsx`)
- **Elements:** List of the last 10 completed or cancelled classes with topic, coach, date, status, "Watch" button (which opens `RecordingPlayerDialog`), and a download icon button.
- **Observation:** Past class recordings are valuable, but listing 10 rows on the home dashboard pushes the page length past 2500px. A condensed widget of the 2-3 most recent recordings with a "View all recordings" link is significantly cleaner.

---

## 4. Complete Feature Inventory

Below is an exhaustive inventory of all student-facing capabilities in NexaChess, identifying their status, backend endpoints, and components.

| Feature / Page | URL / Route | Status | Available Information | Available Actions | APIs & Controllers | Components Used |
|---|---|---|---|---|---|---|
| **Student Dashboard** | `/student` | **Implemented** | Next class, batch name, 3 attendance metrics, revision summary, upcoming classes, assignments, courses, announcements, past recordings | Join live class, start revision, open assignment, open course, play recording, download recording | `GET /student/dashboard`, `GET /assignments/mine-reminders`, `GET /feedback/pending`, `GET /revision/me/summary` | `StudentDashboardClient`, `NextClassCard`, `ProgressOverview`, `RevisionDashboardCard`, `UpcomingClasses`, `PracticeSection`, `ContinueLearning`, `PastClasses`, `Announcements` |
| **Progress & Analytics** | `/student/progress` | **Implemented** | Puzzle rating, peak rating, day streak, longest streak, solve rate %, rating history graph, activity history feed, filterable by date/class/group | Switch tabs (Overview, Performance, History, Revision, Games), filter activity history | `GET /progress/me`, `GET /progress/me/history`, `GET /progress/me/summary` | `StudentProgressClient`, `StudentProgressWorkspace`, `ProgressView`, `ActivityFiltersBar`, `ActivityHistoryList`, `LineChartCard`, `StatTile` |
| **Game Insights** | `/student/insights` | **Implemented** | Connected accounts (Lichess/Chess.com), games analysed, White/Black accuracy, blunder/mistake/inaccuracy rates, tactical motif verdicts (Pins, Forks, Skewers, Discovered Attacks) | Connect Lichess/Chess.com account, trigger sync, filter analysed games, view game report | `GET /game-insights/me`, `GET /game-insights/me/games`, `GET /game-sources/accounts`, `POST /game-sources/accounts/sync` | `StudentInsightsClient`, `GameInsightsPanel`, `GameSourcesCard`, `Table`, `Badge`, `StatTile` |
| **Puzzle Training** | `/student/training` | **Implemented** | Adaptive rated puzzle matching student's rating, current rating, peak rating, day streak, theme badges, rating change delta | Solve interactive board, request hint, skip/pass, load next puzzle | `GET /puzzles/training`, `POST /puzzles/training/next`, `POST /puzzles/:id/attempts`, `POST /puzzles/:id/attempts/:id/submit` | `StudentTrainingClient`, `PracticeBoard`, `TrainBoard`, `StatTile` |
| **Smart Revision** | `/student/revision` | **Implemented** | Due today count, overdue count, active review items, retention rate, spaced-repetition card review session | Start review session, play move on board, submit recall grade (Again, Hard, Good, Easy), skip item | `GET /revision/me/session`, `POST /revision/me/next`, `POST /revision/me/review`, `POST /revision/me/skip`, `GET /revision/me/report` | `StudentRevisionClient`, `RevisionItemBoard`, `RevisionReportPanel` |
| **Assignments & Practice** | `/student/practice`, `/student/practice/[id]` | **Implemented** | List of pending and completed coach assignments, due dates, difficulty, best score %, best accuracy %, attempt counts | Open assignment, replay PGN lines, solve puzzle set, take MCQ test, playout position vs Stockfish | `GET /assignments/mine`, `GET /assignments/mine/:id`, `POST /assignments/mine/:id/attempts` | `StudentAssignmentsClient`, `AssignmentCard`, `AssignmentDetailClient`, `SolveLineBoard` |
| **Courses & Curricula** | `/student/courses`, `/student/courses/[id]` | **Implemented** | List of enrolled courses, course description, module progress %, completed vs total modules | View syllabus, open module, complete module, watch embedded content | `GET /courses/mine`, `GET /courses/mine/:id`, `POST /courses/mine/:id/modules/:id/complete` | `StudentCoursesClient`, `CourseDetailClient`, `ModuleList` |
| **Live Classroom** | `/live-class/[roomId]` | **Implemented** | Real-time video/audio, interactive shared board, simul games, puzzle rush, move polls, chat, in-class leaderboard | Audio/video mute, board moves, submit puzzle solution, vote in poll, raise hand, screen share request | `GET /live-class/:id`, LiveKit WebSocket, `POST /live-class/:id/heartbeat` | `LiveClassClient`, `ClassroomTopBar`, `InteractivePanel`, `MeetingLayout` |
| **Class Details** | `/classes/[id]` | **Implemented** | Session topic, coach bio, starts/ends at, objectives, homework description, student's own attendance score | Join class (if live), watch recording, read homework | `GET /student/classes/:id` | `StudentClassDetailsClient`, `ClassStatusBadge`, `Button` |
| **Schedule Calendar** | `/student/schedule` | **Implemented** | Monthly/weekly schedule calendar, scheduled batch classes, status indicators (Scheduled, Live, Completed, Cancelled) | Filter by batch, jump month/week, click class for details / join | `GET /batch-schedules/calendar`, `GET /batches` | `StudentScheduleClient`, `CalendarGrid`, `Select` |
| **My Batches** | `/student/batches` | **Implemented** | Enrolled batches, assigned head coaches, batch schedule rules, student peers count | View batch details, jump to batch schedule | `GET /batches` (student-filtered) | `StudentBatchesClient`, `BatchCard`, `BatchStatusBadge` |
| **Game Library** | `/games`, `/games/[id]` | **Implemented** | All imported and played games (Lichess, Chess.com, NexaGen classes, uploaded PGNs), result, eco code, date | Search/filter games, upload PGN, request Stockfish analysis, view interactive PGN board | `GET /games`, `POST /games/import-pgn`, `GET /games/:id`, `POST /game-analysis/request` | `GameLibraryClient`, `GameViewerClient`, `ImportGameDialog` |
| **Attendance History** | `/student/attendance` | **Implemented** | Attendance % summary, classes attended, classes absent, late count, detailed per-class log with entry/exit times | Filter date range, click class to inspect entry/exit disconnect audit logs | `GET /attendance/student`, `GET /attendance/class/:id/logs/:studentId` | `StudentAttendancePage`, `StudentAttendanceView`, `AttendanceLogDialog` |
| **Billing & Invoices** | `/student/billing`, `/student/billing/invoices/[id]` | **Implemented** | Current subscription plan, status, renewal date, past invoices, credit notes, payment receipts | Download invoice PDF, view HTML invoice, update billing profile, cancel subscription | `GET /payments/mine`, `GET /payments/subscriptions/mine`, `GET /invoices`, `GET /invoices/:id/pdf` | `BillingClient`, `BillingProfileForm`, `InvoiceBadges` |
| **Direct Chat** | `/messages` | **Implemented** | 1:1 direct conversations with assigned coaches, batch group chats, unread counters | Send text message, view coach replies | `GET /chat/conversations`, `GET /chat/messages`, `POST /chat/messages` | `MessagesClient`, `ChatThread`, `ChatInput` |
| **Interactive Board** | `/chess-board` | **Implemented** | Sandbox chess board, custom piece/board theme selector, FEN/PGN import | Play moves, flip board, clear board, test engine evaluation | Local state + `UserChessAppearancePreference` | `ChessboardWorkspace`, `BoardControls` |
| **Student Profile** | `/profile` | **Implemented** | Name, email, phone, parent details, FIDE rating, timezone, MFA security, typography preferences | Update profile, change password, enable 2FA, adjust font size, request account deletion | `GET /auth/me`, `PATCH /auth/profile`, `POST /auth/mfa/setup` | `ProfilePage`, `ProfileForm`, `TwoFactorSettings`, `UserTypographySettings` |
| **Leaderboards** | — | **Partially Implemented** | Exists ONLY inside Live Classroom sessions (`LiveClassPuzzleAssignment.leaderboardJson`) and assignment puzzle sets. | View live puzzle standings during class | In-class LiveKit / DB JSON | `LiveClassLeaderboard` (in-class only) |
| **Tournaments** | — | **Not Implemented** | No models or routes exist in the repository. | None | None | None |
| **Achievements / Badges** | — | **Not Implemented** | No database model or persistent tracking of badges/trophies. Only day streaks and peak ratings exist. | None | None | None |

---

## 5. Deep Backend and Data Availability Matrix

This matrix documents the exact backend data reality. We distinguish between data stored in the database, exposed via APIs, currently rendered on the dashboard, and missing gaps.

| Data Item | Available in DB? | Source Model & DB Fields | API Endpoint | Current Dashboard Usage | Gap / Redesign Opportunity |
|---|---|---|---|---|---|
| **Student Identity & Level** | **Yes** | `User.firstName`, `User.avatarUrl`, `StudentProfile.experienceLevel`, `StudentProfile.fideId` | `GET /auth/me`, `GET /student/dashboard` | Shows `firstName` only in greeting. | **High Value:** Display experience level (Beginner/Intermediate/Advanced) or FIDE ID on hero badge. |
| **Chess Rating (FIDE / Internal)** | **Yes** | `StudentProfile.chessRating` | `GET /student/dashboard` (`chessRating`) | Exposed in API response (`data.chessRating`), but **never displayed** in UI! | **P0 Critical:** The API already sends `chessRating` to the frontend, but `StudentDashboardClient` literally drops it on the floor. |
| **Puzzle Rating & Peak** | **Yes** | `StudentProgress.puzzleRating`, `StudentProgress.peakRating` | `GET /progress/me`, `GET /puzzles/training` | Displayed only on `/student/progress` and `/student/training`. **Missing from dashboard.** | **P0 Critical:** This is the student's primary active skill score. Must be elevated to the dashboard header. |
| **Day Streak (Active & Best)** | **Yes** | `StudentProgress.currentStreak`, `StudentProgress.longestStreak`, `StudentProgress.lastActiveDay` | `GET /progress/me`, `GET /revision/me/summary` | Shown only inside `RevisionDashboardCard` as a small subtext (e.g. "4-day revision streak"). | **P0 Critical:** Daily streak is the #1 retention driver in EdTech (Duolingo pattern). Deserves hero placement. |
| **Next / Live Class Details** | **Yes** | `CoachClass.startsAt`, `CoachClass.endsAt`, `CoachClass.topic`, `CoachClass.status`, `LiveSession.startedAt`, `CoachProfile` | `GET /student/dashboard` (`liveClass`, `todaysClass`, `nextClasses`) | Displayed prominently in `NextClassCard` and `UpcomingClasses`. | **Partially Redundant:** Redundantly displayed in both top card and lower card. Needs unification. |
| **Live Room Presence & Counts** | **Yes** | LiveKit server query: `listParticipants(roomName)`, participant count, coach present | `GET /student/dashboard` (`liveClass.participantCount`, `liveClass.coachPresent`) | Displayed in `NextClassCard` (shows elapsed time, coach presence). | **Excellent Feature:** Working properly. Should be retained and visually polished. |
| **Past Recordings** | **Yes** | `CoachClass.liveSession.recordingUrl` | `GET /student/dashboard` (`pastClasses`), `GET /live-class/:id/recording-download` | Displayed in `PastClasses` table (up to 10 rows with Watch and Download). | **Poor Density:** Takes 10 rows of vertical space. Needs condensation to 2-3 recent cards. |
| **Attendance % & Count** | **Yes** | `ClassAttendance.status`, `ClassAttendance.totalDuration`, `AttendanceReportService` | `GET /student/dashboard` (`progressMetrics`), `GET /attendance/student` | Highlighted as the 3 main hero tiles in `ProgressOverview`. | **Overemphasized:** Displays administrative compliance instead of learning motivation. Demote to secondary section. |
| **Course Progress & Syllabus** | **Yes** | `StudentCourseProgress.progressPercent`, `StudentModuleProgress`, `Course.title`, `CourseModule.title` | `GET /student/dashboard` (`courses`), `GET /courses/mine` | Shown in `ContinueLearning` (course title, next module, progress %). | **Good:** Functional, but needs direct "Resume Lesson" deep-link to the exact uncompleted module. |
| **Assignments Due** | **Yes** | `StudentAssignment.status`, `AssignmentBatch.dueDate`, `Assignment.title`, `Assignment.difficulty` | `GET /student/dashboard` (`practices`), `GET /assignments/mine-reminders` | Shown in `PracticeSection` (max 5) and `AssignmentReminderBanner`. | **Over-alerted:** Double-alerted via modal and banner. Needs consolidation into a unified daily checklist. |
| **Smart Revision Workload** | **Yes** | `RevisionItem.dueAt`, `RevisionItem.status`, `RevisionSummary.dueToday`, `RevisionSummary.overdue` | `GET /revision/me/summary`, `GET /student/dashboard` | Shown in `RevisionDashboardCard` (4 mini counts + Start Revision button). | **High Value:** Algorithmically sound Anki spaced-repetition. Integrate into the "Daily Action Plan". |
| **Tactical Strengths & Weaknesses** | **Yes** | `GameAnalysisSide.motifsJson`, `StudentGameInsights.motifs` (Pins, Forks, Skewers, Discovered Attacks) | `GET /game-insights/me` | Shown only on `/student/insights`. **Completely absent from dashboard.** | **P1 Opportunity:** Surfaces tangible tactical takeaways: *"Strength: Pin (88% found) · Focus Area: Knight Fork (3 blunders this week)"*. |
| **Accuracy as White & Black** | **Yes** | `StudentGameInsights.byColor.white.accuracy`, `StudentGameInsights.byColor.black.accuracy` | `GET /game-insights/me` | Shown only on `/student/insights`. **Missing from dashboard.** | **P1 Opportunity:** Provides instant chess performance clarity. |
| **External Game Sync Status** | **Yes** | `ExternalChessAccount.provider` (LICHESS, CHESS_COM), `syncStatus`, `gamesImported`, `lastSyncedAt` | `GET /game-sources/accounts` | Shown only on `/student/insights`. | **P1 Opportunity:** Quick sync badge: *"Chess.com synced 2h ago (14 games)"*. |
| **Coach Notes on Assignments** | **Yes** | `StudentAssignment.note`, `RevisionItem.note`, `CoachClass.homework` | `GET /assignments/mine/:id`, `GET /revision/me/session`, `GET /student/classes/:id` | Hidden inside sub-pages. No centralized coach feedback widget on dashboard. | **P1 Opportunity:** Surface recent coach recommendations/notes directly on the dashboard. |
| **Achievements & Badges** | **No** | *Not in database.* No badge or trophy models exist. | *None.* | *None.* | **Must Not Invent:** Do not add fake badges. Use existing verified metrics (Day Streak, Peak Rating, Lessons Completed). |
| **Tournaments** | **No** | *Not in database.* No tournament engine exists. | *None.* | *None.* | **Must Not Invent:** Do not display tournament widgets. |
| **Platform Leaderboard** | **No** | Only exists during live classes / assignment sets in temporary JSON fields. | *None.* | *None.* | **Must Not Invent:** Do not propose a global leaderboard without new backend infrastructure. |

---

## 6. Existing UX Problems: Analysis by Student Persona

To understand why the current dashboard struggles, we evaluate it through the eyes of three distinct student archetypes.

### Persona A: Beginner Student (e.g., Aarav, Age 9, Rating 820)
- **Goal:** Wants to know when his coach is coming online, play fun puzzles, maintain his streak, and feel proud of his progress.
- **Pain Points:**
  - Confronted with intimidating administrative jargon: "Classes Attended: 4", "Attendance: 80%", "Billing & Invoices".
  - Two popups appear on login (feedback questionnaire + overdue assignment modal) which he dismisses without reading.
  - The "Start Revision" card uses complex terms ("Overdue", "Session size", "Spaced repetition").
  - Rated puzzle training (`/student/training`) has no button or preview on the main dashboard; he doesn't know it exists unless he explores the sidebar drawer.
  - No visual chessboard anywhere on the home screen to signal that this is an exciting chess game.

### Persona B: Intermediate Student (e.g., Diya, Age 14, Rating 1340)
- **Goal:** Wants to reach 1500 rating, track her weekly rating progress, fix tactical mistakes, and finish coach homework before class.
- **Pain Points:**
  - Has to click "My Progress" to find out if her puzzle rating increased after yesterday's session.
  - Cannot see *why* she lost her recent games without navigating through `Game insights` -> `Game Library`.
  - Her homework is split between `PracticeSection` (assignments) and `RevisionDashboardCard` (spaced repetition blunders). She wants one consolidated to-do list: *"What do I need to finish before today's 5 PM class?"*.
  - `UpcomingClasses` repeats the exact same class shown in `NextClassCard`, wasting valuable screen space.

### Persona C: Advanced / Competitive Student (e.g., Rohan, Age 17, Rating 1820)
- **Goal:** Analyze opening blunders, review Stockfish centipawn loss from weekend tournament games on Chess.com, complete master-level playout assignments, and inspect coach feedback notes.
- **Pain Points:**
  - The dashboard offers zero high-level analytical metrics (no White/Black accuracy, no centipawn loss trend, no motif weakness alerts).
  - External account sync status (Chess.com/Lichess) is invisible; he has to go to `/student/insights` to check if his 12 weekend games synced.
  - Recordings take up a massive 10-row table at the bottom of the page, even though he only cares about the recording from his last 1:1 master session.

---

## 7. Missing Data & Functionality Summary

### Category 1: Data Already Available in DB/API but Dropped in Frontend
1. **`chessRating`:** Returned by `GET /student/dashboard` (`data.chessRating`), fetched from `StudentProfile.chessRating`. Completely omitted in `StudentDashboardClient.tsx`.
2. **`puzzleRating` and `peakRating`:** Stored in `StudentProgress` and returned by `GET /progress/me`. Dropped from the main dashboard.
3. **`currentStreak` and `longestStreak`:** Stored in `StudentProgress`. Only partially visible as revision streak subtext.
4. **Tactical Motif Verdicts (`MotifInsight`):** Engine-calculated strengths and weaknesses ("Pin: Strength", "Fork: Recurring Weakness") computed by `GameInsightsService`. Zero presence on the dashboard.
5. **Accuracy by Color:** White and Black accuracy percentages from `StudentGameInsights`. Missing from the dashboard.
6. **External Chess Account Connection:** Provider and sync status from `ExternalChessAccount`. Missing from the dashboard.

### Category 2: Data Requiring Unified Backend Aggregation
1. **Unified "Today's Learning Loop":** Currently, the frontend must make 4 separate API calls (`/student/dashboard`, `/assignments/mine-reminders`, `/feedback/pending`, `/revision/me/summary`) to assemble today's tasks. Combining these into a clean payload prevents client-side waterfalls.
2. **30-Day Rating History Sparkline:** `StudentProgressDto.ratingHistory` returns all data points, but no lightweight 7-day or 30-day sparkline array is currently provided in the dashboard endpoint.

### Category 3: Functionality Not Currently Collected / Supported
1. **Badges and Gamified Trophies:** No database schema. Must not be fabricated in redesign wireframes.
2. **Academy Tournaments:** No backend architecture. Excluded from scope.
3. **Global Leaderboard:** Exists only in live sessions. Excluded from general dashboard.

---

## 8. Recommended Dashboard Information Architecture

The redesigned dashboard organizes the student's chess journey into **five distinct, prioritized visual zones**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ ZONE 1: STUDENT CHESS IDENTITY & MOMENTUM BAR                               │
│ - Avatar, Name, Batch Name & Experience Level Pill                          │
│ - Live Skill Cards: Puzzle Rating (Peak), FIDE Rating, Active Day Streak    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────────────────────────────────────────────┐
│ ZONE 2: SMART HERO — LIVE CLASS & COACHING HUB                              │
│ - State A (LIVE NOW): Red Live Beacon + Elapsed Timer + Coach Presence +    │
│                       1-Click "Join Class"                                  │
│ - State B (SCHEDULED TODAY): Countdown Timer + Topic + Coach + Pre-class PGN │
│ - State C (NO CLASS TODAY): Quick-launch "Start Puzzle Training" Board      │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
┌──────────────────────────────────────────────────┬──────────────────────────┐
│ ZONE 3: TODAY'S CHESS LOOP (Main 8 cols)         │ ZONE 4: CHESS DNA &      │
│ - Consolidated 3-Step Daily Checklist:           │ PERFORMANCE (Side 4 cols)│
│   1. Smart Revision (X due blunders, ~Y min)     │ - Tactical Strengths     │
│   2. Coach Assignment (Due date, difficulty)     │   (e.g., Pin 88% found)  │
│   3. Adaptive Daily Puzzle (1-click solve)       │ - Focus Area / Weakness  │
│                                                  │   (e.g., Knight Fork)    │
│ ZONE 5: ACTIVE CURRICULUM & RECORDINGS           │ - 30-Day Rating Trend    │
│ - "Continue Learning" playlist progress bar      │ - Academy Attendance %   │
│ - Recent Class Recordings (Last 2 sessions)      │ - External Sync Pill     │
└──────────────────────────────────────────────────┴──────────────────────────┘
```

---

## 9. Proposed Dashboard Layout & Section Hierarchy

### Section Hierarchy

#### 1. Identity & Momentum Header (Full Width)
- **Visual Design:** Clean surface card with no clutter.
- **Left:** Student Avatar, Student Name, Batch Tag (e.g. `Grandmaster Track · Batch A`), Experience Level badge (`Intermediate`).
- **Right (Momentum Metrics):**
  - **Puzzle Rating:** Value (e.g., `1,420`) + Trend badge (`+18 this week`) + Peak context (`Peak 1,450`).
  - **Day Streak:** Flame icon in warm tone + Value (e.g., `6 Days`) + Subtitle (`Best: 14 days`).
  - **Attendance Health:** Value (e.g., `94%`) + Pill (`Regular`).

#### 2. Class Hub: The Dynamic Smart Hero (Full Width)
- **Eliminates:** The current duplication between `NextClassCard` and `UpcomingClasses`.
- **Behavior:**
  - *When Live:* High-visibility card with pulsing red indicator, class topic, coach name, LiveKit active participant count, elapsed timer, and large primary `Join Class` button.
  - *When Scheduled Today:* Starts-at countdown badge (e.g. `Starts in 2 hours 15 mins`), coach avatar, topic objectives preview, and class preparation status.
  - *When No Class Today:* Clean banner: *"No live classes today — Great day to practice!"* with a 1-click CTA: `Start Puzzle Training`.

#### 3. Two-Column Workspace Layout (`lg:grid-cols-12`, Gap: 24px)

##### Main Column (8 Columns): Active Learning & Workflow
- **Widget A: "Today's Action Plan" (Unified Daily Loop)**
  - Replaces the fragmented `PracticeSection` and `RevisionDashboardCard`.
  - Displays a clean, interactive 3-item checklist:
    1. **Smart Revision:** `X blunders due for review` (`~8 mins`) -> `Start Session` button.
    2. **Coach Assignment:** Title, Due date badge, Difficulty pill -> `Open Assignment` button.
    3. **Daily Rated Puzzle:** Adaptive puzzle tailored to current rating -> `Solve Puzzle` button.
- **Widget B: Active Curriculum ("Continue Learning")**
  - Displays the student's active course playlist.
  - Shows Course Title, Current Module Title, Progress Bar %, and direct `Resume Lesson` link to the next incomplete module.
- **Widget C: Recent Class Recordings & Notes**
  - Shows the **last 2 attended classes** with recordings available.
  - Coach homework note snippet + `Watch Recording` dialog trigger + `Download` button.
  - Footer link: `View all past classes in Schedule ->`.

##### Side Column (4 Columns): Chess DNA & Performance Insights
- **Widget D: Tactical DNA (Strengths & Focus Areas)**
  - Powered by existing `StudentGameInsights.motifs`.
  - **Tactical Strengths:** Motif badges with high accuracy (e.g. `Pin: 85% found`, `Skewer: 90%`).
  - **Recurring Weaknesses:** Alert badge for motifs needing practice (e.g. `Fork: 4 missed in last 10 games`).
  - Direct CTA: `Practice Forks in Training ->`.
- **Widget E: Puzzle Rating Velocity (30-Day Trend)**
  - Recharts sparkline container rendering `ratingHistory` from `StudentProgress`.
  - Clean minimal chart: single line in primary blue (`--color-primary-ink`), shaded gradient beneath, tooltip on hover with date and rating.
- **Widget F: Connected Accounts & Sync**
  - Shows status of Lichess / Chess.com sync (`ExternalChessAccount`).
  - Status pill: `Chess.com: Synced 3h ago (24 games)` + manual refresh icon button.

---

## 10. Desktop Wireframe Description (1440px+)

```
+---------------------------------------------------------------------------------------------------------+
| [NexaChess Logo]   Dashboard   Schedule   Live Classes   Assignments   Progress   [Bell (2)] [Theme] [User] |
+---------------------------------------------------------------------------------------------------------+
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  | [Avatar] Aarav Patel                 [Puzzle Rating: 1420]    [Streak: 7 Days]   [Attendance: 96%] |  |
|  |          Batch: GM Juniors A (Coach Vikram)  Peak 1460 (+24)     Best: 14 days      Attended: 12   |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                                                                                                         |
|  +---------------------------------------------------------------------------------------------------+  |
|  | [!] LIVE NOW: Ruy Lopez - Open Variations                           Coach: Vikram Sen | 4 Students|  |
|  |     Live for 14:22 · Ends in 45m · Coach present                    [ JOIN LIVE CLASS (RED) ]     |  |
|  +---------------------------------------------------------------------------------------------------+  |
|                                                                                                         |
|  MAIN COLUMN (8 COLS)                                       SIDE COLUMN (4 COLS)                        |
|  +-------------------------------------------------------+  +----------------------------------------+  |
|  | TODAY'S ACTION PLAN                     3 of 3 tasks  |  | TACTICAL DNA (Game Insights)           |  |
|  | [x] 1. Smart Revision: 6 blunders due [Start Review]  |  | [Strength] Pins: 88% success rate      |  |
|  | [ ] 2. Assignment: Rook Endgames (Due Today) [Open]   |  | [Focus Area] Knight Forks: 3 missed    |  |
|  | [ ] 3. Daily Training: Solve 3 rated puzzles [Solve]  |  | -> Train Forks in Puzzle Lab           |  |
|  +-------------------------------------------------------+  +----------------------------------------+  |
|                                                                                                         |
|  +-------------------------------------------------------+  +----------------------------------------+  |
|  | CONTINUE LEARNING: Tactics & Combinations II          |  | RATING PROGRESSION (Last 30 Days)      |  |
|  | Next: Module 4 - The Discovered Check                 |  | [~~~~~~~~~/\_/\~~~~~ 1420 (+45)]       |  |
|  | Progress: [====================       ] 65%           |  | Solve rate: 74% (142 / 192 solved)     |  |
|  | [ Resume Lesson -> ]                                  |  +----------------------------------------+  |
|  +-------------------------------------------------------+                                              |
|                                                             +----------------------------------------+  |
|  +-------------------------------------------------------+  | GAME SYNC & SOURCES                    |  |
|  | RECENT CLASS RECORDINGS                               |  | Chess.com: @aarav_chess (Synced 2h ago)|  |
|  | * Oct 30: Pawn Endgames Mastery (Coach Vikram)        |  | Lichess: Not connected [Connect]       |  |
|  |   [ Watch Recording ]  [ Download ]                   |  +----------------------------------------+  |
|  | * Oct 26: Sicilian Defense Dragon (Coach Vikram)      |                                              |
|  |   [ Watch Recording ]  [ Download ]                   |  +----------------------------------------+  |
|  | [ View all past classes in Schedule -> ]              |  | ACADEMY ANNOUNCEMENTS                  |  |
|  +-------------------------------------------------------+  | * Nov 5: Guest Grandmaster Simul       |  |
|                                                             | * Oct 28: Holiday Schedule Notice      |  |
|                                                             +----------------------------------------+  |
+---------------------------------------------------------------------------------------------------------+
```

---

## 11. Mobile Wireframe Description (375px–768px)

On mobile screens, horizontal multi-column grids are stacked into an ergonomic single-column vertical flow with sticky quick-action triggers.

```
+-----------------------------------+
| [=] NexaChess         [(2)] [User]|
+-----------------------------------+
| [Avatar] Aarav Patel              |
| Batch: GM Juniors A               |
+-----------------------------------+
| [ Rating: 1420 ] [ Streak: 7d ]   |
| Peak: 1460       Best: 14d        |
+-----------------------------------+
| [!] LIVE NOW: Ruy Lopez           |
| Coach Vikram · Live for 14m       |
| [ >>> JOIN CLASS NOW (Full) <<< ] |
+-----------------------------------+
| TODAY'S TASKS (1 of 3 complete)   |
| [>] Smart Revision (6 due) [Start]|
| [ ] Assignment: Rook Endgame [Do] |
| [ ] Rated Puzzle Training [Solve] |
+-----------------------------------+
| TACTICAL HIGHLIGHTS               |
| * Strength: Pins (88%)            |
| * Focus: Knight Forks (3 blunders)|
+-----------------------------------+
| ACTIVE COURSE                     |
| Tactics & Combinations II (65%)   |
| [ Resume Lesson -> ]              |
+-----------------------------------+
| RECENT RECORDINGS                 |
| Oct 30: Pawn Endgames Mastery     |
| [ Watch (Dialog) ] [ Download ]   |
+-----------------------------------+
| [Sticky Bottom Mobile Bar]        |
| [Join Class]  [Solve]  [Schedule] |
+-----------------------------------+
```

### Key Mobile UX Adaptations
1. **Sticky Live Floating Bar:** If a class is currently LIVE, a persistent 52px floating bar docks to the bottom of the screen with a red pulse dot and a large `Join Class Now` touch target (min height 48px).
2. **Horizontal Metric Carousel:** Rating, Streak, and Attendance swipe horizontally or sit in a clean 2x2 grid without wrapping awkwardly.
3. **Touch Targets:** All clickable list items have a minimum touch height of 48px to prevent mis-clicks.
4. **Dialog Dismissals:** Modals use standard bottom sheets (`Drawer`) on mobile rather than centered desktop modals.

---

## 12. Recommended Visual Design System

All proposed components strictly adhere to **NexaChess Design System v2** and rules from `docs/UI_RULES.md`:

### 12.1 Color Tokens
- **Canvas & Surfaces:**
  - Page Background: `bg-app-background`
  - Cards & Containers: `bg-app-surface` with `border border-app-border` and `shadow-card`
  - Inset Tiles & Subtle Backdrops: `bg-app-soft`
- **Text & Typography:**
  - High Contrast Headers: `text-app-text`
  - Secondary & Metadata Labels: `text-app-muted` or `text-app-subtle`
  - Ink Accent Colors: `text-primary-ink`, `text-accent-ink`, `text-success-ink`, `text-warning-ink`, `text-app-danger-ink` (never raw palette hexes).
- **Brand Accents:**
  - Primary Royal Blue (`bg-primary`, `text-on-primary`): Primary CTAs, active filters, selected tabs.
  - Accent Gold (`bg-accent`, `text-on-accent`, `text-accent-ink`): Badges, streaks, achievement milestones.
  - Danger Coral (`bg-app-danger`, `text-on-danger`): Exclusive to LIVE indicators and destructive cancellations.
  - Status Tints (`bg-success-soft`, `bg-warning-soft`, `bg-app-danger-soft`): Backgrounds for motif strengths/weaknesses and due date chips.

### 12.2 Typography Hierarchy
- **Font Families:**
  - Primary Display & Headings: `font-display` (Cal Sans / Inter Display)
  - Body Text & UI Labels: `font-sans` (Inter)
  - Ratings, Timers, Chess Coordinates & FEN: `font-mono` (JetBrains Mono) with `tabular-nums`
- **Scale:**
  - Greeting / Hero Header: `text-2xl sm:text-3xl font-extrabold tracking-tight`
  - Card Titles: `text-base sm:text-lg font-bold text-app-text`
  - Metric Numbers: `text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight`
  - Body / Subtext: `text-xs sm:text-sm text-app-muted`
  - Badges & Chips: `text-xs font-semibold`

### 12.3 Shape, Border & Depth
- **Radius Tokens:**
  - Cards & Dashboard Panels: `rounded-2xl`
  - Action Buttons & Input Fields: `rounded-control` (10px)
  - Small Metric Inset Boxes: `rounded-xl`
  - Status Badges, Chips & Action Buttons: `rounded-full`
- **Elevation:** Subtle, crisp shadows (`shadow-card` / `shadow-subtle`), never heavy fuzzy dropshadows.
- **Action Buttons:** Data-table and card actions use `RowActions` or `size="icon" rounded-full` buttons with `strokeWidth={2.5}` Lucide icons.

---

## 13. Chart and Visualization Recommendations

### 13.1 Rating Progression Chart
- **Component:** `LineChartCard` wrapped in `ChartContainer` (`components/charts/ChartContainer.tsx`).
- **Data Source:** `StudentProgress.ratingHistory` (`[{ at: ISOString, rating: number }]`).
- **Presentation:**
  - Trailing 30 days or trailing 20 rated puzzles.
  - Colors: Sourced via `useChartColors()` (`--color-chart-1` = primary royal blue).
  - Clean minimalist line (stroke width: 2.5px), zero clutter, subtle area fill beneath line (`fillOpacity={0.08}`).
  - X-Axis formatted with `formatDayMonth(d, tz)` from `lib/datetime.ts`.
  - Tooltip: Custom dark/light tooltip displaying exact date, puzzle rating, and delta.

### 13.2 Tactical DNA Motif Breakdown
- **Component:** Clean horizontal split badges or stacked progress indicators.
- **Data Source:** `StudentGameInsights.motifs` (`[{ motif: string, accuracy: number, verdict: "STRENGTH" | "WEAKNESS" | "NEUTRAL" }]`).
- **Presentation:**
  - **Strengths (Top 2):** Green pill (`bg-success-soft text-success-ink`) with checkmark icon: e.g. `Pins (88% success rate)`.
  - **Weaknesses (Top 2):** Amber pill (`bg-warning-soft text-warning-ink`) with alert icon: e.g. `Knight Forks (4 blunders recorded)`.
  - Avoids multi-color spider/radar charts which are notoriously confusing for younger students.

### 13.3 Daily Practice Consistency Indicator
- **Component:** 7-Day Streak Dot Chain.
- **Data Source:** `StudentProgress.lastActiveDay` and `StudentProgress.currentStreak`.
- **Presentation:** 7 circular pips representing Monday through Sunday. Filled amber pip with flame icon for active practice days; dashed stroke for today; muted dot for inactive days.

---

## 14. API & Backend Enhancements Required

The redesign can be implemented **with minimal, backwards-compatible backend adjustments**.

### 14.1 Recommended Enhancement: Enrich `GET /student/dashboard`
Currently, `StudentService.getDashboard` in `apps/api/src/student/student.service.ts` fetches `studentProfile.chessRating` but omits `StudentProgress`.

**Proposed Change in `student.service.ts`:**
In Step 1b of `getDashboard`, include `studentProgress`:
```typescript
const [studentProfile, studentProgress, batchEnrolment] = await Promise.all([
  this.prisma.studentProfile.findUnique({
    where: { userId: user.id },
    select: { chessRating: true, experienceLevel: true }
  }),
  this.prisma.studentProgress.findUnique({
    where: { studentId: user.id },
    select: {
      puzzleRating: true,
      peakRating: true,
      currentStreak: true,
      longestStreak: true,
      lastActiveDay: true
    }
  }),
  this.prisma.batchStudent.findFirst({
    where: { studentId: user.id },
    orderBy: { enrolledAt: "desc" },
    include: { batch: true }
  })
]);
```

And include in the returned JSON:
```typescript
return {
  ...existingFields,
  experienceLevel: studentProfile?.experienceLevel ?? "BEGINNER",
  puzzleStats: {
    puzzleRating: studentProgress?.puzzleRating ?? 1200,
    peakRating: studentProgress?.peakRating ?? 1200,
    currentStreak: studentProgress?.currentStreak ?? 0,
    longestStreak: studentProgress?.longestStreak ?? 0
  }
};
```

**Impact:**
- **Zero Breaking Changes:** All existing fields (`liveClass`, `todaysClass`, `nextClasses`, `courses`, `practices`, `pastClasses`) remain identical.
- **Zero Extra Queries on Frontend:** Eliminates the need for the dashboard to make secondary requests to `/progress/me`.

### 14.2 Tactical DNA Inclusion (Optional P1)
Add a lightweight summary from `GameInsightsService.getInsights(user.id)` returning the student's top strength and top weakness motif:
```typescript
tacticalDna: {
  strengths: [{ motif: "PIN", label: "Pins", ratePercent: 88 }],
  weaknesses: [{ motif: "FORK", label: "Knight Forks", missesCount: 4 }]
}
```

---

## 15. Implementation Priorities

To ensure rapid value delivery without disrupting ongoing academy operations, recommendations are phased into three distinct priority tiers:

### P0: Essential (Immediate Redesign Phase)
*Must be included in the initial dashboard redesign release.*

1. **Expose Chess Identity & Rating on Hero:**
   - Display `puzzleRating`, `peakRating`, and `currentStreak` prominently in the top header.
   - Surface the student's active batch name and coach name as a proud identity banner.
2. **Eliminate Redundant Next Class Cards:**
   - Merge `NextClassCard` and `UpcomingClasses` into a single, cohesive **Class Hub**.
   - Keep the live countdown timer, participant count, and LiveKit 1-click Join action.
3. **Unify "Today's Learning Loop":**
   - Replace the fragmented practice cards with a single **"Today's Action Plan"** card.
   - Combine Smart Revision due items, pending coach assignments, and rated puzzle training into one clear 3-step checklist.
4. **Fix Alert & Popup Stacking:**
   - Restructure `AssignmentReminderPopup` and `DashboardFeedback` so students are never confronted with multiple modal dialogs simultaneously.
   - Convert full-width alert banners into compact dismissible notifications.
5. **Condense Past Class Recordings:**
   - Reduce the 10-row past classes table to the **2 most recent class recordings** with instant Watch & Download actions and a link to view the complete history in `/student/schedule`.

### P1: High-Value Improvements (Phase 2)
*High-impact features leveraging existing backend services.*

1. **Surface Tactical DNA (Strengths & Weaknesses):**
   - Embed top tactical motifs (Pins, Forks, Skewers) directly on the dashboard from `GameInsightsService`.
   - Provide a direct deep-link: *"Train your weakness (Knight Forks) in Puzzle Lab"*.
2. **Embed 30-Day Puzzle Rating Sparkline:**
   - Add a sleek Recharts trend graph in the dashboard side column.
3. **Course Syllabus Quick-Launch:**
   - Update `ContinueLearning` to provide a direct 1-click deep-link to the exact incomplete module in the syllabus.
4. **External Account Sync Status:**
   - Add an indicator showing connection and sync recency for Lichess and Chess.com accounts.
5. **Coach Notes & Homework Highlights:**
   - Pull recent coach notes attached to assignments and class summaries into a dedicated "Coach Notes" feed.

### P2: Future Enhancements (Phase 3)
*Longer-term roadmap items requiring minor backend architecture.*

1. **Interactive Mini-Board / "Daily Puzzle":**
   - Embed a lightweight, playable interactive chess board directly on the dashboard home page for the daily warm-up puzzle.
2. **Weekly Consistency Heatmap:**
   - Display a 14-day or 30-day activity dot matrix showing practice consistency.
3. **Parent / Sponsor Summary View:**
   - Allow parents switching into the student view to see attendance compliance, coach notes, and billing renewal dates in a dedicated parent tab.

---

## 16. Conclusion

NexaChess already has world-class infrastructure: real-time Stockfish engine analysis, spaced-repetition revision algorithms, seamless LiveKit interactive video classrooms, and comprehensive curriculum tracking. 

However, its current Student Dashboard fails to showcase these capabilities, presenting an administrative face rather than an inspiring chess cockpit. By enacting the data-grounded recommendations in this audit—elevating the student's rating and streak, unifying daily practice into a single action plan, showcasing tactical DNA, and eliminating banner clutter—NexaChess will deliver a premium, motivating, and modern EdTech experience worthy of a world-class chess academy.
