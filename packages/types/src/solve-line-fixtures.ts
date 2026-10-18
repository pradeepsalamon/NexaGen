/**
 * Shared cases for the SOLVE_LINE "any mate wins" rule
 * (`isAcceptedMateAlternative`). The API engine and the client solver mirror
 * (`puzzleSolverEngine.ts`) both run these, so the two cannot drift silently.
 * Every position and line was verified with chess.js.
 */
export type SolveLineMateFixture = {
  name: string;
  fen: string;
  /** Book line, UCI. */
  solution: string[];
  /** Moves already played: always a prefix of `solution`. */
  played: string[];
  /** The move the student plays next. */
  candidate: string;
  /** Whether the candidate completes the line. */
  accepted: boolean;
};

const BACK_RANK = "7k/6pp/8/8/8/8/1R6/R5K1 w - - 0 1";
const BACK_RANK_LONG = "7k/6pp/8/2p5/8/8/1R6/R5K1 w - - 0 1";
const BLACK_BACK_RANK = "r5k1/1r6/8/8/8/8/6PP/7K b - - 0 1";

export const SOLVE_LINE_MATE_FIXTURES: SolveLineMateFixture[] = [
  {
    name: "a second mating move on the only ply",
    fen: BACK_RANK,
    solution: ["a1a8"],
    played: [],
    candidate: "b2b8",
    accepted: true
  },
  {
    name: "a second mating move on the final ply of a longer line",
    fen: BACK_RANK_LONG,
    solution: ["b2b7", "c5c4", "a1a8"],
    played: ["b2b7", "c5c4"],
    candidate: "b7b8",
    accepted: true
  },
  {
    name: "a mate found earlier than the book line's mate",
    fen: BACK_RANK_LONG,
    solution: ["b2b7", "c5c4", "a1a8"],
    played: [],
    candidate: "a1a8",
    accepted: true
  },
  {
    name: "the same rule for black",
    fen: BLACK_BACK_RANK,
    solution: ["a8a1"],
    played: [],
    candidate: "b7b1",
    accepted: true
  },
  {
    name: "a legal move that does not mate",
    fen: BACK_RANK,
    solution: ["a1a8"],
    played: [],
    candidate: "a1a7",
    accepted: false
  },
  {
    name: "a mate against a book line that does not end in mate",
    fen: BACK_RANK,
    solution: ["a1a7"],
    played: [],
    candidate: "a1a8",
    accepted: false
  },
  {
    name: "an illegal move",
    fen: BACK_RANK,
    solution: ["a1a8"],
    played: [],
    candidate: "a1h8",
    accepted: false
  },
  {
    name: "a candidate past the end of the line",
    fen: BACK_RANK,
    solution: ["a1a8"],
    played: ["a1a8"],
    candidate: "b2b8",
    accepted: false
  }
];
