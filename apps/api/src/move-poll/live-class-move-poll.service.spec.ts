/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import { decodeLiveMovePoll } from "@nexa-chess/types";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassMovePollService } from "./live-class-move-poll.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const COACH_ID = "coach-1";
const STUDENT_ID = "student-1";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const AT = new Date("2026-09-28T10:00:00Z");

const asUser = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });
const liveSession = { id: "ls-1", classId: CLASS_ID, coachId: COACH_ID, roomName: "room-1", status: "LIVE" };

const answerRow = (studentId: string, uci: string, san: string, firstName: string) => ({
  id: `a-${studentId}`,
  pollId: "p-1",
  studentId,
  uci,
  san,
  answeredAt: AT,
  student: { firstName, lastName: null }
});

const pollRow = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  liveClassId: CLASS_ID,
  startedById: COACH_ID,
  status: "OPEN",
  fen: START,
  prompt: null,
  revealed: false,
  correctUci: null,
  startedAt: AT,
  closedAt: null,
  endedAt: null,
  answers: [
    answerRow(STUDENT_ID, "e2e4", "e4", "Sam"),
    answerRow("student-2", "e2e4", "e4", "Ava"),
    answerRow("student-3", "d2d4", "d4", "Raj")
  ],
  ...over
});

describe("LiveClassMovePollService", () => {
  let service: LiveClassMovePollService;
  let prisma: any;
  let liveClass: any;
  let livekit: any;

  beforeEach(async () => {
    prisma = {
      liveClassMovePoll: {
        findFirst: jest.fn().mockResolvedValue(pollRow()),
        findUniqueOrThrow: jest.fn().mockResolvedValue(pollRow()),
        create: jest.fn().mockImplementation(async ({ data }: any) => pollRow({ ...data, answers: [] })),
        update: jest.fn().mockImplementation(async ({ data }: any) => pollRow(data))
      },
      liveClassMovePollAnswer: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma))
    };
    liveClass = {
      resolveClassManager: jest.fn().mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession }),
      resolveParticipant: jest
        .fn()
        .mockResolvedValue({ user: asUser(STUDENT_ID, UserRole.STUDENT), liveSession })
    };
    livekit = { broadcastData: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveClassMovePollService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveClassService, useValue: liveClass },
        { provide: LiveKitService, useValue: livekit }
      ]
    }).compile();
    service = moduleRef.get(LiveClassMovePollService);
  });

  it("start ends the current poll and broadcasts the new one", async () => {
    const result = await service.start(TOKEN, CLASS_ID, { fen: START, prompt: "Best move?" });

    expect(prisma.liveClassMovePoll.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ENDED" }) })
    );
    expect(prisma.liveClassMovePoll.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ fen: START, prompt: "Best move?" }) })
    );
    expect(result.poll?.status).toBe("OPEN");
    const msg = decodeLiveMovePoll(livekit.broadcastData.mock.calls[0][1]);
    expect(msg?.type).toBe("POLL_CHANGED");
  });

  it("start rejects an invalid FEN", async () => {
    await expect(service.start(TOKEN, CLASS_ID, { fen: "not a fen" })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("answer stores the student's legal move with its SAN", async () => {
    await service.answer(TOKEN, CLASS_ID, { uci: "g1f3" });

    expect(prisma.liveClassMovePollAnswer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ san: "Nf3", studentId: STUDENT_ID, uci: "g1f3" }),
        update: expect.objectContaining({ san: "Nf3", uci: "g1f3" })
      })
    );
    const msg = decodeLiveMovePoll(livekit.broadcastData.mock.calls[0][1]);
    expect(msg).toEqual({ type: "POLL_ANSWERED", pollId: "p-1", answerCount: 3 });
  });

  it("answer rejects an illegal move", async () => {
    await expect(service.answer(TOKEN, CLASS_ID, { uci: "e2e5" })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("answer rejects once the poll is closed", async () => {
    prisma.liveClassMovePoll.findFirst.mockResolvedValue(pollRow({ status: "CLOSED" }));
    await expect(service.answer(TOKEN, CLASS_ID, { uci: "e2e4" })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("answer is student-only", async () => {
    liveClass.resolveParticipant.mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession });
    await expect(service.answer(TOKEN, CLASS_ID, { uci: "e2e4" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("coach sees every answer tallied, most popular first", async () => {
    liveClass.resolveParticipant.mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession });
    const { poll } = await service.getCurrent(TOKEN, CLASS_ID);

    expect(poll?.answers).toHaveLength(3);
    expect(poll?.options).toEqual([
      { uci: "e2e4", san: "e4", count: 2, studentNames: ["Ava", "Sam"] },
      { uci: "d2d4", san: "d4", count: 1, studentNames: ["Raj"] }
    ]);
  });

  it("a student sees only their own answer while the poll is open", async () => {
    prisma.liveClassMovePoll.findFirst.mockResolvedValue(pollRow({ correctUci: "e2e4" }));
    const { poll } = await service.getCurrent(TOKEN, CLASS_ID);

    expect(poll?.answers).toEqual([]);
    expect(poll?.options).toEqual([]);
    expect(poll?.correctUci).toBeNull();
    expect(poll?.myAnswer).toEqual({ uci: "e2e4", san: "e4" });
  });

  it("a student sees anonymous counts and the answer once closed and revealed", async () => {
    prisma.liveClassMovePoll.findFirst.mockResolvedValue(
      pollRow({ status: "CLOSED", revealed: true, correctUci: "d2d4" })
    );
    const { poll } = await service.getCurrent(TOKEN, CLASS_ID);

    expect(poll?.correctSan).toBe("d4");
    expect(poll?.options.map((o) => [o.san, o.count, o.studentNames])).toEqual([
      ["e4", 2, []],
      ["d4", 1, []]
    ]);
  });

  it("update closes the poll and validates the correct move", async () => {
    await service.update(TOKEN, CLASS_ID, { status: "CLOSED", correctUci: "d2d4" });
    expect(prisma.liveClassMovePoll.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "CLOSED", correctUci: "d2d4", closedAt: expect.any(Date) })
      })
    );

    await expect(service.update(TOKEN, CLASS_ID, { correctUci: "e2e5" })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});
