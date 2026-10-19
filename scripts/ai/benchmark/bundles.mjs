// Synthetic class-evidence bundles for the Phase 3a capacity benchmark
// (docs/ai/architecture/INFRASTRUCTURE_DECISION.md §4).
//
// Shaped like the Phase 3 EvidenceBuilder output (AI_FOUNDATION.md §A): refs
// E1..En, students S1..Sn, room-wide chat only. Nothing here comes from the
// database; the games are public-domain classics and every name is invented.
// Deterministic for a given index, so runs on different machines compare.

const GAMES = [
  {
    keywords: ["development", "pin"],
    pgn: "1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0",
    title: "Opera Game (Morphy, 1858)",
    topic: "Rapid development and the power of pins",
  },
  {
    keywords: ["queen sacrifice", "mate"],
    pgn: "1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0",
    title: "Legall's Mate",
    topic: "Punishing an early bishop pin",
  },
  {
    keywords: ["f7", "king safety"],
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 d5 5. exd5 Nxd5 6. Nxf7 Kxf7 7. Qf3+ Ke6 8. Nc3 Ncb4 9. a3 Nxc2+ 10. Kd1 Nxa1 11. Nxd5 Qh4 12. Nxc7+ Kd7 13. Qf7+ Qe7 14. Nxa8 1-0",
    title: "Fried Liver Attack",
    topic: "Attacking the weak f7 square",
  },
  {
    keywords: ["centre", "castling"],
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d4 exd4 6. cxd4 Bb4+ 7. Nc3 Nxe4 8. O-O Bxc3 9. d5 Bf6 10. Re1 Ne7 11. Rxe4 d6 12. Bg5 Bxg5 13. Nxg5 h6 14. Qe2 hxg5 15. Re1 Be6 16. dxe6 f6 17. Re3 c6 18. Rh3 Rxh3 19. gxh3 g6 20. Qf3 1-0",
    title: "Italian Game, Moller Attack",
    topic: "Opening the centre against an uncastled king",
  },
];

const THEMES = ["fork", "pin", "skewer", "mateIn2", "backRankMate", "discoveredAttack", "hangingPiece", "deflection"];
const CHAT_LINES = [
  "why can't the knight take on f7 straight away?",
  "is the queen trade good for white here?",
  "I missed the check on b5",
  "can black castle in this position?",
  "what if black plays h6 first?",
  "that rook move was so fast",
  "I thought it was a fork but it was a pin",
  "please show the line again",
];

// Small deterministic PRNG (mulberry32) so the bundles never change between runs.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeBundle(index) {
  const rand = rng(1000 + index);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const game = GAMES[index % GAMES.length];
  const studentCount = 3 + (index % 6); // 3..8
  const students = Array.from({ length: studentCount }, (_, i) => `S${i + 1}`);
  const evidence = [];
  const add = (item) => {
    const id = `E${evidence.length + 1}`;
    evidence.push({ id, ...item });
    return id;
  };

  add({ kind: "CLASS", title: `Batch lesson ${index + 1}: ${game.topic}`, durationMinutes: 45 + (index % 4) * 15, level: pick(["BEGINNER", "INTERMEDIATE"]) });
  add({ kind: "ACTIVITY_OUTLINE", items: ["Warm-up puzzles", `Model game: ${game.title}`, "Puzzle set", "Q&A"] });
  const pgnRef = add({ kind: "CHAPTER_PGN", title: game.title, pgn: game.pgn });
  const extra = GAMES[(index + 1) % GAMES.length];
  add({ kind: "CHAPTER_PGN", title: `Homework preview: ${extra.title}`, pgn: extra.pgn });
  add({ kind: "ATTENDANCE", present: studentCount - (index % 2), rostered: studentCount });

  const puzzleCount = 3 + (index % 3);
  for (let p = 0; p < puzzleCount; p += 1) {
    const results = students.map((s) => {
      const solved = rand() > 0.35;
      return { student: s, solved, seconds: Math.round(20 + rand() * 160) };
    });
    add({ kind: "PUZZLE", puzzleId: `pz_${index}_${p}`, theme: pick(THEMES), rating: 900 + Math.round(rand() * 800), results });
  }

  add({
    kind: "POLL",
    question: "Best move for White?",
    options: [
      { san: "Nxf7", votes: Math.round(rand() * studentCount) },
      { san: "O-O", votes: Math.round(rand() * studentCount) },
    ],
  });

  const chatCount = 8 + (index % 7); // 8..14
  for (let c = 0; c < chatCount; c += 1) {
    add({ kind: "ROOM_CHAT", from: rand() > 0.25 ? pick(students) : "COACH", text: pick(CHAT_LINES) });
  }

  add({ kind: "HOMEWORK", text: `Replay ${game.title} and solve 5 ${pick(THEMES)} puzzles` });

  return {
    bundleId: `bench-${index + 1}`,
    evidence,
    expectFacts: game.keywords,
    pgnRef,
    students,
  };
}

export function makeBundles(count) {
  return Array.from({ length: count }, (_, i) => makeBundle(i));
}
