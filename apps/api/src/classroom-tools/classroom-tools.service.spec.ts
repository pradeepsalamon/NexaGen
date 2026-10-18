/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { UserRole, UserStatus } from "@prisma/client";
import {
  decodeLiveClassToolsMessage,
  eloExpectedScore,
  eloRatingChange,
  materialValue,
  splitIntoTeams,
  timerRemainingMs,
  type TimerState
} from "@nexa-chess/types";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ClassroomToolsService } from "./classroom-tools.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const BATCH_ID = "batch-1";
const AT = new Date("2026-10-11T10:00:00Z");

const asUser = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });
const session = (batchId: string | null = BATCH_ID) => ({
  batchId,
  classId: CLASS_ID,
  coachId: "coach-1",
  id: "ls-1",
  roomName: "room-1",
  status: "LIVE"
});

const mysteryBox = { goal: "Solve 20 puzzles", log: [], progress: 3, rewardId: null, target: 20 };
const legends = { storyId: "morphy-opera" };

describe("ClassroomToolsService", () => {
  let service: ClassroomToolsService;
  let prisma: any;
  let liveClass: any;
  let livekit: any;

  beforeEach(async () => {
    prisma = {
      liveClassToolState: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ ...create, updatedAt: AT }))
      }
    };
    liveClass = {
      resolveClassManager: jest
        .fn()
        .mockResolvedValue({ liveSession: session(), user: asUser("coach-1", UserRole.COACH) }),
      resolveParticipant: jest
        .fn()
        .mockResolvedValue({ liveSession: session(), user: asUser("student-1", UserRole.STUDENT) })
    };
    livekit = { broadcastData: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        ClassroomToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveClassService, useValue: liveClass },
        { provide: LiveKitService, useValue: livekit }
      ]
    }).compile();
    service = module.get(ClassroomToolsService);
  });

  describe("update", () => {
    it("saves a batch-scoped tool under the batch key and nudges the room", async () => {
      const res = await service.update(TOKEN, CLASS_ID, "MYSTERY_BOX", mysteryBox);

      const args = prisma.liveClassToolState.upsert.mock.calls[0][0];
      expect(args.where).toEqual({ scopeKey_tool: { scopeKey: `batch:${BATCH_ID}`, tool: "MYSTERY_BOX" } });
      expect(args.create).toMatchObject({ batchId: BATCH_ID, liveClassId: null, updatedById: "coach-1" });
      expect(res.entry?.state).toEqual(mysteryBox);

      const [room, payload, topic] = livekit.broadcastData.mock.calls[0];
      expect(room).toBe("room-1");
      expect(topic).toBe("classroom_tools");
      expect(decodeLiveClassToolsMessage(payload)).toEqual({ tool: "MYSTERY_BOX", type: "TOOL_CHANGED" });
    });

    it("keeps class-scoped tools per class", async () => {
      await service.update(TOKEN, CLASS_ID, "LEGENDS", legends);
      const args = prisma.liveClassToolState.upsert.mock.calls[0][0];
      expect(args.where.scopeKey_tool.scopeKey).toBe(`class:${CLASS_ID}`);
      expect(args.create).toMatchObject({ batchId: null, liveClassId: CLASS_ID });
    });

    it("falls back to the class key when the class has no batch", async () => {
      liveClass.resolveClassManager.mockResolvedValue({
        liveSession: session(null),
        user: asUser("coach-1", UserRole.COACH)
      });
      await service.update(TOKEN, CLASS_ID, "MYSTERY_BOX", mysteryBox);
      expect(prisma.liveClassToolState.upsert.mock.calls[0][0].where.scopeKey_tool.scopeKey).toBe(
        `class:${CLASS_ID}`
      );
    });

    it("rejects an unknown tool and a state that breaks the schema", async () => {
      await expect(service.update(TOKEN, CLASS_ID, "SLOT_MACHINE", {})).rejects.toBeInstanceOf(
        BadRequestException
      );
      await expect(
        service.update(TOKEN, CLASS_ID, "MYSTERY_BOX", { ...mysteryBox, target: 0 })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.liveClassToolState.upsert).not.toHaveBeenCalled();
    });

    it("authenticates before reading the body (a student can't write)", async () => {
      liveClass.resolveClassManager.mockRejectedValue(new ForbiddenException());
      await expect(service.update(TOKEN, CLASS_ID, "nonsense", null)).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it("still saves when the room nudge fails", async () => {
      livekit.broadcastData.mockRejectedValue(new Error("livekit down"));
      await expect(service.update(TOKEN, CLASS_ID, "LEGENDS", legends)).resolves.toMatchObject({
        tool: "LEGENDS"
      });
    });
  });

  describe("list", () => {
    it("returns each tool from its own scope only, skipping rows that no longer parse", async () => {
      prisma.liveClassToolState.findMany.mockResolvedValue([
        { scopeKey: `batch:${BATCH_ID}`, state: mysteryBox, tool: "MYSTERY_BOX", updatedAt: AT },
        // A CLASS tool stored under the batch key is not this class's.
        { scopeKey: `batch:${BATCH_ID}`, state: legends, tool: "LEGENDS", updatedAt: AT },
        { scopeKey: `class:${CLASS_ID}`, state: { storyId: 42 }, tool: "LEGENDS", updatedAt: AT }
      ]);

      const res = await service.list(TOKEN, CLASS_ID);

      expect(prisma.liveClassToolState.findMany.mock.calls[0][0].where.scopeKey.in.sort()).toEqual(
        [`batch:${BATCH_ID}`, `class:${CLASS_ID}`].sort()
      );
      expect(res.tools.MYSTERY_BOX).toEqual({ state: mysteryBox, updatedAt: AT.toISOString() });
      expect(res.tools.LEGENDS).toBeUndefined();
      expect(typeof res.serverTime).toBe("string");
    });
  });
});

describe("classroom tool helpers", () => {
  it("splits into balanced teams by count or by size", () => {
    const ten = Array.from({ length: 10 }, (_, i) => i);
    expect(splitIntoTeams(ten, "COUNT", 3).map((t) => t.length)).toEqual([4, 3, 3]);
    // SIZE rounds the team count, so teams stay near the size asked for.
    expect(splitIntoTeams(ten, "SIZE", 4).map((t) => t.length)).toEqual([4, 3, 3]);
    expect(splitIntoTeams(ten.slice(0, 7), "SIZE", 4).map((t) => t.length)).toEqual([4, 3]);
    expect(splitIntoTeams(ten, "SIZE", 2)).toHaveLength(5);
    expect(splitIntoTeams([1, 2], "COUNT", 5)).toHaveLength(2);
    expect(splitIntoTeams([], "COUNT", 2)).toEqual([]);
  });

  it("values material with standard piece values", () => {
    expect(materialValue({ b: 1, n: 1, p: 8, q: 1, r: 2 })).toBe(8 + 3 + 3 + 10 + 9);
    expect(materialValue({})).toBe(0);
  });

  it("computes Elo expectations and changes, capping the gap at 400", () => {
    expect(eloExpectedScore(1500, 1500)).toBeCloseTo(0.5);
    expect(eloRatingChange(1500, 1500, 1, 20)).toBeCloseTo(10);
    expect(eloExpectedScore(1000, 2000)).toBeCloseTo(eloExpectedScore(1000, 1400));
  });

  it("counts a running timer down from its last stamp", () => {
    const state: TimerState = {
      index: 0,
      phases: [{ id: "a", label: "Warm-up", seconds: 60 }],
      remainingMs: 60_000,
      since: AT.toISOString(),
      status: "RUNNING"
    };
    expect(timerRemainingMs(state, AT.getTime() + 15_000)).toBe(45_000);
    expect(timerRemainingMs(state, AT.getTime() + 90_000)).toBe(0);
    expect(timerRemainingMs({ ...state, status: "PAUSED" }, AT.getTime() + 15_000)).toBe(60_000);
  });
});
