// ──────────────────────────────────────────────────────────────
// Tactical detection — the shared contract.
//
// The detector itself runs in the API (it needs a move generator); reports,
// insights and the web read these shapes. Method: docs/GAME_ANALYSIS.md §7.
//
// A tactic is only reported when the ENGINE LINE realises a concrete gain —
// material (≥ `minMaterialGain` pawns over the pre-blunder baseline) or a
// forced mate — so an ordinary positional slip is never called tactical.
// The motif is then identified on the board:
//   CONFIRMED — the motif's geometry is present on the line's first move.
//   INFERRED  — recognised from the move sequence (removal of the defender,
//               intermediate move) or found on a later move of the line.
// A gain with no recognisable motif is reported as MATERIAL_GAIN ("missed
// tactical opportunity") rather than forced into a named pattern.
// ──────────────────────────────────────────────────────────────

import type { z } from "zod";
import type { chessColorSchema } from "./core-schemas";

type ChessColor = z.infer<typeof chessColorSchema>;

export const GAME_TACTICS_VERSION = "nexa-tactics-v1";

export const TACTIC_MOTIFS = [
  "MATE",
  "BACK_RANK_MATE",
  "FORK",
  "DOUBLE_ATTACK",
  "PIN",
  "SKEWER",
  "DISCOVERED_ATTACK",
  "DISCOVERED_CHECK",
  "DOUBLE_CHECK",
  "HANGING_PIECE",
  "REMOVAL_OF_DEFENDER",
  "INTERMEDIATE_MOVE",
  "PROMOTION",
  "MATERIAL_GAIN"
] as const;
export type TacticMotif = (typeof TACTIC_MOTIFS)[number];

export const TACTIC_MOTIF_LABELS: Record<TacticMotif, string> = {
  BACK_RANK_MATE: "Back-rank mate",
  DISCOVERED_ATTACK: "Discovered attack",
  DISCOVERED_CHECK: "Discovered check",
  DOUBLE_ATTACK: "Double attack",
  DOUBLE_CHECK: "Double check",
  FORK: "Fork",
  HANGING_PIECE: "Hanging piece",
  INTERMEDIATE_MOVE: "Intermediate move",
  MATE: "Forced checkmate",
  MATERIAL_GAIN: "Tactical opportunity",
  PIN: "Pin",
  PROMOTION: "Promotion",
  REMOVAL_OF_DEFENDER: "Removal of the defender",
  SKEWER: "Skewer"
};

/**
 * Deterministic board patterns vs. sequence-based inference. Deflection and
 * decoy are deliberately NOT detected yet: their available evidence did not
 * separate them reliably from ordinary captures, so they surface as
 * MATERIAL_GAIN.
 */
export const TACTIC_MOTIF_DETECTION: Record<TacticMotif, "GEOMETRY" | "SEQUENCE" | "ENGINE"> = {
  BACK_RANK_MATE: "GEOMETRY",
  DISCOVERED_ATTACK: "GEOMETRY",
  DISCOVERED_CHECK: "GEOMETRY",
  DOUBLE_ATTACK: "GEOMETRY",
  DOUBLE_CHECK: "GEOMETRY",
  FORK: "GEOMETRY",
  HANGING_PIECE: "GEOMETRY",
  INTERMEDIATE_MOVE: "SEQUENCE",
  MATE: "ENGINE",
  MATERIAL_GAIN: "ENGINE",
  PIN: "GEOMETRY",
  PROMOTION: "GEOMETRY",
  REMOVAL_OF_DEFENDER: "SEQUENCE",
  SKEWER: "GEOMETRY"
};

export type TacticConfidence = "CONFIRMED" | "INFERRED";

export type TacticMotifEvidence = {
  motif: TacticMotif;
  confidence: TacticConfidence;
  /** 0 = the line's first move; 2 = the side's second move in the line. */
  atLinePly: number;
  /** Squares that show the pattern (the attacker first, then its targets). */
  squares: string[];
};

/**
 * FOUND — the engine's move was played. ALTERNATIVE — another move kept the
 * evaluation (not a miss). MISSED — the move cost at least a mistake's worth
 * of expected score. UNKNOWN — the move itself could not be classified.
 */
export type TacticOutcome = "FOUND" | "ALTERNATIVE" | "MISSED" | "UNKNOWN";

export type TacticGain = { kind: "MATERIAL"; pawns: number } | { kind: "MATE"; moves: number };

export type TacticalOpportunity = {
  /** Position index (= half-moves before it) where the tactic was available. */
  ply: number;
  /** The side that had the tactic. */
  side: ChessColor;
  fen: string;
  gain: TacticGain;
  /** Strongest motif first; MATERIAL_GAIN alone when nothing was recognised. */
  motifs: TacticMotifEvidence[];
  primaryMotif: TacticMotif;
  bestMoveUci: string;
  lineUci: string[];
  lineSan: string[];
  playedUci: string | null;
  outcome: TacticOutcome;
  /** The opponent's move (ply − 1) that created it, when that move was at least a mistake. */
  allowedByPly: number | null;
};

export type GameTactics = {
  version: string;
  opportunities: TacticalOpportunity[];
};

export type TacticDetectionPolicy = {
  version: string;
  /** Material the line must win over the baseline, in pawns. */
  minMaterialGain: number;
  /** The mover's win% must exceed the previous position's by this much (the opponent gave something). */
  minWinPercentJump: number;
  /** Forced mates up to this distance count as a tactic. */
  maxMateMoves: number;
  /** How far down the engine line material is counted. */
  maxLinePlies: number;
};

export const DEFAULT_TACTIC_DETECTION_POLICY: TacticDetectionPolicy = {
  maxLinePlies: 10,
  maxMateMoves: 5,
  minMaterialGain: 2,
  minWinPercentJump: 15,
  version: GAME_TACTICS_VERSION
};

/** Display/teaching priority when several motifs share one tactic (lower first). */
export const TACTIC_MOTIF_PRIORITY: Record<TacticMotif, number> = {
  BACK_RANK_MATE: 0,
  MATE: 1,
  DOUBLE_CHECK: 2,
  DISCOVERED_CHECK: 3,
  FORK: 4,
  SKEWER: 5,
  PIN: 6,
  DISCOVERED_ATTACK: 7,
  DOUBLE_ATTACK: 8,
  REMOVAL_OF_DEFENDER: 9,
  INTERMEDIATE_MOVE: 10,
  PROMOTION: 11,
  HANGING_PIECE: 12,
  MATERIAL_GAIN: 13
};

export function sortMotifEvidence(evidence: TacticMotifEvidence[]): TacticMotifEvidence[] {
  return [...evidence].sort(
    (a, b) =>
      (a.confidence === b.confidence ? 0 : a.confidence === "CONFIRMED" ? -1 : 1) ||
      TACTIC_MOTIF_PRIORITY[a.motif] - TACTIC_MOTIF_PRIORITY[b.motif] ||
      a.atLinePly - b.atLinePly
  );
}
