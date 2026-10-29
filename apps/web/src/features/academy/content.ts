// ──────────────────────────────────────────────────────────────
// Nexa Chess Academy — the facts the marketing site states, in one place.
// ──────────────────────────────────────────────────────────────
// The visible FAQ, the schema.org JSON-LD and /llms.txt all read from here, so
// what search engines and AI assistants are told always matches the page.
// Only put things here that are true and shown on the site: structured data
// that doesn't match visible content is a Google spam-policy violation, and an
// AI answer quoting a wrong claim is worse than no answer.

export const ACADEMY_NAME = "Nexa Chess Academy";
/** Other names people search for; Google uses these for the site name. */
export const ACADEMY_ALTERNATE_NAMES = ["Nexa Chess", "NexaChess", "Nexa Chess Academy online", "nexachess.in"];

export const ACADEMY_TAGLINE = "Live online chess classes for kids and adults";
export const ACADEMY_DESCRIPTION =
  "Nexa Chess Academy runs live, interactive online chess classes for beginner, intermediate and advanced players — one-on-one, buddy and group formats with FIDE-rated coaches, weekly lessons, Sunday tournament training and a free demo class.";

export const ACADEMY_EMAIL = "nexachessacademy@gmail.com";
export const ACADEMY_PHONE = "+91-7010854643";
export const ACADEMY_WHATSAPP = "+91-9344967940";
export const ACADEMY_LOGO_PATH = "/academy/nexa_logo_light1.png";

/**
 * Official profiles (Instagram, YouTube, Facebook, LinkedIn, Google Business
 * Profile, lichess/chess.com club…). They become schema.org `sameAs`, which is
 * how Google and AI engines tie the brand together — add each one here.
 */
export const ACADEMY_SOCIAL_PROFILES: string[] = [];

export const ACADEMY_TOPICS = [
  "Chess",
  "Online chess coaching",
  "Chess for kids",
  "Chess openings",
  "Chess tactics",
  "Chess strategy",
  "Chess endgames",
  "Chess tournament preparation",
  "FIDE rating"
];

export type AcademyProgram = {
  level: string;
  /** schema.org educationalLevel */
  educationalLevel: "Beginner" | "Intermediate" | "Advanced";
  summary: string;
  topics: string[];
};

export const ACADEMY_PROGRAMS: AcademyProgram[] = [
  {
    educationalLevel: "Beginner",
    level: "Beginner Level",
    summary: "For new players: the rules, how every piece moves, opening fundamentals and simple tactics, built up through interactive games.",
    topics: [
      "Chess basics & rules",
      "Piece movement mastery",
      "Opening fundamentals",
      "Simple tactics & puzzles",
      "Confidence building",
      "Interactive game play"
    ]
  },
  {
    educationalLevel: "Intermediate",
    level: "Intermediate Level",
    summary: "For club players: strategy, tactical combinations, positional understanding, advanced openings and tournament preparation with game analysis.",
    topics: [
      "Strategy development",
      "Tactical combinations",
      "Positional understanding",
      "Tournament preparation",
      "Advanced openings",
      "Game analysis sessions"
    ]
  },
  {
    educationalLevel: "Advanced",
    level: "Advanced Level",
    summary: "For competitive players: advanced opening theory, deep calculation, endgame mastery, grandmaster game studies and psychological preparation for tournaments.",
    topics: [
      "Advanced opening theory",
      "Deep calculation skills",
      "Endgame mastery",
      "Competitive tournament coaching",
      "Grandmaster game studies",
      "Psychological preparation"
    ]
  }
];

export const ACADEMY_CLASS_FORMATS = [
  { name: "Individual classes", description: "One-on-one coaching with personalised attention, flexible timing and a custom curriculum." },
  { name: "Buddy combo classes", description: "Learn together with friends in an interactive, fun and competitive setting." },
  { name: "Group classes", description: "Collaborative, affordable coaching with team activities." }
];

export const ACADEMY_FAQ: { question: string; answer: string }[] = [
  {
    question: "What is Nexa Chess Academy?",
    answer:
      "Nexa Chess Academy (nexachess.in) is an online chess academy offering live, interactive chess classes for beginner, intermediate and advanced players. It has trained students in more than 8 countries."
  },
  {
    question: "Are the chess classes online?",
    answer:
      "Yes. Every class is a live online session with real-time interaction on a shared chessboard, so students can join from anywhere in the world."
  },
  {
    question: "What age can my child start learning chess?",
    answer:
      "Children can start young — several of our students began at about 6 years old and have gone on to win tournaments. Teenagers and adults join the same level-based programs."
  },
  {
    question: "Which levels do you teach?",
    answer:
      "Three programs: Beginner (rules, piece movement, opening fundamentals, simple tactics), Intermediate (strategy, tactical combinations, positional play, tournament preparation) and Advanced (opening theory, deep calculation, endgames, grandmaster game studies, psychological preparation)."
  },
  {
    question: "What class formats are available?",
    answer:
      "Individual one-on-one classes, buddy combo classes for learning with friends, and group classes. You choose the format that suits your child's pace and budget."
  },
  {
    question: "How long is each chess class?",
    answer:
      "45 to 55 minutes: a warm-up and review, the core lesson and theory, practice with puzzles, then game play and analysis."
  },
  {
    question: "Who are the coaches?",
    answer:
      "FIDE-rated chess professionals with years of teaching and tournament experience, who build a learning path around each student's strengths and goals."
  },
  {
    question: "Do you help students play tournaments and get a FIDE rating?",
    answer:
      "Yes. Training covers preparation for national and international tournaments, and every Sunday there is tournament practice — simulations, game analysis, opening preparation and endgame drills. Many of our students have earned FIDE ratings and won tournaments."
  },
  {
    question: "How do I book a free demo class?",
    answer: `Fill in the "Book Your Free Demo Class" form on nexachess.in, message us on WhatsApp at ${ACADEMY_WHATSAPP.replace("-", " ")}, call ${ACADEMY_PHONE.replace("-", " ")} or email ${ACADEMY_EMAIL}.`
  }
];
