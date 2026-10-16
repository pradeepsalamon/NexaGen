import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  encodeActivityQueueMessage,
  LIVE_CLASS_ACTIVITY_QUEUE_TOPIC,
  MAX_ACTIVITY_QUEUE_ITEMS,
  MAX_ACTIVITY_QUEUES_PER_CLASS,
  parseActivityChapterState,
  type ActivityQueue,
  type ActivityQueueItem,
  type ActivityQueueItemInput,
  type ActivityQueueProgressResponse,
  type ActivityQueueResponse,
  type ActivityQueuesResponse,
  type ActivityResponseCell,
  type AddActivityQueueItemsRequest,
  type AdvanceActivityQueueRequest,
  type CreateActivityQueueRequest,
  type RenameActivityQueueRequest,
  type ReorderActivityQueueRequest,
  type StudentActivityQueueResponse
} from "@nexa-chess/types";
import {
  LiveClassActivityKind,
  LiveClassActivityQueueStatus,
  LiveClassMovePollStatus,
  Prisma,
  PuzzleStatus,
  PuzzleVisibility,
  UserRole,
  type LiveClassActivityQueueItem as ItemRow
} from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { Chess } from "../common/chess/chess";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { LiveClassMovePollService } from "../move-poll/live-class-move-poll.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassPuzzleService } from "../puzzle/live-class-puzzle.service";
import { fullName } from "../puzzle/puzzle-auth.helper";

const queueInclude = {
  items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }] }
} satisfies Prisma.LiveClassActivityQueueInclude;

type QueueRow = Prisma.LiveClassActivityQueueGetPayload<{ include: typeof queueInclude }>;

type Manager = {
  user: { id: string; role: UserRole };
  cls: { id: string; batchId: string | null };
  liveSession: { roomName: string; status: string } | null;
};

const DEFAULT_QUESTION_TITLE = "What would you play?";

/**
 * The coach's prepared lesson sequence for one class. Drafting works before
 * the class starts (authorised against the class's own coach, since a
 * LiveSession row only exists once it starts); launching needs it LIVE.
 *
 * Shared progression: the queue has ONE current item for the whole class and
 * only the coach moves it. Each item is run through the feature that already
 * owns that activity — a PUZZLE through `LiveClassPuzzleService.assign`, a
 * QUESTION through `LiveClassMovePollService.start` — so students solve and
 * answer with the existing UI, and those services stay the authority on
 * whether a submission is still accepted (an ended puzzle or poll refuses it).
 * The share / poll each item produced is stored on the item, which is how the
 * progress view ties every response to exactly one item.
 */
@Injectable()
export class ActivityQueueService {
  private readonly logger = new Logger(ActivityQueueService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly liveClass: LiveClassService,
    private readonly livekit: LiveKitService,
    private readonly puzzles: LiveClassPuzzleService,
    private readonly polls: LiveClassMovePollService
  ) {}

  // ── Drafting (coach-owner / admin) ──

  async list(accessToken: string | undefined, classId: string): Promise<ActivityQueuesResponse> {
    const { liveSession } = await this.resolveManager(accessToken, classId);
    const rows = await this.prisma.liveClassActivityQueue.findMany({
      where: { liveClassId: classId },
      orderBy: { createdAt: "desc" },
      include: queueInclude
    });
    return {
      classLive: liveSession?.status === "LIVE",
      queues: await this.toQueues(rows)
    };
  }

  async create(
    accessToken: string | undefined,
    classId: string,
    body: CreateActivityQueueRequest
  ): Promise<ActivityQueueResponse> {
    const { user } = await this.resolveManager(accessToken, classId);

    // A retried create (lost response, double click) finds its own row.
    const existing = await this.prisma.liveClassActivityQueue.findUnique({
      where: { liveClassId_clientId: { clientId: body.clientId, liveClassId: classId } },
      include: queueInclude
    });
    if (existing) return { queue: await this.toQueue(existing) };

    const count = await this.prisma.liveClassActivityQueue.count({ where: { liveClassId: classId } });
    if (count >= MAX_ACTIVITY_QUEUES_PER_CLASS) {
      throw new BadRequestException(`A class can hold at most ${MAX_ACTIVITY_QUEUES_PER_CLASS} queues.`);
    }
    try {
      const created = await this.prisma.liveClassActivityQueue.create({
        data: { clientId: body.clientId, createdById: user.id, liveClassId: classId, title: body.title },
        include: queueInclude
      });
      return { queue: await this.toQueue(created) };
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      // The same clientId raced past the lookup: the other request created it.
      const raced = await this.prisma.liveClassActivityQueue.findUniqueOrThrow({
        where: { liveClassId_clientId: { clientId: body.clientId, liveClassId: classId } },
        include: queueInclude
      });
      return { queue: await this.toQueue(raced) };
    }
  }

  async rename(
    accessToken: string | undefined,
    classId: string,
    queueId: string,
    body: RenameActivityQueueRequest
  ): Promise<ActivityQueueResponse> {
    await this.resolveManager(accessToken, classId);
    await this.findOwn(classId, queueId);
    const updated = await this.prisma.liveClassActivityQueue.update({
      where: { id: queueId },
      data: { title: body.title },
      include: queueInclude
    });
    return { queue: await this.toQueue(updated) };
  }

  /** Drafts and finished queues only — a running one is finished first. */
  async remove(accessToken: string | undefined, classId: string, queueId: string): Promise<{ ok: true }> {
    await this.resolveManager(accessToken, classId);
    await this.findOwn(classId, queueId);
    // Status-filtered: a launch racing this delete wins, and the queue survives.
    const { count } = await this.prisma.liveClassActivityQueue.deleteMany({
      where: { id: queueId, status: { not: LiveClassActivityQueueStatus.LIVE } }
    });
    if (count === 0) throw new ConflictException("Finish the running queue before deleting it.");
    return { ok: true };
  }

  async addItems(
    accessToken: string | undefined,
    classId: string,
    queueId: string,
    body: AddActivityQueueItemsRequest
  ): Promise<ActivityQueueResponse> {
    const manager = await this.resolveManager(accessToken, classId);
    const queue = await this.findOwnDraft(classId, queueId);
    if (queue.items.length + body.items.length > MAX_ACTIVITY_QUEUE_ITEMS) {
      throw new BadRequestException(`A queue can hold at most ${MAX_ACTIVITY_QUEUE_ITEMS} activities.`);
    }

    const resolved = await this.resolveInputs(manager, body.items);
    await this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction: positions must stay contiguous even if
      // two adds race (the second one appends after the first).
      const current = await tx.liveClassActivityQueue.findUnique({
        where: { id: queueId },
        select: { status: true, _count: { select: { items: true } } }
      });
      if (!current || current.status !== LiveClassActivityQueueStatus.DRAFT) {
        throw new ConflictException("This queue has already been launched — it can no longer be edited.");
      }
      if (current._count.items + resolved.length > MAX_ACTIVITY_QUEUE_ITEMS) {
        throw new BadRequestException(`A queue can hold at most ${MAX_ACTIVITY_QUEUE_ITEMS} activities.`);
      }
      await tx.liveClassActivityQueueItem.createMany({
        data: resolved.map((item, i) => ({ ...item, position: current._count.items + i, queueId }))
      });
    });
    return this.respond(queueId);
  }

  async reorder(
    accessToken: string | undefined,
    classId: string,
    queueId: string,
    body: ReorderActivityQueueRequest
  ): Promise<ActivityQueueResponse> {
    await this.resolveManager(accessToken, classId);
    const queue = await this.findOwnDraft(classId, queueId);
    const known = new Set(queue.items.map((i) => i.id));
    const unique = new Set(body.ids);
    if (unique.size !== body.ids.length || body.ids.length !== known.size || body.ids.some((id) => !known.has(id))) {
      // Someone added or removed an item since this list was read.
      throw new ConflictException("The queue changed — refresh and try again.");
    }
    await this.prisma.$transaction(
      body.ids.map((id, position) =>
        this.prisma.liveClassActivityQueueItem.update({ where: { id }, data: { position } })
      )
    );
    return this.respond(queueId);
  }

  async removeItem(
    accessToken: string | undefined,
    classId: string,
    queueId: string,
    itemId: string
  ): Promise<ActivityQueueResponse> {
    await this.resolveManager(accessToken, classId);
    const queue = await this.findOwnDraft(classId, queueId);
    if (!queue.items.some((i) => i.id === itemId)) throw new NotFoundException("Activity not found.");

    await this.prisma.$transaction(async (tx) => {
      await tx.liveClassActivityQueueItem.delete({ where: { id: itemId } });
      const rest = await tx.liveClassActivityQueueItem.findMany({
        where: { queueId },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, position: true }
      });
      for (const [position, row] of rest.entries()) {
        if (row.position !== position) {
          await tx.liveClassActivityQueueItem.update({ where: { id: row.id }, data: { position } });
        }
      }
    });
    return this.respond(queueId);
  }

  // ── Running the queue (coach-owner / admin) ──

  /** DRAFT → LIVE, once. The first activity starts for everyone. */
  async launch(accessToken: string | undefined, classId: string, queueId: string): Promise<ActivityQueueResponse> {
    const { liveSession } = await this.resolveManager(accessToken, classId);
    if (liveSession?.status !== "LIVE") {
      throw new BadRequestException("Start the class before launching a queue.");
    }
    const queue = await this.findOwn(classId, queueId);
    // A double click (or a second coach tab) finds it already running.
    if (queue.status === LiveClassActivityQueueStatus.LIVE) return { queue: await this.toQueue(queue) };
    if (queue.status === LiveClassActivityQueueStatus.FINISHED) {
      throw new ConflictException("This queue has already been run. Create a new one to run it again.");
    }
    const first = queue.items[0];
    if (!first) throw new BadRequestException("Add at least one activity before launching.");

    try {
      const { count } = await this.prisma.liveClassActivityQueue.updateMany({
        where: { id: queueId, status: LiveClassActivityQueueStatus.DRAFT },
        data: { currentItemId: first.id, launchedAt: new Date(), status: LiveClassActivityQueueStatus.LIVE }
      });
      if (count === 0) {
        // Lost the race to another launch of this same queue.
        const fresh = await this.findOwn(classId, queueId);
        if (fresh.status === LiveClassActivityQueueStatus.LIVE) return { queue: await this.toQueue(fresh) };
        throw new ConflictException("This queue has already been run.");
      }
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("Another queue is already running in this class — finish it first.");
      }
      throw error;
    }

    await this.activate(accessToken, classId, first);
    await this.broadcast(liveSession.roomName, queueId);
    return this.respond(queueId);
  }

  /**
   * Moves the whole class from `fromItemId` to the next activity, or finishes
   * the queue after the last one. Claimed with a status + current-item filtered
   * update, so a double click or two coach tabs advance exactly once.
   */
  async advance(
    accessToken: string | undefined,
    classId: string,
    queueId: string,
    body: AdvanceActivityQueueRequest
  ): Promise<ActivityQueueResponse> {
    const { liveSession } = await this.resolveManager(accessToken, classId);
    const queue = await this.findOwn(classId, queueId);
    if (queue.status !== LiveClassActivityQueueStatus.LIVE) {
      throw new ConflictException("This queue is not running.");
    }
    if (queue.currentItemId !== body.fromItemId) {
      throw new ConflictException("The queue has already moved on — refresh to see where the class is.");
    }
    const index = queue.items.findIndex((i) => i.id === body.fromItemId);
    const from = queue.items[index];
    const next = index >= 0 ? (queue.items[index + 1] ?? null) : null;
    // Moving on to another activity needs a live room to run it in.
    if (next && liveSession?.status !== "LIVE") {
      throw new BadRequestException("The class is not live any more.");
    }

    const now = new Date();
    const { count } = await this.prisma.liveClassActivityQueue.updateMany({
      where: { currentItemId: body.fromItemId, id: queueId, status: LiveClassActivityQueueStatus.LIVE },
      data: next
        ? { currentItemId: next.id }
        : { currentItemId: null, finishedAt: now, status: LiveClassActivityQueueStatus.FINISHED }
    });
    if (count === 0) {
      throw new ConflictException("The queue has already moved on — refresh to see where the class is.");
    }

    if (from) {
      await this.prisma.liveClassActivityQueueItem.updateMany({
        where: { completedAt: null, id: from.id },
        data: { completedAt: now }
      });
      await this.deactivate(accessToken, classId, from);
    }
    if (next) await this.activate(accessToken, classId, next);
    if (liveSession) await this.broadcast(liveSession.roomName, queueId);
    return this.respond(queueId);
  }

  /** Ends the queue early (or confirms the end). The current activity is closed. */
  async finish(accessToken: string | undefined, classId: string, queueId: string): Promise<ActivityQueueResponse> {
    const { liveSession } = await this.resolveManager(accessToken, classId);
    const queue = await this.findOwn(classId, queueId);
    if (queue.status === LiveClassActivityQueueStatus.FINISHED) return { queue: await this.toQueue(queue) };
    if (queue.status === LiveClassActivityQueueStatus.DRAFT) {
      throw new ConflictException("This queue hasn't been launched.");
    }

    const now = new Date();
    const { count } = await this.prisma.liveClassActivityQueue.updateMany({
      where: { id: queueId, status: LiveClassActivityQueueStatus.LIVE },
      data: { currentItemId: null, finishedAt: now, status: LiveClassActivityQueueStatus.FINISHED }
    });
    const current = queue.items.find((i) => i.id === queue.currentItemId);
    // Only the request that actually finished it closes the activity.
    if (count === 1 && current) {
      await this.prisma.liveClassActivityQueueItem.updateMany({
        where: { completedAt: null, id: current.id },
        data: { completedAt: now }
      });
      await this.deactivate(accessToken, classId, current);
    }
    if (count === 1 && liveSession) await this.broadcast(liveSession.roomName, queueId);
    return this.respond(queueId);
  }

  // ── Tracking ──

  /** Coach-owner / admin: every student's response to every activity the class has reached. */
  async progress(
    accessToken: string | undefined,
    classId: string,
    queueId: string
  ): Promise<ActivityQueueProgressResponse> {
    const { cls } = await this.resolveManager(accessToken, classId);
    const queue = await this.findOwn(classId, queueId);
    const reached = queue.items.filter((i) => i.activatedAt && i.kind !== LiveClassActivityKind.CHAPTER);

    const assignmentIds = reached.flatMap((i) => (i.puzzleAssignmentId ? [i.puzzleAssignmentId] : []));
    const pollIds = reached.flatMap((i) => (i.movePollId ? [i.movePollId] : []));

    const [roster, assignments, polls] = await Promise.all([
      this.loadRoster(cls.batchId),
      assignmentIds.length
        ? this.prisma.liveClassPuzzleAssignment.findMany({
            where: { id: { in: assignmentIds } },
            select: { endedAt: true, id: true, puzzleId: true, startedAt: true, status: true }
          })
        : Promise.resolve([]),
      pollIds.length
        ? this.prisma.liveClassMovePoll.findMany({
            where: { id: { in: pollIds } },
            include: { answers: { include: { student: { select: { firstName: true, id: true, lastName: true } } } } }
          })
        : Promise.resolve([])
    ]);
    const attempts = assignments.length
      ? await this.prisma.puzzleAttempt.findMany({
          where: { liveClassId: classId, puzzleId: { in: [...new Set(assignments.map((a) => a.puzzleId))] } },
          select: {
            hintsUsed: true,
            puzzleId: true,
            startedAt: true,
            status: true,
            student: { select: { firstName: true, id: true, lastName: true } },
            studentId: true,
            wrongMoves: true
          }
        })
      : [];

    const names = new Map(roster.map((s) => [s.id, fullName(s) ?? "Student"]));
    const assignmentById = new Map(assignments.map((a) => [a.id, a]));
    const pollById = new Map(polls.map((p) => [p.id, p]));
    const cells: ActivityQueueProgressResponse["cells"] = {};
    const respondedCounts: Record<string, number> = {};

    for (const item of reached) {
      const isCurrent = queue.status === LiveClassActivityQueueStatus.LIVE && queue.currentItemId === item.id;
      const byStudent = new Map<string, ActivityResponseCell>();

      if (item.kind === LiveClassActivityKind.PUZZLE) {
        const assignment = item.puzzleAssignmentId ? assignmentById.get(item.puzzleAssignmentId) : undefined;
        if (!assignment) continue; // never started (activation error) — no cells
        const open = assignment.status === "ACTIVE";
        // This share's window: started after it was shared, before it ended.
        const windowed = attempts.filter(
          (a) =>
            a.puzzleId === assignment.puzzleId &&
            a.startedAt >= assignment.startedAt &&
            (!assignment.endedAt || a.startedAt <= assignment.endedAt)
        );
        const perStudent = new Map<string, typeof windowed>();
        for (const attempt of windowed) {
          if (!names.has(attempt.studentId)) names.set(attempt.studentId, fullName(attempt.student) ?? "Student");
          perStudent.set(attempt.studentId, [...(perStudent.get(attempt.studentId) ?? []), attempt]);
        }
        for (const [studentId, rows] of perStudent) {
          byStudent.set(studentId, this.puzzleCell(rows, open));
        }
      } else if (item.kind === LiveClassActivityKind.QUESTION) {
        const poll = item.movePollId ? pollById.get(item.movePollId) : undefined;
        if (!poll) continue;
        for (const answer of poll.answers) {
          if (!names.has(answer.studentId)) names.set(answer.studentId, fullName(answer.student) ?? "Student");
          byStudent.set(answer.studentId, {
            detail: answer.san,
            state: poll.correctUci ? (answer.uci === poll.correctUci ? "CORRECT" : "INCORRECT") : "SUBMITTED"
          });
        }
      }

      const row: Record<string, ActivityResponseCell> = {};
      let responded = 0;
      for (const studentId of names.keys()) {
        const cell = byStudent.get(studentId);
        if (cell && cell.state !== "PENDING" && cell.state !== "MISSED") responded += 1;
        row[studentId] = cell ?? { detail: null, state: isCurrent ? "PENDING" : "MISSED" };
      }
      cells[item.id] = row;
      respondedCounts[item.id] = responded;
    }

    // Students discovered while scanning later items need a cell in earlier ones too.
    for (const item of reached) {
      const row = cells[item.id];
      if (!row) continue;
      const isCurrent = queue.status === LiveClassActivityQueueStatus.LIVE && queue.currentItemId === item.id;
      for (const studentId of names.keys()) {
        row[studentId] ??= { detail: null, state: isCurrent ? "PENDING" : "MISSED" };
      }
    }

    const students = [...names.entries()]
      .map(([studentId, studentName]) => ({ studentId, studentName }))
      .sort((a, b) => a.studentName.localeCompare(b.studentName));
    return { cells, queueId, respondedCounts, students };
  }

  /**
   * Any participant: the running queue as a student may see it — how far the
   * class is, the current activity's kind, and whether *they* responded to each
   * activity so far. Never the upcoming items, other students, or correctness.
   */
  async current(accessToken: string | undefined, classId: string): Promise<StudentActivityQueueResponse> {
    const { user } = await this.liveClass.resolveParticipant(accessToken, classId);
    const queue = await this.prisma.liveClassActivityQueue.findFirst({
      where: { liveClassId: classId, status: LiveClassActivityQueueStatus.LIVE },
      include: queueInclude
    });
    if (!queue) return { queue: null };

    const index = queue.items.findIndex((i) => i.id === queue.currentItemId);
    const current = index >= 0 ? queue.items[index] : null;
    // An activity that couldn't start was never put to the class, so there is
    // nothing to answer (the coach's grid has no column for it either).
    const reached = queue.items.filter(
      (i) => i.activatedAt && !i.activationError && i.kind !== LiveClassActivityKind.CHAPTER
    );

    const assignmentIds = reached.flatMap((i) => (i.puzzleAssignmentId ? [i.puzzleAssignmentId] : []));
    const pollIds = reached.flatMap((i) => (i.movePollId ? [i.movePollId] : []));
    const [assignments, answers] = await Promise.all([
      assignmentIds.length
        ? this.prisma.liveClassPuzzleAssignment.findMany({
            where: { id: { in: assignmentIds } },
            select: { endedAt: true, id: true, puzzleId: true, startedAt: true }
          })
        : Promise.resolve([]),
      pollIds.length
        ? this.prisma.liveClassMovePollAnswer.findMany({
            where: { pollId: { in: pollIds }, studentId: user.id },
            select: { pollId: true }
          })
        : Promise.resolve([])
    ]);
    const attempts = assignments.length
      ? await this.prisma.puzzleAttempt.findMany({
          where: {
            liveClassId: classId,
            puzzleId: { in: assignments.map((a) => a.puzzleId) },
            status: { not: "IN_PROGRESS" },
            studentId: user.id
          },
          select: { puzzleId: true, startedAt: true }
        })
      : [];
    const answered = new Set(answers.map((a) => a.pollId));
    const assignmentById = new Map(assignments.map((a) => [a.id, a]));

    const mine = reached.map((item) => {
      let responded = false;
      if (item.movePollId) responded = answered.has(item.movePollId);
      const assignment = item.puzzleAssignmentId ? assignmentById.get(item.puzzleAssignmentId) : undefined;
      if (assignment) {
        responded = attempts.some(
          (a) =>
            a.puzzleId === assignment.puzzleId &&
            a.startedAt >= assignment.startedAt &&
            (!assignment.endedAt || a.startedAt <= assignment.endedAt)
        );
      }
      return { kind: item.kind, number: item.position + 1, responded };
    });

    return {
      queue: {
        current: current ? { kind: current.kind, title: current.title } : null,
        currentNumber: index + 1,
        mine,
        queueId: queue.id,
        title: queue.title,
        total: queue.items.length
      }
    };
  }

  // ── internals ──

  /**
   * The class's own coach (or the live session's coach) or an admin. Uses the
   * class row, not the LiveSession, so a queue can be drafted before class.
   */
  private async resolveManager(accessToken: string | undefined, classId: string): Promise<Manager> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (user.role !== UserRole.COACH && !isAdmin) {
      throw new ForbiddenException("You do not have permission to manage this class.");
    }
    const [cls, liveSession] = await Promise.all([
      this.prisma.coachClass.findUnique({
        where: { id: classId },
        select: { batchId: true, coachId: true, id: true }
      }),
      this.prisma.liveSession.findUnique({
        where: { classId },
        select: { coachId: true, roomName: true, status: true }
      })
    ]);
    if (!cls) throw new NotFoundException("Class not found.");
    if (!isAdmin && cls.coachId !== user.id && liveSession?.coachId !== user.id) {
      throw new ForbiddenException("You can only manage your own classes.");
    }
    return { cls: { batchId: cls.batchId, id: cls.id }, liveSession, user };
  }

  /** A queue id from another class is "not found", never a hint that it exists. */
  private async findOwn(classId: string, queueId: string): Promise<QueueRow> {
    const row = await this.prisma.liveClassActivityQueue.findUnique({
      where: { id: queueId },
      include: queueInclude
    });
    if (!row || row.liveClassId !== classId) throw new NotFoundException("Queue not found.");
    return row;
  }

  private async findOwnDraft(classId: string, queueId: string): Promise<QueueRow> {
    const row = await this.findOwn(classId, queueId);
    if (row.status !== LiveClassActivityQueueStatus.DRAFT) {
      throw new ConflictException("This queue has already been launched — it can no longer be edited.");
    }
    return row;
  }

  /** Validates every input against what the caller may use; one bad item rejects the batch. */
  private async resolveInputs(
    manager: Manager,
    inputs: ActivityQueueItemInput[]
  ): Promise<Omit<Prisma.LiveClassActivityQueueItemCreateManyInput, "position" | "queueId">[]> {
    const isAdmin = manager.user.role === UserRole.ADMIN || manager.user.role === UserRole.SUPER_ADMIN;
    const puzzleIds = inputs.flatMap((i) => (i.kind === "PUZZLE" ? [i.puzzleId] : []));
    const chapterIds = inputs.flatMap((i) => (i.kind === "CHAPTER" ? [i.chapterId] : []));

    const [puzzles, chapters] = await Promise.all([
      puzzleIds.length
        ? this.prisma.puzzle.findMany({
            where: {
              id: { in: puzzleIds },
              status: PuzzleStatus.PUBLISHED,
              // Same rule as sharing one live: global, or the coach's own.
              ...(isAdmin ? {} : { OR: [{ visibility: PuzzleVisibility.GLOBAL }, { createdById: manager.user.id }] })
            },
            select: { id: true, title: true }
          })
        : Promise.resolve([]),
      chapterIds.length
        ? this.prisma.liveClassChapter.findMany({
            where: { id: { in: chapterIds }, scopeKey: this.chapterScopeKey(manager.cls) },
            select: { id: true, title: true }
          })
        : Promise.resolve([])
    ]);
    const puzzleById = new Map(puzzles.map((p) => [p.id, p]));
    const chapterById = new Map(chapters.map((c) => [c.id, c]));

    return inputs.map((input) => {
      switch (input.kind) {
        case "PUZZLE": {
          const puzzle = puzzleById.get(input.puzzleId);
          if (!puzzle) throw new NotFoundException("Puzzle not found, not published, or not yours to use.");
          return {
            durationSeconds: input.durationSeconds ?? null,
            kind: LiveClassActivityKind.PUZZLE,
            puzzleId: puzzle.id,
            title: puzzle.title.slice(0, 200)
          };
        }
        case "QUESTION": {
          const chess = this.loadPosition(input.fen);
          if (chess.isGameOver()) throw new BadRequestException("There is no move to play in that position.");
          let correctUci: string | null = null;
          if (input.correctUci) {
            try {
              const move = chess.move({
                from: input.correctUci.slice(0, 2),
                promotion: input.correctUci[4],
                to: input.correctUci.slice(2, 4)
              });
              correctUci = move.from + move.to + (move.promotion ?? "");
            } catch {
              throw new BadRequestException("The marked answer is not a legal move in that position.");
            }
          }
          const prompt = input.prompt?.trim() || null;
          return {
            correctUci,
            fen: this.loadPosition(input.fen).fen(),
            kind: LiveClassActivityKind.QUESTION,
            prompt,
            title: prompt ?? DEFAULT_QUESTION_TITLE
          };
        }
        case "CHAPTER": {
          const chapter = chapterById.get(input.chapterId);
          if (!chapter) throw new NotFoundException("Chapter not found.");
          return { chapterId: chapter.id, kind: LiveClassActivityKind.CHAPTER, title: chapter.title };
        }
      }
    });
  }

  /** Starts an item through the feature that owns it; a failure is recorded, not thrown. */
  private async activate(accessToken: string | undefined, classId: string, item: ItemRow): Promise<void> {
    const data: Prisma.LiveClassActivityQueueItemUncheckedUpdateInput = {
      activatedAt: new Date(),
      activationError: null
    };
    try {
      if (item.kind === LiveClassActivityKind.PUZZLE) {
        if (!item.puzzleId) throw new BadRequestException("This puzzle is no longer available.");
        const { assignment } = await this.puzzles.assign(accessToken, classId, {
          durationSeconds: item.durationSeconds ?? undefined,
          puzzleId: item.puzzleId
        });
        if (assignment) data.puzzleAssignmentId = assignment.id;
      } else if (item.kind === LiveClassActivityKind.QUESTION) {
        if (!item.fen) throw new BadRequestException("This question has no position.");
        const { poll } = await this.polls.start(accessToken, classId, {
          fen: item.fen,
          prompt: item.prompt ?? undefined
        });
        if (poll) {
          data.movePollId = poll.id;
          if (item.correctUci) await this.polls.update(accessToken, classId, { correctUci: item.correctUci });
        }
      } else {
        // CHAPTER: the coach's client loads it onto the shared board. `chapterId`
        // has no FK, so a chapter deleted after it was queued still has an id here.
        const chapter = item.chapterId
          ? await this.prisma.liveClassChapter.findUnique({ select: { id: true }, where: { id: item.chapterId } })
          : null;
        if (!chapter) throw new BadRequestException("This chapter was deleted.");
      }
    } catch (error) {
      data.activationError = this.messageOf(error);
      this.logger.warn(`Activity ${item.id} in class ${classId} could not start: ${data.activationError}`);
    }
    await this.prisma.liveClassActivityQueueItem.update({ where: { id: item.id }, data });
  }

  /** Closes the item's own puzzle share / poll — never one the coach started by hand since. */
  private async deactivate(accessToken: string | undefined, classId: string, item: ItemRow): Promise<void> {
    try {
      if (item.puzzleAssignmentId) {
        const active = await this.prisma.liveClassPuzzleAssignment.findFirst({
          where: { liveClassId: classId, status: "ACTIVE" },
          select: { id: true }
        });
        if (active?.id === item.puzzleAssignmentId) await this.puzzles.end(accessToken, classId);
      }
      if (item.movePollId) {
        const open = await this.prisma.liveClassMovePoll.findFirst({
          where: { liveClassId: classId, status: { not: LiveClassMovePollStatus.ENDED } },
          select: { id: true }
        });
        if (open?.id === item.movePollId) await this.polls.end(accessToken, classId);
      }
    } catch (error) {
      // The queue already moved on; a puzzle left open costs the coach one click.
      this.logger.warn(`Couldn't close activity ${item.id} in class ${classId}: ${this.messageOf(error)}`);
    }
  }

  /** A student's attempts at one puzzle share, summed up into one cell. */
  private puzzleCell(
    rows: { status: string; hintsUsed: number; wrongMoves: number }[],
    open: boolean
  ): ActivityResponseCell {
    const tries = rows.filter((r) => r.status !== "IN_PROGRESS").length;
    const hints = rows.reduce((sum, r) => sum + r.hintsUsed, 0);
    const parts = [
      tries > 0 ? `${tries} ${tries === 1 ? "try" : "tries"}` : null,
      hints > 0 ? `${hints} ${hints === 1 ? "hint" : "hints"}` : null
    ].filter(Boolean);
    const detail = parts.length ? parts.join(" · ") : null;

    if (rows.some((r) => r.status === "SOLVED")) return { detail, state: "CORRECT" };
    if (open && rows.some((r) => r.status === "IN_PROGRESS")) return { detail, state: "IN_PROGRESS" };
    if (rows.some((r) => r.status === "FAILED" || r.status === "ABANDONED")) return { detail, state: "INCORRECT" };
    // Only an attempt left open when the puzzle closed: a wrong move is still a
    // (wrong) answer; an attempt with no wrong move never answered anything.
    const wrong = rows.reduce((sum, r) => sum + r.wrongMoves, 0);
    if (wrong > 0) {
      return { detail: `Unfinished · ${wrong} wrong ${wrong === 1 ? "move" : "moves"}`, state: "INCORRECT" };
    }
    return { detail: "Unfinished", state: "MISSED" };
  }

  /** Enrolled students of the class's batch (none for a batch-less class). */
  private async loadRoster(batchId: string | null) {
    if (!batchId) return [];
    const rows = await this.prisma.batchStudent.findMany({
      where: { batchId, isDeleted: false },
      include: { student: { select: { firstName: true, id: true, lastName: true } } }
    });
    return rows.map((r) => r.student);
  }

  private chapterScopeKey(cls: { id: string; batchId: string | null }) {
    // Mirrors LiveClassChapterService.scopeOf.
    return cls.batchId ? `batch:${cls.batchId}` : `class:${cls.id}`;
  }

  private loadPosition(fen: string): Chess {
    try {
      return new Chess(fen);
    } catch {
      throw new BadRequestException("That position is not valid.");
    }
  }

  private async respond(queueId: string): Promise<ActivityQueueResponse> {
    const row = await this.prisma.liveClassActivityQueue.findUniqueOrThrow({
      where: { id: queueId },
      include: queueInclude
    });
    return { queue: await this.toQueue(row) };
  }

  private async toQueue(row: QueueRow): Promise<ActivityQueue> {
    return (await this.toQueues([row]))[0];
  }

  /** Looks up every referenced puzzle / chapter once, to say which are still usable. */
  private async toQueues(rows: QueueRow[]): Promise<ActivityQueue[]> {
    const items = rows.flatMap((r) => r.items);
    const puzzleIds = [...new Set(items.flatMap((i) => (i.puzzleId ? [i.puzzleId] : [])))];
    const chapterIds = [...new Set(items.flatMap((i) => (i.chapterId ? [i.chapterId] : [])))];
    const [puzzles, chapters] = await Promise.all([
      puzzleIds.length
        ? this.prisma.puzzle.findMany({
            where: { id: { in: puzzleIds }, status: PuzzleStatus.PUBLISHED },
            select: { id: true }
          })
        : Promise.resolve([]),
      chapterIds.length
        ? this.prisma.liveClassChapter.findMany({
            where: { id: { in: chapterIds } },
            select: { id: true, state: true }
          })
        : Promise.resolve([])
    ]);
    const livePuzzles = new Set(puzzles.map((p) => p.id));
    const chapterStates = new Map(chapters.map((c) => [c.id, parseActivityChapterState(c.state)]));

    return rows.map((row) => ({
      classId: row.liveClassId,
      createdAt: row.createdAt.toISOString(),
      currentItemId: row.currentItemId,
      finishedAt: row.finishedAt?.toISOString() ?? null,
      id: row.id,
      items: row.items.map((item, index): ActivityQueueItem => {
        const chapterState = item.chapterId ? (chapterStates.get(item.chapterId) ?? null) : null;
        const available =
          item.kind === LiveClassActivityKind.PUZZLE
            ? !!item.puzzleId && livePuzzles.has(item.puzzleId)
            : item.kind === LiveClassActivityKind.CHAPTER
              ? chapterState !== null
              : true;
        return {
          activatedAt: item.activatedAt?.toISOString() ?? null,
          activationError: item.activationError,
          available,
          chapterId: item.chapterId,
          chapterState,
          completedAt: item.completedAt?.toISOString() ?? null,
          correctUci: item.correctUci,
          durationSeconds: item.durationSeconds,
          fen: item.fen,
          id: item.id,
          kind: item.kind,
          position: index,
          prompt: item.prompt,
          puzzleId: item.puzzleId,
          title: item.title
        };
      }),
      launchedAt: row.launchedAt?.toISOString() ?? null,
      status: row.status,
      title: row.title,
      updatedAt: row.updatedAt.toISOString()
    }));
  }

  private messageOf(error: unknown): string {
    if (error instanceof HttpException) {
      const response = error.getResponse();
      if (typeof response === "object" && response && "message" in response) {
        const message = (response as { message: unknown }).message;
        if (typeof message === "string") return message;
        if (Array.isArray(message)) return message.join(", ");
      }
      return error.message;
    }
    return "Something went wrong starting this activity.";
  }

  private isUniqueViolation(error: unknown) {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
  }

  private async broadcast(roomName: string, queueId: string): Promise<void> {
    try {
      await this.livekit.broadcastData(
        roomName,
        encodeActivityQueueMessage({ queueId, type: "QUEUE_CHANGED" }),
        LIVE_CLASS_ACTIVITY_QUEUE_TOPIC
      );
    } catch {
      // Nudge only — REST is authoritative and clients refetch on a slow poll.
    }
  }
}
