import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { WEAK_SPOT_TIPS } from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { runInTenant } from "../tenancy/tenant-context";
import { WeakSpotsService } from "./weak-spots.service";

jest.mock("../auth/authenticate", () => ({ authenticateUser: jest.fn() }));
const authenticate = authenticateUser as jest.MockedFunction<typeof authenticateUser>;

const NOW = new Date("2026-11-26T12:00:00Z");
// 1.e4 e5 2.Nf3 Nc6 3.Bc4 Nd4: White to move; Nxe5 was there, the student played a3.
const FEN = "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
const forkMiss = { bestMoveSan: "Nxe5", fenBefore: FEN, kind: "MISSED_TACTIC", motif: "FORK", playedSan: "a3", ply: 7, segment: 0, winPercentLoss: 20 };

function setup(coachShares = true) {
  const reviews = [1, 2, 3].map((d) => ({
    findingsJson: [forkMiss],
    playedAt: new Date(NOW.getTime() - d * 86_400_000),
    source: "CLASS_BOARD",
    sourceId: `b${d}`,
    tacticsJson: { FORK: { allowed: 0, alternative: 0, found: 0, missed: 2 } }
  }));
  const prisma = {
    aiPlayReview: { findMany: jest.fn(async () => reviews) },
    batchStudent: { findFirst: jest.fn(async () => (coachShares ? { id: "bs1" } : null)) },
    puzzleAttempt: { findMany: jest.fn(async () => []) },
    studentProgress: { findUnique: jest.fn(async () => ({ puzzleRating: 1320 })) },
    user: { findFirst: jest.fn(async () => ({ id: "s1" })), findMany: jest.fn(async () => [{ firstName: "Asha", id: "c1", lastName: "Rao" }]) },
    weakSpotTipReview: {
      deleteMany: jest.fn(async () => ({ count: 1 })),
      findMany: jest.fn(async (): Promise<Record<string, unknown>[]> => []),
      upsert: jest.fn(async () => ({}))
    }
  };
  const assignments = { create: jest.fn(async () => ({ assignment: { id: "as1" } })) };
  const training = { pickPracticePuzzles: jest.fn(async (): Promise<string[]> => ["p1", "p2", "p3"]) };
  const service = new WeakSpotsService({} as never, prisma as never, assignments as never, training as never);
  const inAcademy = <T>(fn: () => Promise<T>) => runInTenant("tenant_nexa", "spec", fn);
  return { assignments, inAcademy, prisma, service, training };
}

describe("WeakSpotsService", () => {
  afterEach(() => authenticate.mockReset());

  it("gives the student's coach their weak spots, with the example moves as board arrows", async () => {
    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    const { inAcademy, prisma, service } = setup();
    const profile = await inAcademy(() => service.getFor("t", "s1", NOW));
    expect(profile.weakSpots[0]).toMatchObject({ missed: 6, motif: "FORK", verdict: "WEAKNESS" });
    expect(profile.weakSpots[0].examples[0]).toMatchObject({ bestMoveUci: "f3e5", playedUci: "a2a3" });
    // Only DONE reviews of this student, inside the window.
    expect(prisma.aiPlayReview.findMany.mock.calls[0]).toMatchObject([
      { where: { playedAt: { gte: new Date(NOW.getTime() - 60 * 86_400_000), lte: NOW }, status: "DONE", studentId: "s1" } }
    ]);
  });

  it("refuses a coach who doesn't teach the student", async () => {
    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    const { inAcademy, prisma, service } = setup(false);
    await expect(inAcademy(() => service.getFor("t", "s1", NOW))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.aiPlayReview.findMany).not.toHaveBeenCalled();
  });

  it("keeps the staff route for staff; a student reads their own card instead", async () => {
    authenticate.mockResolvedValue({ id: "s1", role: "STUDENT" } as never);
    const { inAcademy, service } = setup();
    await expect(inAcademy(() => service.getFor("t", "s1", NOW))).rejects.toBeInstanceOf(ForbiddenException);
    const mine = await inAcademy(() => service.getMine("t", NOW));
    expect(mine.weakSpots[0]).toMatchObject({ motif: "FORK", tip: null, tipStatus: "NOT_READ" });
    expect(mine.others).toEqual([]);
  });

  it("shows a student a tip only once their academy read it, in the reader's words", async () => {
    authenticate.mockResolvedValue({ id: "s1", role: "STUDENT" } as never);
    const { inAcademy, prisma, service } = setup();
    prisma.weakSpotTipReview.findMany.mockResolvedValue([{ baseText: WEAK_SPOT_TIPS.FORK, motif: "FORK", text: "Knights love forks." }]);
    expect((await inAcademy(() => service.getMine("t", NOW))).weakSpots[0]).toMatchObject({ tip: "Knights love forks.", tipStatus: "READ" });
    // The built-in text changed since: read it again first.
    prisma.weakSpotTipReview.findMany.mockResolvedValue([{ baseText: "an older text", motif: "FORK", text: "Knights love forks." }]);
    expect((await inAcademy(() => service.getMine("t", NOW))).weakSpots[0]).toMatchObject({ tip: null, tipStatus: "CHANGED" });
  });

  it("records a coach's reading against the built-in text it was read with", async () => {
    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    const { inAcademy, prisma, service } = setup();
    await inAcademy(() => service.readTip("t", "PIN", { text: "  A pinned piece can't move freely; look along the lines.  " }));
    expect(prisma.weakSpotTipReview.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ baseText: WEAK_SPOT_TIPS.PIN, motif: "PIN", reviewedById: "c1", tenantId: "tenant_nexa", text: "A pinned piece can't move freely; look along the lines." }),
        where: { tenantId_motif: { motif: "PIN", tenantId: "tenant_nexa" } }
      })
    );
    await expect(inAcademy(() => service.readTip("t", "NOT_A_MOTIF", { text: "x".repeat(30) }))).rejects.toBeInstanceOf(BadRequestException);
    await expect(inAcademy(() => service.readTip("t", "PIN", { text: "short" }))).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lets only staff read tips", async () => {
    authenticate.mockResolvedValue({ id: "s1", role: "STUDENT" } as never);
    const { inAcademy, service } = setup();
    await expect(inAcademy(() => service.listTips("t"))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(inAcademy(() => service.unreadTip("t", "PIN"))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("makes homework: new puzzles near the rating, saved unassigned, never naming the student", async () => {
    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    const { assignments, inAcademy, service, training } = setup();
    const result = await inAcademy(() => service.makeHomework("t", "s1", { motif: "REMOVAL_OF_DEFENDER" }));
    expect(training.pickPracticePuzzles).toHaveBeenCalledWith({
      actorId: "c1",
      count: 10,
      studentId: "s1",
      targetRating: 1320,
      themes: ["capturingDefender", "deflection"]
    });
    const [, dto] = (assignments.create.mock.calls[0] as unknown[]) as [string, Record<string, unknown>];
    expect(dto).toMatchObject({ activityType: "PUZZLE_SET", difficulty: "INTERMEDIATE", puzzleIds: ["p1", "p2", "p3"], title: "Removal of the defender practice" });
    expect(dto.batchIds).toBeUndefined();
    expect(JSON.stringify(dto)).not.toMatch(/s1|Asha/);
    expect(result).toEqual({ assignmentId: "as1", puzzleCount: 3, targetRating: 1320, title: "Removal of the defender practice" });
  });

  it("refuses homework for a pattern without puzzles, with none found, or for a student", async () => {
    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    const { assignments, inAcademy, service, training } = setup();
    await expect(inAcademy(() => service.makeHomework("t", "s1", { motif: "MATERIAL_GAIN" }))).rejects.toBeInstanceOf(BadRequestException);
    training.pickPracticePuzzles.mockResolvedValueOnce([]);
    await expect(inAcademy(() => service.makeHomework("t", "s1", { motif: "FORK" }))).rejects.toBeInstanceOf(ConflictException);
    expect(assignments.create).not.toHaveBeenCalled();
    authenticate.mockResolvedValue({ id: "s1", role: "STUDENT" } as never);
    await expect(inAcademy(() => service.makeHomework("t", "s1", { motif: "FORK" }))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses homework for another coach's student before picking anything", async () => {
    authenticate.mockResolvedValue({ id: "c1", role: "COACH" } as never);
    const { inAcademy, service, training } = setup(false);
    await expect(inAcademy(() => service.makeHomework("t", "s1", { motif: "FORK" }))).rejects.toBeInstanceOf(ForbiddenException);
    expect(training.pickPracticePuzzles).not.toHaveBeenCalled();
  });

  it("treats a malformed stored count as missing parts, never as a crash", async () => {
    authenticate.mockResolvedValue({ id: "a1", role: "ADMIN" } as never);
    const { inAcademy, prisma, service } = setup();
    prisma.aiPlayReview.findMany.mockResolvedValueOnce([
      { findingsJson: "oops", playedAt: NOW, source: "CLASS_BOARD", sourceId: "x", tacticsJson: { FORK: { found: "2", missed: -1 } } }
    ] as never);
    const profile = await inAcademy(() => service.getFor("t", "s1", NOW));
    expect(profile).toMatchObject({ itemsWithStats: 1, reviewedItems: 1, weakSpots: [] });
  });
});
