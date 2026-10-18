// Mystery Box rewards. Ids are persisted (MYSTERY_BOX.rewardId) — never rename one.
// Classroom treats only: no points, prizes or purchases.

export type MysteryReward = {
  id: string;
  emoji: string;
  title: string;
  detail: string;
};

export const MYSTERY_REWARDS: MysteryReward[] = [
  {
    id: "simul",
    emoji: "♚",
    title: "Simul vs the coach",
    detail: "The whole class plays the coach at once.",
  },
  {
    id: "pick-opening",
    emoji: "♞",
    title: "Class picks the next opening",
    detail: "Vote on the opening we study next lesson.",
  },
  {
    id: "bughouse",
    emoji: "♜",
    title: "Bughouse break",
    detail: "Ten minutes of team bughouse.",
  },
  {
    id: "puzzle-rush",
    emoji: "⚡",
    title: "Puzzle rush showdown",
    detail: "A speed-puzzle race against the clock.",
  },
  {
    id: "blindfold",
    emoji: "🙈",
    title: "Coach plays blindfold",
    detail: "The coach plays a student without seeing the board.",
  },
  {
    id: "legend-story",
    emoji: "📜",
    title: "Legend story time",
    detail: "Hear the story behind a famous game.",
  },
  {
    id: "trivia",
    emoji: "❓",
    title: "Chess trivia round",
    detail: "Teams battle in a chess quiz.",
  },
  {
    id: "student-coach",
    emoji: "🎓",
    title: "Student becomes coach",
    detail: "A student teaches the class a favourite trick.",
  },
  {
    id: "free-play",
    emoji: "♟",
    title: "Free play time",
    detail: "Play anyone in the class, any time control.",
  },
  {
    id: "fun-variant",
    emoji: "🎲",
    title: "Fun variant game",
    detail: "Try a chess variant together, like Chess960.",
  },
];

const BY_ID = new Map(MYSTERY_REWARDS.map((r) => [r.id, r]));
export const rewardById = (id: string | null) =>
  id ? (BY_ID.get(id) ?? null) : null;
