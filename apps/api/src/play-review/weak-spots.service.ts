import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  WEAK_SPOT_WINDOW_DAYS,
  buildWeakSpotProfile,
  type PlayFinding,
  type PlayTacticStats,
  type TrainingResult,
  type WeakSpotExample,
  type WeakSpotProfileResponse
} from "@nexa-chess/types";
import { AiPlayReviewStatus, PuzzleAttemptStatus, UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { Chess } from "../common/chess/chess";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanViewStudent } from "../progress/student-access";

/** Reviewed items read per profile (newest first); 60 days of a busy student fit. */
export const WEAK_SPOT_ITEM_CAP = 1500;
/** Finished puzzle attempts read per profile (newest first). */
export const WEAK_SPOT_PUZZLE_CAP = 1000;

/**
 * A student's weak spots (docs/WEAK_SPOTS.md): the pure
 * `buildWeakSpotProfile` over their reviewed play and puzzle results. Never
 * stored; the engine decided every miss. Phase A: their coach and admins.
 */
@Injectable()
export class WeakSpotsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async getFor(accessToken: string | undefined, studentId: string, now: Date = new Date()): Promise<WeakSpotProfileResponse> {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    // The student's own card comes in phase B (WS-1).
    if (viewer.role === UserRole.STUDENT) throw new ForbiddenException("Weak spots are for coaches and admins for now.");
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.build(studentId, now);
  }

  async build(studentId: string, now: Date): Promise<WeakSpotProfileResponse> {
    const since = new Date(now.getTime() - WEAK_SPOT_WINDOW_DAYS * 86_400_000);
    const [reviews, attempts] = await Promise.all([
      this.prisma.aiPlayReview.findMany({
        orderBy: [{ playedAt: "desc" }, { id: "desc" }],
        select: { findingsJson: true, playedAt: true, source: true, sourceId: true, tacticsJson: true },
        take: WEAK_SPOT_ITEM_CAP,
        where: { playedAt: { gte: since, lte: now }, status: AiPlayReviewStatus.DONE, studentId }
      }),
      this.prisma.puzzleAttempt.findMany({
        orderBy: { completedAt: "desc" },
        select: { completedAt: true, hintsUsed: true, puzzle: { select: { tags: true } }, status: true, wrongMoves: true },
        take: WEAK_SPOT_PUZZLE_CAP,
        where: {
          completedAt: { gte: since, lte: now },
          status: { in: [PuzzleAttemptStatus.SOLVED, PuzzleAttemptStatus.FAILED] },
          studentId
        }
      })
    ]);

    const profile = buildWeakSpotProfile({
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
      )
    });
    const withArrows = (examples: WeakSpotExample[]) => examples.map(withUci);
    return {
      ...profile,
      others: profile.others.map((m) => ({ ...m, examples: withArrows(m.examples) })),
      strengths: profile.strengths.map((m) => ({ ...m, examples: withArrows(m.examples) })),
      weakSpots: profile.weakSpots.map((m) => ({ ...m, examples: withArrows(m.examples) }))
    };
  }
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
