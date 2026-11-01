import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  ACTIVITY_SUBMIT_GRACE_SECONDS,
  describePlayoutGoal,
  mcqConfigSchema,
  mcqCorrectOptionIds,
  mcqFinalScore,
  mcqKeyVisible,
  mcqVerdictVisible,
  playoutConfigSchema,
  playoutEngineLabel,
  playoutMaxScore,
  scoreMcqSelection,
  shuffleForStudent,
  type ActivityRunMonitorResponse,
  type ActivityRunStateResponse,
  type ActivityRunSummary,
  type McqAnswerResponse,
  type McqAttemptView,
  type McqConfig,
  type McqMonitorResponse,
  type McqMonitorStudent,
  type PlayoutGameDetailResponse,
  type PlayoutMonitorResponse,
  type StudentMcqState,
  type SubmitMcqAnswerRequest
} from "@nexa-chess/types";
import {
  LibraryActivityKind,
  LiveClassActivityRunStatus,
  Prisma,
  PuzzleStatus,
  UserRole,
  type LiveClassActivityRun,
  type LiveClassMcqAttempt
} from "@prisma/client";
import { LiveClassService } from "../live-class/live-class.service";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../puzzle/puzzle-auth.helper";
import { StockfishService } from "../stockfish/stockfish.service";
import { ActivityRunEventsService } from "./activity-run-events.service";
import { closeActivityRun, revealsOnEnd } from "./activity-run.close";
import { PlayoutGameService } from "./playout-game.service";

type RunRow = LiveClassActivityRun;

/**
 * One MCQ or Playout put to one class. Runs are started by the activity queue
 * (the one sharing workflow); the coach's only controls are to end the activity
 * and reveal an MCQ's answer, and neither touches a student's game or answer.
 * The library config is frozen onto the run, so editing it mid-class changes
 * nothing here. The answer key stays in `configJson` and leaves only as the
 * reveal rules allow.
 */
@Injectable()
export class ActivityRunService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly liveClass: LiveClassService,
    private readonly stockfish: StockfishService,
    private readonly playout: PlayoutGameService,
    private readonly events: ActivityRunEventsService
  ) {}

  // ── Coach-owner / admin ──

  /** Called by the activity queue when the class reaches an MCQ or Playout. */
  async start(accessToken: string | undefined, classId: string, activityId: string): Promise<ActivityRunSummary> {
    const { user, liveSession } = await this.liveClass.resolveClassManager(accessToken, classId, { requireLive: true });
    const activity = await this.prisma.libraryActivity.findUnique({ where: { id: activityId } });
    if (!activity || activity.status !== PuzzleStatus.PUBLISHED) {
      throw new NotFoundException("This activity is no longer published.");
    }
    if (activity.kind === LibraryActivityKind.PLAYOUT && !this.stockfish.isAvailable()) {
      throw new BadRequestException("Engine play is not available on this server.");
    }

    // The queue closes each item before the next, so one still active here was left behind.
    const leftover = await this.prisma.liveClassActivityRun.findFirst({
      where: { liveClassId: classId, status: LiveClassActivityRunStatus.ACTIVE }
    });
    if (leftover) await closeActivityRun(this.prisma, { id: leftover.id, revealOnEnd: revealsOnEnd(leftover) }, new Date());

    const now = new Date();
    const limit = activity.kind === LibraryActivityKind.MCQ ? mcqConfigSchema.parse(activity.configJson).timeLimitSeconds : null;
    let run: RunRow;
    try {
      run = await this.prisma.liveClassActivityRun.create({
        data: {
          activityId: activity.id,
          configJson: activity.configJson as Prisma.InputJsonValue,
          description: activity.description,
          difficulty: activity.difficulty,
          endsAt: limit ? new Date(now.getTime() + limit * 1000) : null,
          kind: activity.kind,
          liveClassId: classId,
          startedAt: now,
          startedById: user.id,
          title: activity.title
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Another activity has just started in this class.");
      }
      throw error;
    }
    await this.events.toRoom(liveSession.roomName, { runId: run.id, type: "RUN_CHANGED" });
    return this.toSummary(run);
  }

  async end(accessToken: string | undefined, classId: string, runId: string): Promise<{ run: ActivityRunSummary }> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const run = await this.findRun(classId, runId);
    const closed = await closeActivityRun(this.prisma, { id: run.id, revealOnEnd: revealsOnEnd(run) }, new Date());
    if (closed) await this.events.toRoom(liveSession.roomName, { runId: run.id, type: "RUN_CHANGED" });
    return { run: this.toSummary(await this.findRun(classId, runId)) };
  }

  /** Shows the class the MCQ's answer. Allowed once a run has ended too. */
  async reveal(accessToken: string | undefined, classId: string, runId: string): Promise<{ run: ActivityRunSummary }> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    const run = await this.findRun(classId, runId);
    if (run.kind !== LibraryActivityKind.MCQ) throw new BadRequestException("Only an MCQ has an answer to reveal.");
    const { count } = await this.prisma.liveClassActivityRun.updateMany({
      where: { id: run.id, revealedAt: null },
      data: { revealedAt: new Date() }
    });
    if (count === 1) await this.events.toRoom(liveSession.roomName, { runId: run.id, type: "RUN_CHANGED" });
    return { run: this.toSummary(await this.findRun(classId, runId)) };
  }

  async monitor(accessToken: string | undefined, classId: string, runId: string): Promise<ActivityRunMonitorResponse> {
    const { liveSession } = await this.liveClass.resolveClassManager(accessToken, classId);
    let run = await this.findRun(classId, runId);
    run = await this.settleExpiry(run, liveSession.roomName);
    const students = await this.loadRoster(liveSession.batchId, liveSession.roomName);
    return run.kind === LibraryActivityKind.PLAYOUT
      ? this.playoutMonitor(run, students)
      : this.mcqMonitor(run, students);
  }

  async gameDetail(accessToken: string | undefined, classId: string, runId: string, gameId: string): Promise<PlayoutGameDetailResponse> {
    await this.liveClass.resolveClassManager(accessToken, classId);
    const run = await this.findRun(classId, runId);
    if (run.kind !== LibraryActivityKind.PLAYOUT) throw new NotFoundException("Game not found.");
    return this.playout.detailView(run, gameId);
  }

  // ── Any participant ──

  /** The current (or last) run, as this caller may see it. A student's view carries only their own data. */
  async state(accessToken: string | undefined, classId: string): Promise<ActivityRunStateResponse> {
    const { user, liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    const serverTime = () => new Date().toISOString();
    const found = await this.prisma.liveClassActivityRun.findFirst({
      where: { liveClassId: classId },
      orderBy: { startedAt: "desc" }
    });
    if (!found) return { mcq: null, playout: null, run: null, serverTime: serverTime() };
    const run = await this.settleExpiry(found, liveSession.roomName);

    if (user.role !== UserRole.STUDENT) {
      return { mcq: null, playout: null, run: this.toSummary(run), serverTime: serverTime() };
    }
    if (run.kind === LibraryActivityKind.PLAYOUT) {
      return {
        mcq: null,
        playout: await this.playout.studentState(run, user.id, liveSession.roomName),
        run: this.toSummary(run),
        serverTime: serverTime()
      };
    }
    return { mcq: await this.mcqState(run, user.id), playout: null, run: this.toSummary(run), serverTime: serverTime() };
  }

  // ── Student ──

  async submitMcq(
    accessToken: string | undefined,
    classId: string,
    runId: string,
    body: SubmitMcqAnswerRequest
  ): Promise<McqAnswerResponse> {
    const { user, liveSession } = await this.liveClass.resolveParticipant(accessToken, classId);
    if (user.role !== UserRole.STUDENT) throw new ForbiddenException("Only students answer these questions.");
    const run = await this.findRun(classId, runId);
    if (run.kind !== LibraryActivityKind.MCQ) throw new NotFoundException("Activity not found.");
    const config = this.mcqConfig(run);
    const selected = [...new Set(body.selectedOptionIds)];

    const attempts = await this.prisma.liveClassMcqAttempt.findMany({
      where: { runId, studentId: user.id },
      orderBy: { attemptNumber: "asc" }
    });

    // A retry after a lost response finds the answer it already stored.
    const already = attempts.find((a) => a.attemptNumber === body.attemptNumber);
    if (already) {
      const same = already.selectedOptionIds.length === selected.length && selected.every((id) => already.selectedOptionIds.includes(id));
      if (!same) throw new ConflictException("You have already answered this try.");
      return { mcq: await this.mcqState(run, user.id), serverTime: new Date().toISOString() };
    }

    if (run.status !== LiveClassActivityRunStatus.ACTIVE || this.pastDeadline(run)) {
      throw new ConflictException("This question has closed.");
    }
    if (attempts.length >= config.maxAttempts) throw new BadRequestException("You have used all your tries.");
    if (body.attemptNumber !== attempts.length + 1) throw new ConflictException("Refresh and try again.");
    // Stopping here only once the student can already see they were right: when
    // verdicts are hidden, a refusal would itself give the answer away.
    if (mcqVerdictVisible(config.revealMode, run) && attempts.some((a) => a.correct)) {
      throw new BadRequestException("You already got this one right.");
    }

    const known = new Set(config.options.map((o) => o.id));
    if (selected.some((id) => !known.has(id))) throw new BadRequestException("That isn't one of the options.");
    if (!config.allowMultiple && selected.length !== 1) throw new BadRequestException("Choose one answer.");

    const scored = scoreMcqSelection(config, selected);
    const from = attempts[attempts.length - 1]?.submittedAt ?? run.startedAt;
    const now = new Date();
    try {
      await this.prisma.liveClassMcqAttempt.create({
        data: {
          attemptNumber: body.attemptNumber,
          correct: scored.correct,
          correctOptionIds: scored.correctOptionIds,
          durationSeconds: Math.max(0, Math.round((now.getTime() - from.getTime()) / 1000)),
          maxScore: scored.maxScore,
          runId,
          score: scored.score,
          selectedOptionIds: selected,
          studentId: user.id,
          submittedAt: now
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("You have already answered this try.");
      }
      throw error;
    }
    this.events.toManagers(liveSession.roomName, { runId, type: "MCQ_ANSWERED" });
    return { mcq: await this.mcqState(run, user.id), serverTime: now.toISOString() };
  }

  // ── Internals ──

  private async findRun(classId: string, runId: string): Promise<RunRow> {
    const run = await this.prisma.liveClassActivityRun.findUnique({ where: { id: runId } });
    if (!run || run.liveClassId !== classId) throw new NotFoundException("Activity not found.");
    return run;
  }

  private mcqConfig(run: Pick<RunRow, "configJson">): McqConfig {
    return mcqConfigSchema.parse(run.configJson);
  }

  private pastDeadline(run: Pick<RunRow, "endsAt">): boolean {
    return !!run.endsAt && Date.now() > run.endsAt.getTime() + ACTIVITY_SUBMIT_GRACE_SECONDS * 1000;
  }

  /** An MCQ whose timer ran out ends on the next read, whether or not the coach is there. */
  private async settleExpiry(run: RunRow, roomName: string): Promise<RunRow> {
    if (run.status !== LiveClassActivityRunStatus.ACTIVE || !this.pastDeadline(run)) return run;
    const closed = await closeActivityRun(this.prisma, { id: run.id, revealOnEnd: revealsOnEnd(run) }, new Date());
    if (closed) await this.events.toRoom(roomName, { runId: run.id, type: "RUN_CHANGED" });
    return this.prisma.liveClassActivityRun.findUniqueOrThrow({ where: { id: run.id } });
  }

  private async mcqState(run: RunRow, studentId: string): Promise<StudentMcqState> {
    const config = this.mcqConfig(run);
    const rows = await this.prisma.liveClassMcqAttempt.findMany({
      where: { runId: run.id, studentId },
      orderBy: { attemptNumber: "asc" }
    });
    const verdict = mcqVerdictVisible(config.revealMode, run);
    const anyCorrect = rows.some((r) => r.correct);
    const outOfTries = rows.length >= config.maxAttempts;
    const finished = (verdict && anyCorrect) || outOfTries;
    const keyVisible = mcqKeyVisible(config.revealMode, run, finished);
    const open = run.status === LiveClassActivityRunStatus.ACTIVE && !this.pastDeadline(run);

    const options = config.options.map(({ isCorrect: _isCorrect, ...option }) => option);
    return {
      allowMultiple: config.allowMultiple,
      attempts: rows.map((row): McqAttemptView => ({
        attemptNumber: row.attemptNumber,
        correct: verdict ? row.correct : null,
        score: verdict ? row.score : null,
        selectedOptionIds: row.selectedOptionIds,
        submittedAt: row.submittedAt.toISOString()
      })),
      canSubmit: open && !finished,
      correctOptionIds: keyVisible ? mcqCorrectOptionIds(config) : null,
      explanation: keyVisible ? (config.explanation ?? null) : null,
      finalScore: verdict && rows.length > 0 ? mcqFinalScore(config, rows) : null,
      marks: config.marks,
      maxAttempts: config.maxAttempts,
      options: config.randomizeOptions ? shuffleForStudent(options, `${run.id}:${studentId}`) : options,
      question: config.question,
      revealMode: config.revealMode
    };
  }

  private async playoutMonitor(run: RunRow, students: { id: string; name: string }[]): Promise<PlayoutMonitorResponse> {
    const config = playoutConfigSchema.parse(run.configJson);
    return {
      computerLabel: playoutEngineLabel(config.engine.skillLevel),
      entries: await this.playout.monitorEntries(run, students),
      goalText: config.goalDescription?.trim() || describePlayoutGoal(config.goal),
      kind: "PLAYOUT",
      maxScore: playoutMaxScore(config.scoring),
      run: this.toSummary(run),
      serverTime: new Date().toISOString(),
      startFen: config.startFen,
      studentColor: config.studentColor
    };
  }

  private async mcqMonitor(run: RunRow, students: { id: string; name: string }[]): Promise<McqMonitorResponse> {
    const config = this.mcqConfig(run);
    const rows = await this.prisma.liveClassMcqAttempt.findMany({
      where: { runId: run.id },
      include: { student: { select: { firstName: true, id: true, lastName: true } } },
      orderBy: { attemptNumber: "asc" }
    });

    const byStudent = new Map<string, LiveClassMcqAttempt[]>();
    const names = new Map(students.map((s) => [s.id, s.name]));
    for (const row of rows) {
      byStudent.set(row.studentId, [...(byStudent.get(row.studentId) ?? []), row]);
      if (!names.has(row.studentId)) names.set(row.studentId, fullName(row.student) ?? "Student");
    }

    const counts = new Map<string, number>();
    let correct = 0;
    let incorrect = 0;
    const list = [...names.entries()]
      .map(([studentId, studentName]): McqMonitorStudent => {
        const attempts = byStudent.get(studentId) ?? [];
        const last = attempts[attempts.length - 1];
        if (!last) {
          return {
            attempts: 0,
            correct: null,
            durationSeconds: null,
            score: null,
            selectedOptionIds: [],
            status: "PENDING",
            studentId,
            studentName,
            submittedAt: null
          };
        }
        const isRight = attempts.some((a) => a.correct);
        if (isRight) correct += 1;
        else incorrect += 1;
        for (const id of last.selectedOptionIds) counts.set(id, (counts.get(id) ?? 0) + 1);
        return {
          attempts: attempts.length,
          correct: isRight,
          durationSeconds: attempts.reduce((sum, a) => sum + a.durationSeconds, 0),
          score: mcqFinalScore(config, attempts),
          selectedOptionIds: last.selectedOptionIds,
          status: "ANSWERED",
          studentId,
          studentName,
          submittedAt: last.submittedAt.toISOString()
        };
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName));

    const answered = correct + incorrect;
    const revealed = !!run.revealedAt;
    return {
      allowMultiple: config.allowMultiple,
      kind: "MCQ",
      marks: config.marks,
      options: config.options.map(({ isCorrect, ...option }) => ({
        ...option,
        count: counts.get(option.id) ?? 0,
        isCorrect: revealed ? isCorrect : null
      })),
      question: config.question,
      revealMode: config.revealMode,
      run: this.toSummary(run),
      serverTime: new Date().toISOString(),
      students: list,
      totals: {
        accuracyPercent: answered ? Math.round((correct / answered) * 100) : null,
        answered,
        correct,
        incorrect,
        pending: list.length - answered,
        students: list.length
      }
    };
  }

  /** The batch, plus any other student connected to the room (pulled in, or a batch-less class). */
  private async loadRoster(batchId: string | null, roomName: string): Promise<{ id: string; name: string }[]> {
    const [enrolled, connected] = await Promise.all([
      batchId
        ? this.prisma.batchStudent.findMany({
            where: { batchId, isDeleted: false },
            select: { student: { select: { firstName: true, id: true, lastName: true } } }
          })
        : Promise.resolve([]),
      this.liveClass.connectedUserIds(roomName)
    ]);
    const known = new Set(enrolled.map((e) => e.student.id));
    const others = await this.prisma.user.findMany({
      where: { id: { in: [...connected].filter((id) => !known.has(id)) }, role: UserRole.STUDENT },
      select: { firstName: true, id: true, lastName: true }
    });
    return [...enrolled.map((e) => e.student), ...others].map((s) => ({ id: s.id, name: fullName(s) ?? "Student" }));
  }

  private toSummary(run: RunRow): ActivityRunSummary {
    return {
      classId: run.liveClassId,
      description: run.description,
      endedAt: run.endedAt?.toISOString() ?? null,
      endsAt: run.endsAt?.toISOString() ?? null,
      id: run.id,
      kind: run.kind,
      revealedAt: run.revealedAt?.toISOString() ?? null,
      startedAt: run.startedAt.toISOString(),
      status: run.status,
      title: run.title
    };
  }
}

