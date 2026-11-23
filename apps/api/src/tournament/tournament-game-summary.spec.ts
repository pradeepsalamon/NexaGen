import { TournamentGameStatus } from "@prisma/client";
import { toGameSummaryFor } from "./tournament-game.service";

/** Review S7: game summaries keep the spectator delay that the board view keeps. */
describe("toGameSummaryFor", () => {
  const NOW = Date.parse("2026-11-23T12:00:00.000Z");
  const player = (id: string) => ({
    id: `p-${id}`,
    seedRating: 1500,
    user: { avatarUrl: null, firstName: id, id, lastName: null }
  });
  const game = (over: Record<string, unknown> = {}) =>
    ({
      blackHalfPoints: 0,
      blackPlayer: player("bob"),
      boardNumber: 1,
      byeKind: null,
      endReason: "CHECKMATE",
      finishedAt: new Date(NOW - 5_000),
      gameNumber: 1,
      id: "g-1",
      knockoutMatchId: null,
      movesJson: [
        { at: NOW - 60_000, san: "e4", uci: "e2e4" },
        { at: NOW - 40_000, san: "e5", uci: "e7e5" },
        { at: NOW - 5_000, san: "Qxf7#", uci: "h5f7" }
      ],
      ply: 3,
      result: "WHITE_WIN",
      roundNumber: 1,
      startedAt: new Date(NOW - 120_000),
      status: TournamentGameStatus.FINISHED,
      whiteHalfPoints: 2,
      whitePlayer: player("amy"),
      ...over
    }) as unknown as Parameters<typeof toGameSummaryFor>[0];

  const spectator = { delaySec: 15, live: false, now: NOW, userId: "carol" };

  it("holds back a result a spectator's board can't show yet", () => {
    const summary = toGameSummaryFor(game(), spectator);
    expect(summary).toMatchObject({
      blackHalfPoints: null,
      endReason: null,
      finishedAt: null,
      ply: 2,
      result: null,
      status: TournamentGameStatus.ONGOING,
      whiteHalfPoints: null
    });
  });

  it("shows a spectator the delayed ply of an ongoing game", () => {
    const summary = toGameSummaryFor(game({ status: TournamentGameStatus.ONGOING, finishedAt: null, result: null }), spectator);
    expect(summary.ply).toBe(2);
  });

  it("shows everything once the delay has passed", () => {
    const summary = toGameSummaryFor(game({ finishedAt: new Date(NOW - 20_000) }), spectator);
    expect(summary).toMatchObject({ ply: 3, result: "WHITE_WIN", whiteHalfPoints: 2 });
  });

  it("shows a player their own game, and a host every game, live", () => {
    expect(toGameSummaryFor(game(), { ...spectator, userId: "amy" }).result).toBe("WHITE_WIN");
    expect(toGameSummaryFor(game(), { ...spectator, live: true }).result).toBe("WHITE_WIN");
  });

  it("changes nothing without a delay", () => {
    expect(toGameSummaryFor(game(), { ...spectator, delaySec: 0 }).result).toBe("WHITE_WIN");
  });
});
