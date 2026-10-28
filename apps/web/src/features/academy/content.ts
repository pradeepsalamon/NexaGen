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
      "Nexa Chess Academy (nexachess.in) is an elite chess coaching platform offering structured, interactive chess education for beginners, intermediate improvers, and competitive tournament players across the globe."
  },
  {
    question: "Who can join the classes?",
    answer:
      "Anyone passionate about learning or mastering chess! We welcome absolute beginners who have never touched a piece, aspiring club players wanting structured tactics, and competitive tournament players preparing for FIDE ratings."
  },
  {
    question: "What age groups do you teach?",
    answer:
      "We teach children from 5 years old up to teenagers and adults. Our curriculum is tailored by skill level and cognitive stage, ensuring an engaging, supportive learning experience for every student."
  },
  {
    question: "Do you provide certificates?",
    answer:
      "Yes. Upon completing curriculum milestones, tournament events, and proficiency evaluations, students receive official Nexa Chess Academy achievement certificates."
  },
  {
    question: "Do you offer trial classes?",
    answer:
      "Yes! We offer a completely free, zero-commitment 1-on-1 demo evaluation class where you meet an expert coach, assess your current skill level, and experience our interactive teaching environment."
  },
  {
    question: "Are the classes live?",
    answer:
      "100% of our classes are live and interactive. Students and coaches collaborate in real time on interactive digital chessboards with two-way audio and video guidance."
  },
  {
    question: "How are coaches selected?",
    answer:
      "Our coaching roster comprises FIDE-rated masters, titled players, and certified national instructors selected through rigorous background verification, tactical screening, and child pedagogy standards."
  },
  {
    question: "What makes Nexa Chess different?",
    answer:
      "Unlike generic video courses or crowded classrooms, Nexa Chess combines personalized Grandmaster-designed roadmaps, dedicated 1-on-1 and micro-batch coaching, weekly Sunday tournament practice, and detailed performance analytics."
  }
];
