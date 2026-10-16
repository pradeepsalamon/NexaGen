/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { decodeActivityQueueMessage, LIVE_CLASS_ACTIVITY_QUEUE_TOPIC } from "@nexa-chess/types";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { LiveClassMovePollService } from "../move-poll/live-class-move-poll.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassPuzzleService } from "../puzzle/live-class-puzzle.service";
import { ActivityQueueService } from "./activity-queue.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const OTHER_CLASS_ID = "class-2";
const BATCH_ID = "batch-1";
const COACH_ID = "coach-1";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const T0 = new Date("2026-10-16T10:00:00Z");

const users: Record<string, { id: string; role: UserRole; status: UserStatus }> = {
  admin: { id: "admin", role: UserRole.ADMIN, status: UserStatus.ACTIVE },
  [COACH_ID]: { id: COACH_ID, role: UserRole.COACH, status: UserStatus.ACTIVE },
  "coach-2": { id: "coach-2", role: UserRole.COACH, status: UserStatus.ACTIVE },
  "student-1": { id: "student-1", role: UserRole.STUDENT, status: UserStatus.ACTIVE },
  "student-2": { id: "student-2", role: UserRole.STUDENT, status: UserStatus.ACTIVE }
};

const puzzles = [
  { createdById: COACH_ID, id: "pz-own", status: "PUBLISHED", title: "Own puzzle", visibility: "PRIVATE" },
  { createdById: "admin", id: "pz-global", status: "PUBLISHED", title: "Global puzzle", visibility: "GLOBAL" },
  { createdById: "coach-2", id: "pz-foreign", status: "PUBLISHED", title: "Someone else's", visibility: "PRIVATE" },
  { createdById: COACH_ID, id: "pz-draft", status: "DRAFT", title: "Draft", visibility: "PRIVATE" }
];

const chapterState = { arrows: [], fen: START, historyIndex: -1, orientation: "white", pgn: "", squares: {} };
const chapters = [
  { id: "ch-1", scopeKey: `batch:${BATCH_ID}`, state: chapterState, title: "Opening ideas" },
  { id: "ch-other", scopeKey: "batch:other", state: chapterState, title: "Another batch's" }
];

const p2002 = () => new Prisma.PrismaClientKnownRequestError("dup", { clientVersion: "test", code: "P2002" });

/** A small in-memory stand-in for the tables the queue touches. */
function createFakePrisma() {
  const state = {
    assignments: [] as any[],
    attempts: [] as any[],
    items: [] as any[],
    pollAnswers: [] as any[],
    polls: [] as any[],
    queues: [] as any[],
    session: { coachId: COACH_ID, roomName: "room-1", status: "LIVE" } as any
  };
  let seq = 0;
  const id = (prefix: string) => `${prefix}-${++seq}`;
  const itemsOf = (queueId: string) =>
    state.items.filter((i) => i.queueId === queueId).sort((a, b) => a.position - b.position);
  const withItems = (q: any) => (q ? { ...q, items: itemsOf(q.id) } : null);
  const matches = (row: any, where: any = {}) =>
    Object.entries(where).every(([key, cond]: [string, any]) => {
      if (cond && typeof cond === "object" && !(cond instanceof Date)) {
        if ("in" in cond) return cond.in.includes(row[key]);
        if ("not" in cond) return row[key] !== cond.not;
      }
      return row[key] === cond;
    });

  const prisma: any = {
    $transaction: jest.fn(async (arg: any) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg))),
    batchStudent: {
      findMany: jest.fn(async () => [
        { student: { firstName: "Ava", id: "student-1", lastName: null } },
        { student: { firstName: "Raj", id: "student-2", lastName: null } }
      ])
    },
    coachClass: {
      findUnique: jest.fn(async ({ where }: any) =>
        where.id === CLASS_ID
          ? { batchId: BATCH_ID, coachId: COACH_ID, id: CLASS_ID }
          : where.id === OTHER_CLASS_ID
            ? { batchId: null, coachId: "coach-2", id: OTHER_CLASS_ID }
            : null
      )
    },
    liveClassActivityQueue: {
      count: jest.fn(async ({ where }: any) => state.queues.filter((q) => matches(q, where)).length),
      create: jest.fn(async ({ data }: any) => {
        if (state.queues.some((q) => q.liveClassId === data.liveClassId && q.clientId === data.clientId)) throw p2002();
        const row = {
          createdAt: T0,
          currentItemId: null,
          finishedAt: null,
          id: id("q"),
          launchedAt: null,
          status: "DRAFT",
          updatedAt: T0,
          ...data
        };
        state.queues.push(row);
        return withItems(row);
      }),
      deleteMany: jest.fn(async ({ where }: any) => {
        const before = state.queues.length;
        state.queues = state.queues.filter((q) => !matches(q, where));
        return { count: before - state.queues.length };
      }),
      findFirst: jest.fn(async ({ where }: any) => withItems(state.queues.find((q) => matches(q, where)))),
      findMany: jest.fn(async ({ where }: any) => state.queues.filter((q) => matches(q, where)).map(withItems)),
      findUnique: jest.fn(async ({ where }: any) => {
        if (where.liveClassId_clientId) {
          const { clientId, liveClassId } = where.liveClassId_clientId;
          return withItems(state.queues.find((q) => q.liveClassId === liveClassId && q.clientId === clientId));
        }
        const row = state.queues.find((q) => q.id === where.id);
        return row ? { ...withItems(row), _count: { items: itemsOf(row.id).length } } : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: any) => withItems(state.queues.find((q) => q.id === where.id))),
      update: jest.fn(async ({ data, where }: any) => {
        const row = state.queues.find((q) => q.id === where.id);
        Object.assign(row, data);
        return withItems(row);
      }),
      updateMany: jest.fn(async ({ data, where }: any) => {
        const rows = state.queues.filter((q) => matches(q, where));
        if (data.status === "LIVE") {
          for (const row of rows) {
            if (state.queues.some((q) => q !== row && q.liveClassId === row.liveClassId && q.status === "LIVE")) {
              throw p2002(); // the partial unique index
            }
          }
        }
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      })
    },
    liveClassActivityQueueItem: {
      createMany: jest.fn(async ({ data }: any) => {
        for (const row of data) {
          state.items.push({
            activatedAt: null,
            activationError: null,
            chapterId: null,
            completedAt: null,
            correctUci: null,
            createdAt: T0,
            durationSeconds: null,
            fen: null,
            id: id("it"),
            movePollId: null,
            prompt: null,
            puzzleAssignmentId: null,
            puzzleId: null,
            updatedAt: T0,
            ...row
          });
        }
        return { count: data.length };
      }),
      delete: jest.fn(async ({ where }: any) => {
        state.items = state.items.filter((i) => i.id !== where.id);
      }),
      findMany: jest.fn(async ({ where }: any) => itemsOf(where.queueId)),
      update: jest.fn(async ({ data, where }: any) => Object.assign(state.items.find((i) => i.id === where.id), data)),
      updateMany: jest.fn(async ({ data, where }: any) => {
        const rows = state.items.filter((i) => matches(i, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      })
    },
    liveClassChapter: {
      findMany: jest.fn(async ({ where }: any) => chapters.filter((c) => matches(c, where)))
    },
    liveClassMovePoll: {
      findFirst: jest.fn(async ({ where }: any) => state.polls.find((p) => matches(p, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        state.polls
          .filter((p) => matches(p, where))
          .map((p) => ({ ...p, answers: state.pollAnswers.filter((a) => a.pollId === p.id) }))
      )
    },
    liveClassMovePollAnswer: {
      findMany: jest.fn(async ({ where }: any) => state.pollAnswers.filter((a) => matches(a, where)))
    },
    liveClassPuzzleAssignment: {
      findFirst: jest.fn(async ({ where }: any) => state.assignments.find((a) => matches(a, where)) ?? null),
      findMany: jest.fn(async ({ where }: any) => state.assignments.filter((a) => matches(a, where)))
    },
    liveSession: { findUnique: jest.fn(async ({ where }: any) => (where.classId === CLASS_ID ? state.session : null)) },
    puzzle: {
      findMany: jest.fn(async ({ where }: any) =>
        puzzles.filter(
          (p) =>
            where.id.in.includes(p.id) &&
            p.status === where.status &&
            (!where.OR || where.OR.some((cond: any) => matches(p, cond)))
        )
      )
    },
    puzzleAttempt: {
      findMany: jest.fn(async ({ where }: any) => state.attempts.filter((a) => matches(a, where)))
    },
    user: { findUnique: jest.fn(async ({ where }: any) => users[where.id] ?? null) }
  };
  return { prisma, state };
}

describe("ActivityQueueService", () => {
  let service: ActivityQueueService;
  let prisma: any;
  let state: ReturnType<typeof createFakePrisma>["state"];
  let jwt: { verifyAsync: jest.Mock };
  let livekit: { broadcastData: jest.Mock };
  let livePuzzles: { assign: jest.Mock; end: jest.Mock };
  let polls: { end: jest.Mock; start: jest.Mock; update: jest.Mock };
  let liveClass: { resolveParticipant: jest.Mock };
  let clock = T0.getTime();

  const as = (userId: string) => jwt.verifyAsync.mockResolvedValue({ sub: userId, type: "access" });

  /** A draft with a puzzle, a question and a chapter, in that order. */
  async function draftQueue() {
    const { queue } = await service.create(TOKEN, CLASS_ID, { clientId: "client-0001", title: "Tactics warm-up" });
    await service.addItems(TOKEN, CLASS_ID, queue.id, {
      items: [
        { durationSeconds: 120, kind: "PUZZLE", puzzleId: "pz-own" },
        { correctUci: "e2e4", fen: START, kind: "QUESTION", prompt: "Best first move?" },
        { chapterId: "ch-1", kind: "CHAPTER" }
      ]
    });
    return queue.id;
  }

  beforeEach(async () => {
    ({ prisma, state } = createFakePrisma());
    jwt = { verifyAsync: jest.fn() };
    as(COACH_ID);
    livekit = { broadcastData: jest.fn().mockResolvedValue(undefined) };
    livePuzzles = {
      assign: jest.fn(async (_t: string, classId: string, dto: any) => {
        state.assignments.forEach((a) => {
          if (a.status === "ACTIVE") Object.assign(a, { endedAt: new Date(clock), status: "ENDED" });
        });
        const row = {
          endedAt: null,
          id: `asg-${state.assignments.length + 1}`,
          liveClassId: classId,
          puzzleId: dto.puzzleId,
          startedAt: new Date(clock),
          status: "ACTIVE"
        };
        state.assignments.push(row);
        return { assignment: { id: row.id } };
      }),
      end: jest.fn(async () => {
        state.assignments.forEach((a) => {
          if (a.status === "ACTIVE") Object.assign(a, { endedAt: new Date(clock), status: "ENDED" });
        });
        return { assignment: null };
      })
    };
    polls = {
      end: jest.fn(async () => {
        state.polls.forEach((p) => (p.status = "ENDED"));
        return { poll: null };
      }),
      start: jest.fn(async (_t: string, classId: string, dto: any) => {
        state.polls.forEach((p) => (p.status = "ENDED"));
        const row = { correctUci: null, fen: dto.fen, id: `poll-${state.polls.length + 1}`, liveClassId: classId, status: "OPEN" };
        state.polls.push(row);
        return { poll: { id: row.id } };
      }),
      update: jest.fn(async (_t: string, _c: string, dto: any) => {
        const open = state.polls.find((p) => p.status !== "ENDED");
        if (open && dto.correctUci !== undefined) open.correctUci = dto.correctUci;
        return { poll: open };
      })
    };
    liveClass = {
      resolveParticipant: jest.fn(async () => ({ liveSession: state.session, user: users["student-1"] }))
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivityQueueService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: LiveClassService, useValue: liveClass },
        { provide: LiveKitService, useValue: livekit },
        { provide: LiveClassPuzzleService, useValue: livePuzzles },
        { provide: LiveClassMovePollService, useValue: polls }
      ]
    }).compile();
    service = moduleRef.get(ActivityQueueService);
    clock = T0.getTime();
  });

  describe("authorization", () => {
    it("refuses a student and another coach's class, but lets an admin manage any class", async () => {
      as("student-1");
      await expect(service.list(TOKEN, CLASS_ID)).rejects.toBeInstanceOf(ForbiddenException);
      as(COACH_ID);
      await expect(service.list(TOKEN, OTHER_CLASS_ID)).rejects.toBeInstanceOf(ForbiddenException);
      as("admin");
      await expect(service.list(TOKEN, OTHER_CLASS_ID)).resolves.toEqual({ classLive: false, queues: [] });
    });

    it("works before the class has a live session (drafting ahead of class)", async () => {
      state.session = null;
      const { queue } = await service.create(TOKEN, CLASS_ID, { clientId: "client-0001", title: "Prep" });
      expect(queue.status).toBe("DRAFT");
      await expect(service.list(TOKEN, CLASS_ID)).resolves.toMatchObject({ classLive: false });
    });

    it("treats a queue id from another class as not found", async () => {
      const queueId = await draftQueue();
      as("admin");
      await expect(service.progress(TOKEN, OTHER_CLASS_ID, queueId)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("drafting", () => {
    it("returns the same queue for a retried create", async () => {
      const a = await service.create(TOKEN, CLASS_ID, { clientId: "client-0001", title: "Warm-up" });
      const b = await service.create(TOKEN, CLASS_ID, { clientId: "client-0001", title: "Warm-up" });
      expect(b.queue.id).toBe(a.queue.id);
      expect(state.queues).toHaveLength(1);
    });

    it("adds referenced items in order, with titles from what they reference", async () => {
      const queueId = await draftQueue();
      const { queue } = await service.rename(TOKEN, CLASS_ID, queueId, { title: "Renamed" });
      expect(queue.title).toBe("Renamed");
      expect(queue.items.map((i) => [i.position, i.kind, i.title, i.available])).toEqual([
        [0, "PUZZLE", "Own puzzle", true],
        [1, "QUESTION", "Best first move?", true],
        [2, "CHAPTER", "Opening ideas", true]
      ]);
      expect(queue.items[0]).toMatchObject({ durationSeconds: 120, puzzleId: "pz-own" });
      expect(queue.items[1]).toMatchObject({ correctUci: "e2e4", fen: START });
      expect(queue.items[2].chapterState?.fen).toBe(START);
    });

    it("refuses puzzles the coach may not share, and chapters from another scope", async () => {
      const { queue } = await service.create(TOKEN, CLASS_ID, { clientId: "client-0001", title: "Q" });
      for (const puzzleId of ["pz-foreign", "pz-draft", "pz-missing"]) {
        await expect(
          service.addItems(TOKEN, CLASS_ID, queue.id, { items: [{ kind: "PUZZLE", puzzleId }] })
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      await expect(
        service.addItems(TOKEN, CLASS_ID, queue.id, { items: [{ chapterId: "ch-other", kind: "CHAPTER" }] })
      ).rejects.toBeInstanceOf(NotFoundException);
      // One bad item rejects the whole batch.
      await expect(
        service.addItems(TOKEN, CLASS_ID, queue.id, {
          items: [
            { kind: "PUZZLE", puzzleId: "pz-global" },
            { kind: "PUZZLE", puzzleId: "pz-foreign" }
          ]
        })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(state.items).toHaveLength(0);
    });

    it("validates a question's position and marked answer on the server", async () => {
      const { queue } = await service.create(TOKEN, CLASS_ID, { clientId: "client-0001", title: "Q" });
      await expect(
        service.addItems(TOKEN, CLASS_ID, queue.id, { items: [{ fen: "not a fen at all", kind: "QUESTION" }] })
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.addItems(TOKEN, CLASS_ID, queue.id, { items: [{ correctUci: "e2e5", fen: START, kind: "QUESTION" }] })
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("reorders only with the complete current list and closes gaps on removal", async () => {
      const queueId = await draftQueue();
      const ids = (await service.list(TOKEN, CLASS_ID)).queues[0].items.map((i) => i.id);
      await expect(
        service.reorder(TOKEN, CLASS_ID, queueId, { ids: ids.slice(0, 2) })
      ).rejects.toBeInstanceOf(ConflictException);
      const reordered = await service.reorder(TOKEN, CLASS_ID, queueId, { ids: [ids[2], ids[0], ids[1]] });
      expect(reordered.queue.items.map((i) => i.kind)).toEqual(["CHAPTER", "PUZZLE", "QUESTION"]);

      const removed = await service.removeItem(TOKEN, CLASS_ID, queueId, ids[0]);
      expect(removed.queue.items.map((i) => [i.position, i.kind])).toEqual([
        [0, "CHAPTER"],
        [1, "QUESTION"]
      ]);
    });

    it("locks the queue once launched", async () => {
      const queueId = await draftQueue();
      await service.launch(TOKEN, CLASS_ID, queueId);
      await expect(
        service.addItems(TOKEN, CLASS_ID, queueId, { items: [{ kind: "PUZZLE", puzzleId: "pz-global" }] })
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(service.remove(TOKEN, CLASS_ID, queueId)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("launch", () => {
    it("needs a live class and at least one item", async () => {
      const { queue } = await service.create(TOKEN, CLASS_ID, { clientId: "client-0001", title: "Empty" });
      await expect(service.launch(TOKEN, CLASS_ID, queue.id)).rejects.toBeInstanceOf(BadRequestException);
      const queueId = await (async () => {
        await service.addItems(TOKEN, CLASS_ID, queue.id, { items: [{ kind: "PUZZLE", puzzleId: "pz-own" }] });
        return queue.id;
      })();
      state.session.status = "ENDED";
      await expect(service.launch(TOKEN, CLASS_ID, queueId)).rejects.toBeInstanceOf(BadRequestException);
    });

    it("starts the first activity once for the whole class; a double launch is a no-op", async () => {
      const queueId = await draftQueue();
      const { queue } = await service.launch(TOKEN, CLASS_ID, queueId);

      expect(queue.status).toBe("LIVE");
      expect(queue.currentItemId).toBe(queue.items[0].id);
      expect(livePuzzles.assign).toHaveBeenCalledWith(TOKEN, CLASS_ID, { durationSeconds: 120, puzzleId: "pz-own" });
      expect(state.items[0].puzzleAssignmentId).toBe("asg-1");
      expect(queue.items[0].activatedAt).not.toBeNull();

      const [room, payload, topic] = livekit.broadcastData.mock.calls[0];
      expect([room, topic]).toEqual(["room-1", LIVE_CLASS_ACTIVITY_QUEUE_TOPIC]);
      expect(decodeActivityQueueMessage(payload)).toEqual({ queueId, type: "QUEUE_CHANGED" });

      await service.launch(TOKEN, CLASS_ID, queueId);
      expect(livePuzzles.assign).toHaveBeenCalledTimes(1);
    });

    it("allows one running queue per class", async () => {
      const first = await draftQueue();
      const { queue: second } = await service.create(TOKEN, CLASS_ID, { clientId: "client-0002", title: "B" });
      await service.addItems(TOKEN, CLASS_ID, second.id, { items: [{ kind: "PUZZLE", puzzleId: "pz-global" }] });
      await service.launch(TOKEN, CLASS_ID, first);
      await expect(service.launch(TOKEN, CLASS_ID, second.id)).rejects.toBeInstanceOf(ConflictException);
    });

    it("never runs a finished queue again", async () => {
      const queueId = await draftQueue();
      await service.launch(TOKEN, CLASS_ID, queueId);
      await service.finish(TOKEN, CLASS_ID, queueId);
      await expect(service.launch(TOKEN, CLASS_ID, queueId)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("shared progression", () => {
    it("advances the class item by item and finishes after the last", async () => {
      const queueId = await draftQueue();
      const launched = (await service.launch(TOKEN, CLASS_ID, queueId)).queue;
      const [puzzle, question, chapter] = launched.items;

      clock += 60_000;
      const second = (await service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: puzzle.id })).queue;
      expect(second.currentItemId).toBe(question.id);
      expect(second.items[0].completedAt).not.toBeNull();
      // The puzzle the item shared is closed before the question is asked.
      expect(livePuzzles.end).toHaveBeenCalledTimes(1);
      expect(polls.start).toHaveBeenCalledWith(TOKEN, CLASS_ID, { fen: START, prompt: "Best first move?" });
      expect(polls.update).toHaveBeenCalledWith(TOKEN, CLASS_ID, { correctUci: "e2e4" });
      expect(state.items[1].movePollId).toBe("poll-1");

      const third = (await service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: question.id })).queue;
      expect(third.currentItemId).toBe(chapter.id);
      expect(polls.end).toHaveBeenCalledTimes(1);

      const done = (await service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: chapter.id })).queue;
      expect(done).toMatchObject({ currentItemId: null, status: "FINISHED" });
      expect(done.items.every((i) => i.completedAt)).toBe(true);
    });

    it("advances exactly once for a double click or a stale view", async () => {
      const queueId = await draftQueue();
      const [puzzle] = (await service.launch(TOKEN, CLASS_ID, queueId)).queue.items;
      await service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: puzzle.id });
      await expect(
        service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: puzzle.id })
      ).rejects.toBeInstanceOf(ConflictException);
      expect(polls.start).toHaveBeenCalledTimes(1);
    });

    it("loses a race on the claim instead of skipping an activity", async () => {
      const queueId = await draftQueue();
      const [puzzle] = (await service.launch(TOKEN, CLASS_ID, queueId)).queue.items;
      // Another tab moved the queue between this request's read and its write.
      prisma.liveClassActivityQueue.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: puzzle.id })
      ).rejects.toBeInstanceOf(ConflictException);
      expect(polls.start).not.toHaveBeenCalled();
    });

    it("leaves a puzzle the coach shared by hand since then alone", async () => {
      const queueId = await draftQueue();
      const [puzzle] = (await service.launch(TOKEN, CLASS_ID, queueId)).queue.items;
      await livePuzzles.assign(TOKEN, CLASS_ID, { puzzleId: "pz-global" }); // manual share
      livePuzzles.end.mockClear();
      await service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: puzzle.id });
      expect(livePuzzles.end).not.toHaveBeenCalled();
    });

    it("records an activity that cannot start rather than failing the advance", async () => {
      const queueId = await draftQueue();
      livePuzzles.assign.mockRejectedValueOnce(new NotFoundException("Puzzle not found or not published."));
      const { queue } = await service.launch(TOKEN, CLASS_ID, queueId);
      expect(queue.status).toBe("LIVE");
      expect(queue.items[0].activationError).toBe("Puzzle not found or not published.");
      // The coach can still move on.
      const next = await service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: queue.items[0].id });
      expect(next.queue.currentItemId).toBe(queue.items[1].id);
    });

    it("finishing early closes the current activity once", async () => {
      const queueId = await draftQueue();
      await service.launch(TOKEN, CLASS_ID, queueId);
      const { queue } = await service.finish(TOKEN, CLASS_ID, queueId);
      expect(queue.status).toBe("FINISHED");
      await service.finish(TOKEN, CLASS_ID, queueId);
      expect(livePuzzles.end).toHaveBeenCalledTimes(1);
      expect(livekit.broadcastData).toHaveBeenCalledTimes(2); // launch + one finish
    });
  });

  describe("response tracking", () => {
    async function runThroughQuestion() {
      const queueId = await draftQueue();
      const [puzzle, question] = (await service.launch(TOKEN, CLASS_ID, queueId)).queue.items;
      const shareStart = new Date(clock);
      // An attempt from before this share (an earlier share of the same puzzle) must not count.
      state.attempts.push(
        { hintsUsed: 0, liveClassId: CLASS_ID, puzzleId: "pz-own", startedAt: new Date(clock - 1), status: "SOLVED", student: { firstName: "Raj", id: "student-2", lastName: null }, studentId: "student-2", wrongMoves: 0 },
        { hintsUsed: 1, liveClassId: CLASS_ID, puzzleId: "pz-own", startedAt: shareStart, status: "FAILED", student: { firstName: "Ava", id: "student-1", lastName: null }, studentId: "student-1", wrongMoves: 2 },
        { hintsUsed: 0, liveClassId: CLASS_ID, puzzleId: "pz-own", startedAt: new Date(clock + 5_000), status: "SOLVED", student: { firstName: "Ava", id: "student-1", lastName: null }, studentId: "student-1", wrongMoves: 0 }
      );
      clock += 60_000;
      await service.advance(TOKEN, CLASS_ID, queueId, { fromItemId: puzzle.id });
      state.pollAnswers.push({ pollId: "poll-1", san: "d4", student: { firstName: "Raj", id: "student-2", lastName: null }, studentId: "student-2", uci: "d2d4" });
      return { puzzle, question, queueId };
    }

    it("gives the coach one cell per student per reached activity", async () => {
      const { puzzle, question, queueId } = await runThroughQuestion();
      const progress = await service.progress(TOKEN, CLASS_ID, queueId);

      expect(progress.students.map((s) => s.studentName)).toEqual(["Ava", "Raj"]);
      expect(progress.cells[puzzle.id]).toEqual({
        "student-1": { detail: "2 tries · 1 hint", state: "CORRECT" },
        "student-2": { detail: null, state: "MISSED" }
      });
      expect(progress.cells[question.id]).toEqual({
        "student-1": { detail: null, state: "PENDING" },
        "student-2": { detail: "d4", state: "INCORRECT" }
      });
      expect(progress.respondedCounts).toEqual({ [puzzle.id]: 1, [question.id]: 1 });
      // The chapter hasn't been reached — and a CHAPTER never has cells.
      expect(Object.keys(progress.cells)).toHaveLength(2);
    });

    it("is coach-only", async () => {
      const { queueId } = await runThroughQuestion();
      as("student-1");
      await expect(service.progress(TOKEN, CLASS_ID, queueId)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("tells a student only how far the class is and whether they responded", async () => {
      await runThroughQuestion();
      const { queue } = await service.current(TOKEN, CLASS_ID);
      expect(queue).toEqual({
        current: { kind: "QUESTION", title: "Best first move?" },
        currentNumber: 2,
        mine: [
          { kind: "PUZZLE", number: 1, responded: true },
          { kind: "QUESTION", number: 2, responded: false }
        ],
        queueId: expect.any(String),
        title: "Tactics warm-up",
        total: 3
      });
      // No upcoming item, no answer key, no other student.
      expect(JSON.stringify(queue)).not.toMatch(/e2e4|Opening ideas|student-2/);
    });

    it("returns no queue to a student when none is running", async () => {
      await draftQueue();
      await expect(service.current(TOKEN, CLASS_ID)).resolves.toEqual({ queue: null });
    });
  });
});
