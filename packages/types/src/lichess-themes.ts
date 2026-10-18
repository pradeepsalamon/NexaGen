// ──────────────────────────────────────────────────────────────
// Lichess puzzle themes — the fixed, externally-owned vocabulary of the
// Lichess puzzle catalogue (73 keys, every one present in the 2026-10-01
// dump). Display labels and grouping are the only taxonomy needed:
// NexaChess's own hierarchy is PuzzleTopic folders.
// ──────────────────────────────────────────────────────────────

export type LichessThemeGroup = "mate" | "motif" | "phase" | "length" | "goal" | "origin" | "special";

export type LichessTheme = {
  key: string;
  label: string;
  group: LichessThemeGroup;
  /**
   * Below this student rating the training recommender does not pick the theme
   * as a target (it may still appear in a mixed pick). null = no floor.
   * Starting values; tune from attempt data.
   */
  minRating: number | null;
};

const t = (
  key: string,
  label: string,
  group: LichessThemeGroup,
  minRating: number | null = null
): LichessTheme => ({ key, label, group, minRating });

/**
 * Ordered by priority within the `mate` and `motif` groups: the first matching
 * key names a puzzle's primary motif (named mate patterns before "Mate in N",
 * specific motifs before broad ones).
 */
export const LICHESS_THEMES: readonly LichessTheme[] = [
  // Mate patterns, then mate length
  t("smotheredMate", "Smothered mate", "mate"),
  t("backRankMate", "Back rank mate", "mate"),
  t("anastasiaMate", "Anastasia's mate", "mate"),
  t("arabianMate", "Arabian mate", "mate"),
  t("bodenMate", "Boden's mate", "mate"),
  t("doubleBishopMate", "Double bishop mate", "mate"),
  t("dovetailMate", "Dovetail mate", "mate"),
  t("epauletteMate", "Epaulette mate", "mate"),
  t("hookMate", "Hook mate", "mate"),
  t("operaMate", "Opera mate", "mate"),
  t("pillsburysMate", "Pillsbury's mate", "mate"),
  t("swallowstailMate", "Swallow's tail mate", "mate"),
  t("triangleMate", "Triangle mate", "mate"),
  t("vukovicMate", "Vukovic mate", "mate"),
  t("morphysMate", "Morphy's mate", "mate"),
  t("blindSwineMate", "Blind swine mate", "mate"),
  t("killBoxMate", "Kill box mate", "mate"),
  t("cornerMate", "Corner mate", "mate"),
  t("balestraMate", "Balestra mate", "mate"),
  t("mateIn1", "Mate in 1", "mate"),
  t("mateIn2", "Mate in 2", "mate"),
  t("mateIn3", "Mate in 3", "mate", 1300),
  t("mateIn4", "Mate in 4", "mate", 1600),
  t("mateIn5", "Mate in 5+", "mate", 1800),
  // Tactical motifs
  t("doubleCheck", "Double check", "motif"),
  t("discoveredCheck", "Discovered check", "motif"),
  t("discoveredAttack", "Discovered attack", "motif"),
  t("fork", "Fork", "motif"),
  t("pin", "Pin", "motif"),
  t("skewer", "Skewer", "motif"),
  t("xRayAttack", "X-ray attack", "motif", 1400),
  t("deflection", "Deflection", "motif"),
  t("attraction", "Attraction", "motif"),
  t("capturingDefender", "Capture the defender", "motif"),
  t("clearance", "Clearance", "motif", 1400),
  t("interference", "Interference", "motif", 1500),
  t("intermezzo", "Intermezzo", "motif", 1400),
  t("trappedPiece", "Trapped piece", "motif"),
  t("hangingPiece", "Hanging piece", "motif"),
  t("zugzwang", "Zugzwang", "motif", 1500),
  t("quietMove", "Quiet move", "motif", 1400),
  t("defensiveMove", "Defensive move", "motif", 1400),
  t("sacrifice", "Sacrifice", "motif"),
  t("attackingF2F7", "Attacking f2 or f7", "motif"),
  t("exposedKing", "Exposed king", "motif"),
  t("kingsideAttack", "Kingside attack", "motif"),
  t("queensideAttack", "Queenside attack", "motif"),
  t("advancedPawn", "Advanced pawn", "motif"),
  t("collinearMove", "Collinear move", "motif", 1500),
  // Special moves
  t("promotion", "Promotion", "special"),
  t("underPromotion", "Underpromotion", "special", 1400),
  t("castling", "Castling", "special"),
  t("enPassant", "En passant", "special"),
  // Game phase
  t("opening", "Opening", "phase"),
  t("middlegame", "Middlegame", "phase"),
  t("endgame", "Endgame", "phase"),
  t("pawnEndgame", "Pawn endgame", "phase"),
  t("knightEndgame", "Knight endgame", "phase"),
  t("bishopEndgame", "Bishop endgame", "phase"),
  t("rookEndgame", "Rook endgame", "phase"),
  t("queenEndgame", "Queen endgame", "phase"),
  t("queenRookEndgame", "Queen and rook endgame", "phase"),
  // Length
  t("oneMove", "One-move puzzle", "length"),
  t("short", "Short puzzle", "length"),
  t("long", "Long puzzle", "length"),
  t("veryLong", "Very long puzzle", "length", 1500),
  // Goal
  t("mate", "Checkmate", "goal"),
  t("crushing", "Crushing", "goal"),
  t("advantage", "Advantage", "goal"),
  t("equality", "Equality", "goal"),
  // Origin
  t("master", "Master game", "origin"),
  t("masterVsMaster", "Master vs master game", "origin"),
  t("superGM", "Super GM game", "origin")
];

const BY_KEY = new Map(LICHESS_THEMES.map((theme) => [theme.key, theme]));

export function lichessTheme(key: string): LichessTheme | undefined {
  return BY_KEY.get(key);
}

/** Display label for a theme key; an unknown key is shown as-is. */
export function lichessThemeLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}
