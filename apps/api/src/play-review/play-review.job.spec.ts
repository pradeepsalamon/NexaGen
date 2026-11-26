import { AI_REVIEW_CONSENT_VERSION, PLAY_REVIEW_NIGHTLY_ITEM_CAP, type GameEngineAnalysis, type PlayItem } from "@nexa-chess/types";
import { replayGame } from "../stockfish/game-analysis-engine.service";
import { runInTenant } from "../tenancy/tenant-context";
import { replaySegment, type PlayRef } from "./play-item.loader";
import { PlayReviewJob } from "./play-review.job";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const TENANT = "tenant_nexa";

function playItem(over: Partial<PlayItem> = {}): PlayItem {
  return {
    batchId: null,
    classId: null,
    key: "PUZZLE:a1",
    playedAt: new Date(0).toISOString(),
    result: "SOLVED",
    review: null,
    segments: [replaySegment({ moves: [{ uci: "e2e4" }, { uci: "e7e5" }], startFen: START, studentSide: "white" })],
    source: "PUZZLE",
    sourceId: "a1",
    studentMoveCount: 1,
    title: "Puzzle",
    ...over
  };
}

/** An engine run that analysed nothing: the review is DONE with nothing to report. */
function emptyEngine(startFen: string, movesUci: string[]): GameEngineAnalysis {
  const replay = replayGame(startFen, movesUci);
  return {
    budgetExhausted: false,
    complete: false,
    config: { budgetMs: 1000, concurrency: 1, depth: "QUICK", maxDepth: 14, movetimeMs: 250, multiPv: 1, rootMoveSearch: false },
    conventionVersion: "white-relative-v1",
    engine: "test",
    moves: replay.moves,
    positions: replay.positions.map((p) => (p.status === "TERMINAL" ? p : { ...p, status: "FAILED" as const })),
    startFen: replay.positions[0].fen,
    truncated: replay.truncated
  };
}

function setup(options: {
  hasFeature?: boolean;
  engineReviewEnabled?: boolean;
  outsideAiEnabled?: boolean;
  liveClasses?: number;
  rows?: { source: string; source_id: string; student_id: string; played_at: Date; refresh?: boolean }[];
  items?: PlayItem[];
  provider?: { route: () => unknown[]; comment: jest.Mock };
  /** Student → the providers their consent covers. */
  consentedStudents?: string[] | Record<string, string[]>;
  latestConsent?: { allowed: boolean; version: number; providers: string[] } | null;
} = {}) {
  const upserts: unknown[] = [];
  const comments: unknown[] = [];
  const tx = {
    aiPlayComment: { create: jest.fn(async (args: unknown) => comments.push(args)) },
    aiReviewConsent: {
      findFirst: jest.fn(async () => options.latestConsent ?? { allowed: true, providers: ["GROQ", "GEMINI"], version: AI_REVIEW_CONSENT_VERSION })
    }
  };
  const prisma = {
    $queryRaw: jest.fn(async () => options.rows ?? []),
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    aiPlayReview: {
      findMany: jest.fn(async () => [
        { accuracy: 70, findingsJson: [], id: "rev1", playedAt: new Date(0), source: "PUZZLE", sourceId: "a1", studentId: "s1" }
      ]),
      updateMany: jest.fn(async () => ({ count: 1 })),
      upsert: jest.fn(async (args: unknown) => upserts.push(args))
    },
    liveSession: { count: jest.fn(async () => options.liveClasses ?? 0) }
  };
  const loader = { load: jest.fn(async (refs: PlayRef[]) => (options.items ?? refs.map((r) => playItem({ source: r.source, sourceId: r.sourceId })))) };
  const engine = { analyzeGame: jest.fn(async (input: { startFen: string; movesUci: string[] }) => emptyEngine(input.startFen, input.movesUci)) };
  const provider = options.provider ?? { comment: jest.fn(), route: () => [] };
  const consented = options.consentedStudents ?? [];
  const covered = new Map<string, string[]>(
    Array.isArray(consented) ? consented.map((id): [string, string[]] => [id, ["GROQ", "GEMINI"]]) : Object.entries(consented)
  );
  const job = new PlayReviewJob(
    prisma as never,
    {} as never,
    { hasFeature: jest.fn(async () => options.hasFeature ?? true) } as never,
    {
      academySwitches: jest.fn(async () => ({
        engineReviewEnabled: options.engineReviewEnabled ?? true,
        outsideAiEnabled: options.outsideAiEnabled ?? false
      })),
      coveredProvidersByStudent: jest.fn(async () => covered)
    } as never,
    loader as never,
    engine as never,
    { engineName: () => "stockfish-test", isAvailable: () => true } as never,
    provider as never
  );
  const run = () => runInTenant(TENANT, "spec", () => job.runForAcademy(new AbortController().signal, { deadline: Date.now() + 60_000 }));
  return { comments, engine, job, loader, prisma, provider, run, upserts };
}

const row = (id: string) => ({ played_at: new Date("2026-11-20T10:00:00Z"), source: "PUZZLE", source_id: id, student_id: "s1" });

describe("PlayReviewJob.runForAcademy", () => {
  it("does nothing for an academy whose plan lacks AI play review", async () => {
    const { prisma, run } = setup({ hasFeature: false, rows: [row("a1")] });
    await expect(run()).resolves.toMatchObject({ reviewed: 0 });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("does nothing when the academy switched the engine review off", async () => {
    const { prisma, run } = setup({ engineReviewEnabled: false, rows: [row("a1")] });
    await run();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("reviews each unreviewed item once and stores a DONE row under the academy key", async () => {
    const { engine, run, upserts } = setup({ rows: [row("a1"), row("a2")] });
    await expect(run()).resolves.toMatchObject({ failed: 0, reviewed: 2, stoppedBy: null });
    expect(engine.analyzeGame).toHaveBeenCalledTimes(2);
    expect((engine.analyzeGame.mock.calls[0] as unknown[])[1]).toMatchObject({ config: "QUICK" });
    expect(upserts[0]).toMatchObject({
      create: { source: "PUZZLE", sourceId: "a1", status: "DONE", studentId: "s1", tenantId: TENANT },
      update: { attempts: { increment: 1 } },
      where: { tenantId_studentId_source_sourceId: { source: "PUZZLE", sourceId: "a1", studentId: "s1", tenantId: TENANT } }
    });
  });

  it("asks the feed for finished play only, capped per night", async () => {
    const { prisma, run } = setup({ rows: [] });
    await run();
    const sql = (prisma.$queryRaw.mock.calls[0] as unknown[])[0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain(`pa.status IN ('SOLVED', 'FAILED')`);
    expect(sql.sql).toContain(`"finishedAt" IS NOT NULL`);
    expect(sql.values).toContain(PLAY_REVIEW_NIGHTLY_ITEM_CAP);
  });

  it("pauses while any class is live", async () => {
    const { engine, run } = setup({ liveClasses: 1, rows: [row("a1")] });
    await expect(run()).resolves.toMatchObject({ reviewed: 0, stoppedBy: "LIVE_CLASS" });
    expect(engine.analyzeGame).not.toHaveBeenCalled();
  });

  it("marks an item without any move of the student's SKIPPED, without the engine", async () => {
    const onlyOpponent = playItem({
      segments: [replaySegment({ moves: [{ byStudent: false, uci: "e2e4" }], startFen: START, studentSide: null })]
    });
    const { engine, run, upserts } = setup({ items: [onlyOpponent], rows: [row("a1")] });
    await expect(run()).resolves.toMatchObject({ skipped: 1 });
    expect(engine.analyzeGame).not.toHaveBeenCalled();
    expect(upserts[0]).toMatchObject({ create: { status: "SKIPPED" } });
  });

  it("stores FAILED (retried later) when the engine fails, without the item's content", async () => {
    const { engine, run, upserts } = setup({ rows: [row("a1")] });
    engine.analyzeGame.mockRejectedValueOnce(new Error("engine crashed"));
    await expect(run()).resolves.toMatchObject({ failed: 1 });
    expect(upserts[0]).toMatchObject({ create: { error: "The engine couldn't review this.", status: "FAILED" } });
  });

  it("stores the student's chance counts with every DONE review (weak spots)", async () => {
    const { run, upserts } = setup({ rows: [row("a1")] });
    await run();
    expect(upserts[0]).toMatchObject({ create: { status: "DONE", tacticsJson: {} } });
  });

  it("asks for never-reviewed play before reviews to refresh, and refreshes only DONE rows without counts", async () => {
    const { prisma, run } = setup({ rows: [] });
    await run();
    const sql = (prisma.$queryRaw.mock.calls[0] as unknown[])[0] as { sql: string };
    expect(sql.sql).toContain(`(r.status = 'DONE' AND r."tacticsJson" IS NOT NULL)`);
    expect(sql.sql).toContain("ORDER BY refresh ASC");
  });

  it("a refresh the engine can't do keeps the old review and is never tried again", async () => {
    const { engine, prisma, run, upserts } = setup({ rows: [{ ...row("a1"), refresh: true }] });
    engine.analyzeGame.mockRejectedValueOnce(new Error("engine crashed"));
    await expect(run()).resolves.toMatchObject({ failed: 1 });
    expect(upserts).toEqual([]);
    expect(prisma.aiPlayReview.updateMany).toHaveBeenCalledWith({
      data: { tacticsJson: {} },
      where: expect.objectContaining({ source: "PUZZLE", sourceId: "a1", status: "DONE", studentId: "s1", tenantId: TENANT })
    });
  });
});

describe("outside-AI comment pass", () => {
  const GROQ = { apiKey: "k", model: "m1", name: "Groq", provider: "OUTSIDE", providerId: "GROQ", timeoutMs: 1000, url: "https://llm.example" };
  const GEMINI = { ...GROQ, model: "lite", name: "Google Gemini", providerId: "GEMINI", url: "https://other.example" };
  const configured = () => ({
    comment: jest.fn(async (route: (typeof GROQ)[]) => ({ servedBy: route[0], text: "Well played." })),
    route: () => [GROQ, GEMINI]
  });

  it("sends nothing while the academy switch is off", async () => {
    const provider = configured();
    const { run } = setup({ consentedStudents: ["s1"], outsideAiEnabled: false, provider, rows: [] });
    await run();
    expect(provider.comment).not.toHaveBeenCalled();
  });

  it("sends nothing without a configured provider (no key)", async () => {
    const provider = { comment: jest.fn(), route: () => [] };
    const { run } = setup({ consentedStudents: ["s1"], outsideAiEnabled: true, provider, rows: [] });
    await run();
    expect(provider.comment).not.toHaveBeenCalled();
  });

  it("sends nothing for a student whose switch is off", async () => {
    const provider = configured();
    const { prisma, run } = setup({ consentedStudents: [], outsideAiEnabled: true, provider, rows: [] });
    await expect(run()).resolves.toMatchObject({ commented: 0 });
    expect(provider.comment).not.toHaveBeenCalled();
    expect(prisma.aiPlayReview.findMany).not.toHaveBeenCalled();
  });

  it("comments on a consenting student's reviews with pseudonymised play", async () => {
    const provider = configured();
    const { comments, prisma, run } = setup({ consentedStudents: ["s1"], outsideAiEnabled: true, provider, rows: [] });
    await expect(run()).resolves.toMatchObject({ commented: 1 });
    expect(prisma.aiPlayReview.findMany.mock.calls[0]).toMatchObject([{ where: { comment: null, status: "DONE", studentId: { in: ["s1"] } } }]);
    const sent = JSON.stringify((provider.comment.mock.calls[0] as unknown[])[1]);
    expect(sent).not.toContain("s1");
    expect(sent).not.toContain("a1");
    expect(comments[0]).toMatchObject({ data: { model: "m1", provider: "Groq", reviewId: "rev1", studentId: "s1", text: "Well played." } });
  });

  it("sends only to the providers the student's consent named", async () => {
    const provider = configured();
    const { run } = setup({ consentedStudents: { s1: ["GEMINI"] }, outsideAiEnabled: true, provider, rows: [] });
    await run();
    expect((provider.comment.mock.calls[0] as unknown[])[0]).toEqual([GEMINI]);
  });

  it("drops a comment from a provider the latest consent doesn't name", async () => {
    const provider = configured();
    const { comments, run } = setup({
      consentedStudents: ["s1"],
      latestConsent: { allowed: true, providers: ["GEMINI"], version: AI_REVIEW_CONSENT_VERSION },
      outsideAiEnabled: true,
      provider,
      rows: []
    });
    await expect(run()).resolves.toMatchObject({ commented: 0 });
    expect(comments).toEqual([]);
  });

  it("drops the comment when the switch was turned off while the request ran", async () => {
    const provider = configured();
    const { comments, run } = setup({
      consentedStudents: ["s1"],
      latestConsent: { allowed: false, providers: [], version: AI_REVIEW_CONSENT_VERSION },
      outsideAiEnabled: true,
      provider,
      rows: []
    });
    await expect(run()).resolves.toMatchObject({ commented: 0 });
    expect(comments).toEqual([]);
  });
});
