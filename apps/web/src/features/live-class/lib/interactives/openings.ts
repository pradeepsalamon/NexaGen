// "Opening of the Day" catalogue. Move lists are SAN from the start position;
// the tool replays them through chess.js, so an illegal line shows an error
// rather than a wrong board.

export type OpeningOfTheDay = {
  id: string;
  name: string;
  eco: string;
  moves: string[];
  ideas: string[];
};

export const OPENINGS: OpeningOfTheDay[] = [
  {
    id: "italian",
    name: "Italian Game (Giuoco Piano)",
    eco: "C53",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4"],
    ideas: [
      "The bishop on c4 aims at f7, Black's weakest square.",
      "c3 prepares d4 to build a big pawn centre.",
      "Castle early — both kings get safe quickly.",
    ],
  },
  {
    id: "ruy-lopez",
    name: "Ruy López",
    eco: "C84",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6", "Ba4", "Nf6", "O-O", "Be7"],
    ideas: [
      "Bb5 pressures the knight that defends e5.",
      "White castles before opening the centre.",
      "Black's ...a6 asks the bishop a question right away.",
    ],
  },
  {
    id: "scotch",
    name: "Scotch Game",
    eco: "C45",
    moves: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4", "Nxd4", "Bc5"],
    ideas: [
      "White opens the centre immediately with d4.",
      "The knight on d4 is strong but can become a target.",
      "Black develops with tempo by hitting the knight.",
    ],
  },
  {
    id: "sicilian-najdorf",
    name: "Sicilian Defence: Najdorf",
    eco: "B90",
    moves: ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6", "Nc3", "a6"],
    ideas: [
      "Black trades a wing pawn for White's centre pawn.",
      "...a6 keeps pieces off b5 and prepares ...e5 or ...b5.",
      "Opposite plans: White often attacks the king, Black the queenside.",
    ],
  },
  {
    id: "french",
    name: "French Defence: Classical",
    eco: "C13",
    moves: ["e4", "e6", "d4", "d5", "Nc3", "Nf6", "Bg5", "Be7"],
    ideas: [
      "Black challenges e4 straight away with ...d5.",
      "The light-squared bishop on c8 can be hard to activate.",
      "Pawn chains decide the plans: attack the base of the chain.",
    ],
  },
  {
    id: "caro-kann",
    name: "Caro-Kann Defence",
    eco: "B18",
    moves: ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4", "Bf5", "Ng3", "Bg6"],
    ideas: [
      "Black supports ...d5 with ...c6 — very solid.",
      "The bishop comes out before ...e6 locks it in.",
      "Black aims for a healthy pawn structure and a good endgame.",
    ],
  },
  {
    id: "scandinavian",
    name: "Scandinavian Defence",
    eco: "B01",
    moves: ["e4", "d5", "exd5", "Qxd5", "Nc3", "Qa5", "d4", "Nf6", "Nf3"],
    ideas: [
      "Black hits e4 on move one.",
      "The queen comes out early, so White gains time attacking it.",
      "Black's queen on a5 stays safe and pins along the diagonal.",
    ],
  },
  {
    id: "pirc",
    name: "Pirc Defence",
    eco: "B07",
    moves: ["e4", "d6", "d4", "Nf6", "Nc3", "g6"],
    ideas: [
      "Black lets White build a centre — then attacks it.",
      "The bishop on g7 will pressure the long diagonal.",
      "Flexible: Black chooses ...e5 or ...c5 later.",
    ],
  },
  {
    id: "qgd",
    name: "Queen's Gambit Declined",
    eco: "D53",
    moves: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5", "Be7"],
    ideas: [
      "c4 'offers' a pawn to pull Black's d-pawn away from the centre.",
      "Black declines with ...e6 and keeps a strong point on d5.",
      "Bg5 pins the knight that defends d5.",
    ],
  },
  {
    id: "qga",
    name: "Queen's Gambit Accepted",
    eco: "D27",
    moves: ["d4", "d5", "c4", "dxc4", "Nf3", "Nf6", "e3", "e6", "Bxc4", "c5"],
    ideas: [
      "Black takes the pawn but doesn't try to keep it.",
      "White regains it with Bxc4 and develops at the same time.",
      "...c5 strikes back at White's centre.",
    ],
  },
  {
    id: "slav",
    name: "Slav Defence",
    eco: "D17",
    moves: ["d4", "d5", "c4", "c6", "Nf3", "Nf6", "Nc3", "dxc4", "a4", "Bf5"],
    ideas: [
      "...c6 defends d5 without blocking the c8 bishop.",
      "a4 stops Black from holding the extra pawn with ...b5.",
      "Black's bishop gets out to f5 before ...e6.",
    ],
  },
  {
    id: "london",
    name: "London System",
    eco: "D02",
    moves: ["d4", "d5", "Bf4", "Nf6", "e3", "e6", "Nf3", "c5", "c3", "Nc6"],
    ideas: [
      "White develops the dark bishop before playing e3.",
      "A solid setup you can play against almost anything.",
      "c3 supports d4 and gives the bishop a retreat.",
    ],
  },
  {
    id: "kings-indian",
    name: "King's Indian Defence",
    eco: "E92",
    moves: [
      "d4",
      "Nf6",
      "c4",
      "g6",
      "Nc3",
      "Bg7",
      "e4",
      "d6",
      "Nf3",
      "O-O",
      "Be2",
      "e5",
    ],
    ideas: [
      "Black castles first and strikes the centre later with ...e5.",
      "Typical plans: Black attacks on the kingside, White on the queenside.",
      "The bishop on g7 is Black's best piece.",
    ],
  },
  {
    id: "nimzo-indian",
    name: "Nimzo-Indian Defence",
    eco: "E20",
    moves: ["d4", "Nf6", "c4", "e6", "Nc3", "Bb4"],
    ideas: [
      "Bb4 pins the knight to stop e4.",
      "Black may give the bishop for the knight to double White's pawns.",
      "A fight for control of e4.",
    ],
  },
  {
    id: "english",
    name: "English Opening",
    eco: "A29",
    moves: ["c4", "e5", "Nc3", "Nf6", "g3", "d5", "cxd5", "Nxd5", "Bg2"],
    ideas: [
      "White controls d5 from the side with c4.",
      "Like a Sicilian with colours reversed — White has an extra move.",
      "The fianchettoed bishop on g2 pressures the long diagonal.",
    ],
  },
  {
    id: "dutch",
    name: "Dutch Defence",
    eco: "A90",
    moves: ["d4", "f5", "g3", "Nf6", "Bg2", "e6", "Nf3", "Be7", "O-O", "O-O"],
    ideas: [
      "...f5 grabs control of e4.",
      "Black often plans a kingside attack.",
      "The f-pawn move slightly weakens Black's king — handle it with care.",
    ],
  },
];

/** The same opening all day for everyone in one timezone. */
export function openingForDay(dayKey: string): OpeningOfTheDay {
  let hash = 0;
  for (const ch of dayKey) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return OPENINGS[hash % OPENINGS.length];
}
