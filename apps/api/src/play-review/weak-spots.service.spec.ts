import { ForbiddenException } from "@nestjs/common";
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
    user: { findFirst: jest.fn(async () => ({ id: "s1" })) }
  };
  const service = new WeakSpotsService({} as never, prisma as never);
  const inAcademy = <T>(fn: () => Promise<T>) => runInTenant("tenant_nexa", "spec", fn);
  return { inAcademy, prisma, service };
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

  it("is staff only in phase A, even for the student's own", async () => {
    authenticate.mockResolvedValue({ id: "s1", role: "STUDENT" } as never);
    const { inAcademy, service } = setup();
    await expect(inAcademy(() => service.getFor("t", "s1", NOW))).rejects.toBeInstanceOf(ForbiddenException);
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
