import {
  TACTIC_MOTIFS,
  WEAK_SPOT_WINDOW_DAYS,
  buildWeakSpotProfile,
  type PlayFinding,
  type PlayTacticStats,
  type TacticMotif,
  type TrainingResult,
  type WeakSpotAudience,
  type WeakSpotExample,
  type WeakSpotProfileResponse,
  type WeakSpotTipReadings
} from "@nexa-chess/types";
import { AiPlayReviewStatus, PuzzleAttemptStatus } from "@prisma/client";
import { Chess } from "../common/chess/chess";
import type { PrismaService } from "../prisma/prisma.service";

/** Reviewed items read per profile (newest first); 60 days of a busy student fit. */
export const WEAK_SPOT_ITEM_CAP = 1500;
/** Finished puzzle attempts read per profile (newest first). */
export const WEAK_SPOT_PUZZLE_CAP = 1000;

type ProfileSource = Pick<PrismaService, "aiPlayReview" | "puzzleAttempt" | "weakSpotTipReview">;

/**
 * A student's weak-spot profile (docs/WEAK_SPOTS.md): the pure
 * `buildWeakSpotProfile` over their reviewed play and puzzle results, with
 * their academy's tip readings. A plain function (not a provider) so puzzle
 * training and the weekly report use the same one without a module cycle.
 * The caller has checked access; this runs inside the request's academy.
 */
export async function loadWeakSpotProfile(
  prisma: ProfileSource,
  studentId: string,
  options: { audience: WeakSpotAudience; now?: Date }
): Promise<WeakSpotProfileResponse> {
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - WEAK_SPOT_WINDOW_DAYS * 86_400_000);
  const [reviews, attempts, readings] = await Promise.all([
    prisma.aiPlayReview.findMany({
      orderBy: [{ playedAt: "desc" }, { id: "desc" }],
      select: { findingsJson: true, playedAt: true, source: true, sourceId: true, tacticsJson: true },
      take: WEAK_SPOT_ITEM_CAP,
      where: { playedAt: { gte: since, lte: now }, status: AiPlayReviewStatus.DONE, studentId }
    }),
    prisma.puzzleAttempt.findMany({
      orderBy: { completedAt: "desc" },
      select: { completedAt: true, hintsUsed: true, puzzle: { select: { tags: true } }, status: true, wrongMoves: true },
      take: WEAK_SPOT_PUZZLE_CAP,
      where: {
        completedAt: { gte: since, lte: now },
        status: { in: [PuzzleAttemptStatus.SOLVED, PuzzleAttemptStatus.FAILED] },
        studentId
      }
    }),
    loadTipReadings(prisma)
  ]);

  const profile = buildWeakSpotProfile({
    audience: options.audience,
    items: reviews.map((r) => ({
      findings: Array.isArray(r.findingsJson) ? (r.findingsJson as unknown as PlayFinding[]) : [],
      playedAt: r.playedAt.toISOString(),
      source: r.source,
      sourceId: r.sourceId,
      tactics: readTactics(r.tacticsJson)
    })),
    now: now.toISOString(),
    puzzles: attempts.map(
      (a): TrainingResult => ({
        completedAt: (a.completedAt as Date).toISOString(),
        hintsUsed: a.hintsUsed,
        solved: a.status === PuzzleAttemptStatus.SOLVED,
        themes: a.puzzle.tags,
        wrongMoves: a.wrongMoves
      })
    ),
    tipReadings: readings
  });
  const withArrows = (examples: WeakSpotExample[]) => examples.map(withUci);
  return {
    ...profile,
    others: profile.others.map((m) => ({ ...m, examples: withArrows(m.examples) })),
    strengths: profile.strengths.map((m) => ({ ...m, examples: withArrows(m.examples) })),
    weakSpots: profile.weakSpots.map((m) => ({ ...m, examples: withArrows(m.examples) }))
  };
}

/** The academy's tip readings, by motif (rows for unknown motifs are ignored). */
export async function loadTipReadings(prisma: Pick<PrismaService, "weakSpotTipReview">): Promise<WeakSpotTipReadings> {
  const rows = await prisma.weakSpotTipReview.findMany({ select: { baseText: true, motif: true, text: true } });
  const readings: WeakSpotTipReadings = {};
  for (const row of rows) {
    if ((TACTIC_MOTIFS as readonly string[]).includes(row.motif)) {
      readings[row.motif as TacticMotif] = { baseText: row.baseText, text: row.text };
    }
  }
  return readings;
}

/** Stored counts, or null for a review written before they were (an object, never trusted blindly). */
function readTactics(json: unknown): PlayTacticStats | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const stats: PlayTacticStats = {};
  for (const [motif, raw] of Object.entries(json as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    stats[motif as keyof PlayTacticStats] = { allowed: n(c.allowed), alternative: n(c.alternative), found: n(c.found), missed: n(c.missed) };
  }
  return stats;
}

/** The played and best moves as UCI, for the board arrows; null when the SAN doesn't play from the FEN. */
function withUci(example: WeakSpotExample): WeakSpotExample {
  return { ...example, bestMoveUci: sanToUci(example.fen, example.bestMoveSan), playedUci: sanToUci(example.fen, example.playedSan) };
}

function sanToUci(fen: string, san: string | null): string | null {
  if (!san || !fen) return null;
  try {
    const move = new Chess(fen).move(san);
    return `${move.from}${move.to}${move.promotion ?? ""}`;
  } catch {
    return null;
  }
}
