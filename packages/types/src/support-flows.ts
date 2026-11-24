// The WhatsApp support bot's conversation, as data plus one pure function
// (docs/WHATSAPP_SUPPORT.md §5). `transitionSupport` decides every reply and
// side effect from the stored state and the customer's message; the API only
// persists what it returns and performs its actions. Nothing here reads a
// database, the clock or Meta, so every path is unit-testable.
//
// v1 (Phases 1–2): a menu, one short question flow per category that ends in a
// ticket for staff, and a hand-off to a person. v2: course enquiries are
// answered at once from the academy's saved answers (typed keywords or a
// list), and "Book a free demo" collects what a `Lead` needs. The bot never
// reveals account data, never approves anything and never asks for card
// numbers, OTPs or passwords; it quotes only what admins wrote.

/** Stored on each conversation; bump when a state's meaning changes. */
export const SUPPORT_FLOW_VERSION = 2;

export const SUPPORT_CATEGORIES = ["COURSE", "REFUND", "CLASS", "PAYMENT", "TECH", "OTHER"] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABELS: Record<SupportCategory, string> = {
  CLASS: "Class issue",
  COURSE: "Courses & free demo",
  OTHER: "Talk to our team",
  PAYMENT: "Payment issue",
  REFUND: "Refund request",
  TECH: "App or login help"
};

export const SUPPORT_FLOW_STATES = [
  "START",
  "MAIN_MENU",
  "ASK_STUDENT",
  "ASK_DETAILS",
  "CONFIRM",
  "RESUME_PROMPT",
  "DONE",
  "COURSE_MENU",
  "DEMO_STUDENT",
  "DEMO_AGE",
  "DEMO_LEVEL",
  "DEMO_PARENT",
  "DEMO_TIME",
  "DEMO_CONFIRM"
] as const;
export type SupportFlowState = (typeof SUPPORT_FLOW_STATES)[number];

/** The same values as the website's demo form (`leadExperienceLevelSchema`). */
export const SUPPORT_DEMO_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type SupportDemoLevel = (typeof SUPPORT_DEMO_LEVELS)[number];

export const SUPPORT_DEMO_LEVEL_LABELS: Record<SupportDemoLevel, string> = {
  advanced: "Plays tournaments",
  beginner: "New to chess",
  intermediate: "Knows the moves"
};

/** What "Book a free demo" collects: the fields a `Lead` needs. */
export interface SupportDemoRequest {
  studentName: string;
  studentAge: number;
  level: SupportDemoLevel;
  parentName: string;
  preferredTime: string;
  /** A demo class the parent picked from the offered slots; the API books it after the ticket. */
  slotClassId?: string;
  /** A reschedule from a demo reminder: the booking this one replaces (docs/LEAD_STAGES.md). */
  replacesRegistrationId?: string;
}

/** Buttons on a demo reminder (docs/LEAD_STAGES.md); the registration id follows the prefix. */
export const SUPPORT_DEMO_ATTEND_PREFIX = "demo.attend.";
export const SUPPORT_DEMO_MOVE_PREFIX = "demo.move.";

/**
 * An upcoming demo class the bot may offer (the academy's demo schedules,
 * read by the API just before the question). The API books it only after the
 * parent confirms, and says the time is booked only once it is.
 */
export interface SupportDemoSlot {
  /** The demo class (`CoachClass`) id. */
  id: string;
  /** WhatsApp list-row limit: 24 characters, e.g. "Tue 18 Nov, 5:00 pm". */
  title: string;
  /** WhatsApp list-row limit: 72 characters (the class topic). */
  description?: string;
}

/** List rows for slots: WhatsApp allows 10, one is "Another time". */
export const SUPPORT_DEMO_SLOTS_MAX = 9;
export const SUPPORT_DEMO_SLOT_PREFIX = "demo.slot.";
const DEMO_SLOT_OTHER = "demo.slot.other";

/** An admin-written answer the bot may send (a SupportSavedReply with `showInBot`). */
export interface SupportBotAnswer {
  id: string;
  /** WhatsApp list-row limit: 24 characters. */
  title: string;
  /** WhatsApp list-row limit: 72 characters. */
  description: string | null;
  body: string;
  /** Normalized (`normalizeSupportKeywords`). */
  keywords: string[];
}

/** List rows left for answers: WhatsApp allows 10, two are "Book a free demo" and "Talk to our team". */
export const SUPPORT_BOT_ANSWERS_MAX = 8;

/** Who is answering: the bot, nobody yet (handed off), a staff member, or nobody (closed). */
export const SUPPORT_CONVERSATION_STATUSES = ["BOT", "WAITING_AGENT", "AGENT", "CLOSED"] as const;
export type SupportConversationStatus = (typeof SUPPORT_CONVERSATION_STATUSES)[number];

/** What the bot has collected so far. Stored as JSON on the conversation. */
export interface SupportDraft {
  category?: SupportCategory;
  studentName?: string;
  details?: string;
  /** Free demo booking (DEMO_* states). */
  studentAge?: number;
  level?: SupportDemoLevel;
  parentName?: string;
  preferredTime?: string;
  /** The offered demo slot the parent tapped (its class id and label). */
  slotId?: string;
  /** The parent chose "Another time": ask for a time in their own words. */
  askedOwnTime?: boolean;
  /** "Did you mean …?" is waiting for Yes/No: the answer offered and the question as typed. */
  suggestion?: { answerId: string; question: string };
  /** Consecutive replies the bot couldn't understand. */
  invalidCount?: number;
  /** The question to go back to after "Continue" (RESUME_PROMPT). */
  resumeState?: SupportFlowState;
  /** Rescheduling from a demo reminder: the booking the new time replaces. */
  replacesRegistrationId?: string;
}

export type SupportInput =
  | { kind: "text"; text: string }
  /** A tap on a reply button or list row: its id, as sent in our payload. */
  | { kind: "reply"; id: string }
  /** An image, voice note, sticker, location… — nothing the bot can read. */
  | { kind: "unsupported" }
  /** An image or PDF the API kept for staff (a payment screenshot…). The bot never reads it. */
  | { kind: "media" };

export interface SupportReplyButton {
  id: string;
  /** WhatsApp limit: 20 characters. */
  title: string;
}

export interface SupportListRow {
  id: string;
  /** WhatsApp limit: 24 characters. */
  title: string;
  /** WhatsApp limit: 72 characters. */
  description?: string;
}

/**
 * One outgoing message. `{{ticket.reference}}` in a body is filled in by the
 * API after the ticket is created.
 */
export type SupportReply =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; buttons: SupportReplyButton[] }
  | { kind: "list"; body: string; button: string; rows: SupportListRow[] };

export type SupportAction =
  /** Create the ticket (deduped by the API) and hand the conversation to staff. */
  | {
      kind: "TICKET";
      category: SupportCategory;
      studentName: string | null;
      details: string | null;
      /** The customer asked for a person rather than finishing a form. */
      handoff: boolean;
      /** A free demo booking: the API also creates (or matches) a `Lead`. */
      demo?: SupportDemoRequest;
    }
  | { kind: "OPT_OUT" }
  | { kind: "OPT_IN" }
  /** A question no saved answer matched (or the customer said No to a guess): listed for admins. */
  | { kind: "UNANSWERED"; text: string }
  /** "LINK <code>": the API checks the code and links this number to its student (Phase D). */
  | { kind: "LINK_ACCOUNT"; code: string }
  /** "NEXT CLASS" from a number: the API answers only if it is linked to a student. */
  | { kind: "ACCOUNT_QUERY" }
  /** "Yes, I'll attend" on a demo reminder: the API checks the booking is this number's and confirms it. */
  | { kind: "DEMO_ATTEND"; registrationId: string };

export interface SupportConversationSnapshot {
  state: SupportFlowState;
  status: SupportConversationStatus;
  draft: SupportDraft;
}

export interface SupportTransitionContext {
  /** Shown in the greeting. */
  academyName: string;
  /** Full URL of the privacy page, linked in the first message. */
  privacyUrl: string;
  /** The customer was silent longer than the session timeout. */
  idle: boolean;
  /** The API removed a card number / OTP from this message before storing it. */
  redacted: boolean;
  /** The academy's saved answers shown in the bot, in menu order (at most SUPPORT_BOT_ANSWERS_MAX). */
  answers: SupportBotAnswer[];
  /** Upcoming demo classes to offer at DEMO_TIME (at most SUPPORT_DEMO_SLOTS_MAX); none = ask for a time. */
  demoSlots?: SupportDemoSlot[];
  /** The academy's main menu (`supportMenuEntries`); absent = the built-in one. */
  menu?: SupportMenuEntry[];
  /** The academy lets linked numbers ask for their next class (Phase D). */
  accountAnswers?: boolean;
  /**
   * "Reschedule" on a demo reminder: the booking it was for, when the API found it is this
   * number's and not over yet. Absent = an unknown or stale button (a fresh booking starts).
   */
  reschedule?: { level: SupportDemoLevel; parentName: string; registrationId: string; studentAge: number; studentName: string };
}

/** Characters of a link code: no 0/O, 1/I/L, so it can be read out on the phone. */
export const SUPPORT_LINK_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const SUPPORT_LINK_CODE_LENGTH = 8;

/** The code in "LINK ABCD-2345" (any case, dash or space optional), normalized; null otherwise. */
export function supportLinkCodeIn(text: string): string | null {
  const match = /^\s*link\s+([a-z0-9][a-z0-9\s-]{5,20})\s*$/i.exec(text);
  if (!match) return null;
  const code = match[1].replace(/[\s-]/g, "").toUpperCase();
  return code.length === SUPPORT_LINK_CODE_LENGTH ? code : null;
}

/** Typed questions a linked number can ask about its student. */
const ACCOUNT_WORDS = new Set(["next class", "my class", "my classes", "class time", "class timing", "batch timing", "when is my class", "when is the next class"]);

export function isSupportAccountQuestion(text: string): boolean {
  return ACCOUNT_WORDS.has(normalizeSupportText(text));
}

function menuOf(ctx: Pick<SupportTransitionContext, "menu">): SupportMenuEntry[] {
  return ctx.menu ?? MAIN_MENU_ROWS;
}

export interface SupportTransitionResult extends SupportConversationSnapshot {
  replies: SupportReply[];
  actions: SupportAction[];
}

export const SUPPORT_TICKET_REFERENCE_PLACEHOLDER = "{{ticket.reference}}";

/** Limits on what the customer types into the flow. */
export const SUPPORT_INPUT_LIMITS = {
  details: { max: 1500, min: 5 },
  parentName: { max: 80, min: 2 },
  preferredTime: { max: 200, min: 2 },
  studentAge: { max: 99, min: 3 },
  studentName: { max: 80, min: 2 }
} as const;

/** After this many replies the bot can't understand, it offers a person. */
export const SUPPORT_INVALID_REPLIES_BEFORE_OFFER = 3;

// ── Copy ──

const NEVER_SEND = "Never send card numbers, OTPs or passwords here.";

const MAIN_MENU_ROWS: { category: SupportCategory; row: SupportListRow }[] = [
  { category: "COURSE", row: { description: "Fees, classes, book a free demo", id: "menu.course", title: "Courses & free demo" } },
  { category: "REFUND", row: { description: "Ask for a refund of a payment", id: "menu.refund", title: "Refund request" } },
  { category: "CLASS", row: { description: "Missed class, can't join, reschedule", id: "menu.class", title: "Class issue" } },
  { category: "PAYMENT", row: { description: "Paid but no access, paid twice", id: "menu.payment", title: "Payment issue" } },
  { category: "TECH", row: { description: "Can't sign in, app not working", id: "menu.tech", title: "App or login help" } },
  { category: "OTHER", row: { description: "A person replies here", id: "menu.human", title: "Talk to our team" } }
];

/** One main-menu option as an academy sets it (Support → Settings; plan D5 (a)). */
export interface SupportMenuItem {
  category: SupportCategory;
  enabled: boolean;
  title: string;
  description: string;
}

export type SupportMenuEntry = { category: SupportCategory; row: SupportListRow };

/** WhatsApp list limits: row title 24, description 72 characters. */
export const SUPPORT_MENU_TITLE_MAX = 24;
export const SUPPORT_MENU_DESCRIPTION_MAX = 72;

/** The menu as built: every option, in this order. */
export const DEFAULT_SUPPORT_MENU: SupportMenuItem[] = MAIN_MENU_ROWS.map((entry) => ({
  category: entry.category,
  description: entry.row.description ?? "",
  enabled: true,
  title: entry.row.title
}));

/**
 * The options the bot shows, in the academy's order. "Talk to our team"
 * (OTHER) can't be switched off: it is the way to a person. Each option keeps
 * its built-in row id, so a tap still means the same thing after a rename.
 */
export function supportMenuEntries(items?: SupportMenuItem[] | null): SupportMenuEntry[] {
  if (!items) return MAIN_MENU_ROWS;
  const entries: SupportMenuEntry[] = [];
  for (const item of items) {
    const builtIn = MAIN_MENU_ROWS.find((entry) => entry.category === item.category);
    if (!builtIn || entries.some((entry) => entry.category === item.category)) continue;
    if (!item.enabled && item.category !== "OTHER") continue;
    const title = item.title.trim().slice(0, SUPPORT_MENU_TITLE_MAX) || builtIn.row.title;
    const description = item.description.trim().slice(0, SUPPORT_MENU_DESCRIPTION_MAX);
    entries.push({ category: item.category, row: { ...(description ? { description } : {}), id: builtIn.row.id, title } });
  }
  if (!entries.some((entry) => entry.category === "OTHER")) entries.push(MAIN_MENU_ROWS.find((entry) => entry.category === "OTHER")!);
  return entries;
}

const STUDENT_QUESTION: Record<SupportCategory, string> = {
  CLASS: "What is the student's name?",
  COURSE: "Great! What is the student's name?",
  OTHER: "What is the student's name?",
  PAYMENT: "What is the student's name (as registered with us)?",
  REFUND: "What is the student's name (as registered with us)?",
  TECH: "What is the student's name, or the name on the account?"
};

const DETAILS_QUESTION: Record<SupportCategory, string> = {
  CLASS:
    "Please tell us what happened: the class date and time, the batch, and the problem (missed it, couldn't join, need to reschedule, or an issue with the coach).",
  COURSE:
    "Please share the student's age, their chess experience (new, knows the moves, or plays tournaments) and a good time for us to call you.",
  OTHER: "Please tell us how we can help.",
  PAYMENT: `Please tell us the payment date, the amount, the payment reference from your receipt and what went wrong. ${NEVER_SEND}`,
  REFUND: `Please tell us the course or batch, the payment date, the payment reference from your receipt and why you'd like a refund. ${NEVER_SEND}`,
  TECH: "Please describe the problem: what you tried, the device (phone or laptop) and any error message you saw."
};

const CONFIRM_BUTTONS: SupportReplyButton[] = [
  { id: "confirm.send", title: "Send" },
  { id: "confirm.edit", title: "Edit details" },
  { id: "confirm.cancel", title: "Cancel" }
];

const RESUME_BUTTONS: SupportReplyButton[] = [
  { id: "resume.continue", title: "Continue" },
  { id: "resume.restart", title: "Start again" }
];

const DEMO_CONFIRM_BUTTONS: SupportReplyButton[] = [
  { id: "confirm.send", title: "Book demo" },
  { id: "confirm.edit", title: "Edit details" },
  { id: "confirm.cancel", title: "Cancel" }
];

const DEMO_LEVEL_BUTTONS: SupportReplyButton[] = SUPPORT_DEMO_LEVELS.map((level) => ({
  id: `demo.level.${level}`,
  title: SUPPORT_DEMO_LEVEL_LABELS[level]
}));

const COURSE_DEMO_ROW: SupportListRow = {
  description: "A free class to find the right level",
  id: "course.demo",
  title: "Book a free demo"
};
const COURSE_HUMAN_ROW: SupportListRow = { description: "A person replies here", id: "course.human", title: "Talk to our team" };

/** Shown under every answer, and as the follow-up nudge's choices. */
const AFTER_ANSWER_BUTTONS: SupportReplyButton[] = [
  { id: "course.demo", title: "Book free demo" },
  { id: "course.more", title: "More questions" },
  { id: "course.human", title: "Talk to our team" }
];

const NUDGE_BUTTONS: SupportReplyButton[] = [
  { id: "course.demo", title: "Book free demo" },
  { id: "course.more", title: "Ask a question" },
  { id: "nudge.no", title: "No thanks" }
];

/** Typed words that start the demo booking from the course menu. */
const DEMO_WORDS = ["book", "demo", "free class", "trial"];

const ANSWER_ROW_PREFIX = "answer.";

/** Preview of the details inside the confirm message (its body is capped at 1024 characters). */
const CONFIRM_PREVIEW_CHARS = 600;

export function supportMainMenu(intro?: string, menu: SupportMenuEntry[] = MAIN_MENU_ROWS): SupportReply {
  const lines = [intro, `How can we help? Pick an option, or reply with its number (1–${menu.length}).`].filter(Boolean);
  return {
    body: lines.join("\n\n"),
    button: "Choose an option",
    kind: "list",
    rows: menu.map((entry) => entry.row)
  };
}

function greeting(ctx: SupportTransitionContext): string {
  return `Hi! This is the ${ctx.academyName} assistant. How we handle your messages: ${ctx.privacyUrl}`;
}

/** The course menu: the academy's answers, then "Book a free demo" and "Talk to our team". */
export function supportCourseMenu(answers: SupportBotAnswer[], intro?: string): SupportReply {
  const rows: SupportListRow[] = [
    ...answers.slice(0, SUPPORT_BOT_ANSWERS_MAX).map((answer) => ({
      ...(answer.description ? { description: answer.description.slice(0, 72) } : {}),
      id: `${ANSWER_ROW_PREFIX}${answer.id}`,
      title: answer.title.slice(0, 24)
    })),
    COURSE_DEMO_ROW,
    COURSE_HUMAN_ROW
  ];
  const ask = answers.length > 0
    ? "What would you like to know? Pick a question or type your own, or book a free demo class."
    : "Would you like to book a free demo class? Or type your question.";
  return {
    body: [intro, ask].filter(Boolean).join("\n\n"),
    button: "See options",
    kind: "list",
    rows
  };
}

/** The bot's one follow-up to a parent who asked about classes but didn't book (support-follow-up.service.ts). */
export function supportNudgeMessage(): SupportReply {
  return {
    body: "Hi again! Would you like to book a free demo class? It's the easiest way to find the right level. Tap below, or ask us anything.",
    buttons: NUDGE_BUTTONS,
    kind: "buttons"
  };
}

function answerReplies(answer: SupportBotAnswer): SupportReply[] {
  return [
    { body: answer.body, kind: "text" },
    { body: "Anything else? Tap a button, or type another question.", buttons: AFTER_ANSWER_BUTTONS, kind: "buttons" }
  ];
}

function suggestionMessage(answer: SupportBotAnswer): SupportReply {
  return {
    body: `Did you mean "${answer.title}"?`,
    buttons: [
      { id: `${ANSWER_ROW_PREFIX}${answer.id}`, title: "Yes" },
      { id: "suggest.no", title: "No, something else" }
    ],
    kind: "buttons"
  };
}

function demoConfirmMessage(draft: SupportDraft): SupportReply {
  return {
    body: [
      "Please check your free demo request:",
      `Student: ${draft.studentName ?? "-"}, age ${draft.studentAge ?? "-"}`,
      `Level: ${draft.level ? SUPPORT_DEMO_LEVEL_LABELS[draft.level] : "-"}`,
      `Parent: ${draft.parentName ?? "-"}`,
      draft.slotId ? `Class: ${draft.preferredTime ?? "-"}` : `Preferred time: ${draft.preferredTime ?? "-"}`,
      "Book it?"
    ].join("\n"),
    buttons: DEMO_CONFIRM_BUTTONS,
    kind: "buttons"
  };
}

function questionFor(state: SupportFlowState, draft: SupportDraft, ctx: SupportTransitionContext): SupportReply {
  const category = draft.category ?? "OTHER";
  const student = draft.studentName ?? "the student";
  switch (state) {
    case "ASK_STUDENT":
      return { body: STUDENT_QUESTION[category], kind: "text" };
    case "ASK_DETAILS":
      return { body: DETAILS_QUESTION[category], kind: "text" };
    case "CONFIRM":
      return confirmMessage(draft);
    case "COURSE_MENU":
      return supportCourseMenu(ctx.answers);
    case "DEMO_STUDENT":
      return { body: "Great! What is the student's name?", kind: "text" };
    case "DEMO_AGE":
      return { body: `How old is ${student}? Reply with a number.`, kind: "text" };
    case "DEMO_LEVEL":
      return { body: `What is ${student}'s chess level?`, buttons: DEMO_LEVEL_BUTTONS, kind: "buttons" };
    case "DEMO_PARENT":
      return { body: "Thanks! And your name (parent or guardian)?", kind: "text" };
    case "DEMO_TIME": {
      const slots = (ctx.demoSlots ?? []).slice(0, SUPPORT_DEMO_SLOTS_MAX);
      if (slots.length > 0 && !draft.askedOwnTime) {
        return {
          body: "Pick a time for the free demo class, or choose Another time.",
          button: "See times",
          kind: "list",
          rows: [
            ...slots.map((slot) => ({
              id: `${SUPPORT_DEMO_SLOT_PREFIX}${slot.id}`,
              title: slot.title.slice(0, 24),
              ...(slot.description ? { description: slot.description.slice(0, 72) } : {})
            })),
            { description: "Tell us what suits you", id: DEMO_SLOT_OTHER, title: "Another time" }
          ]
        };
      }
      return {
        body: "When would suit you for the free demo class? For example: weekdays after 5 pm, or Saturday morning.",
        kind: "text"
      };
    }
    case "DEMO_CONFIRM":
      return demoConfirmMessage(draft);
    case "RESUME_PROMPT": {
      const what = draft.resumeState?.startsWith("DEMO_")
        ? "booking a free demo class"
        : `in the middle of a ${SUPPORT_CATEGORY_LABELS[category].toLowerCase()}`;
      return {
        body: `You were ${what}. Continue where you left off, or start again?`,
        buttons: RESUME_BUTTONS,
        kind: "buttons"
      };
    }
    default:
      return supportMainMenu(undefined, menuOf(ctx));
  }
}

function confirmMessage(draft: SupportDraft): SupportReply {
  const details = draft.details ?? "";
  const preview = details.length > CONFIRM_PREVIEW_CHARS ? `${details.slice(0, CONFIRM_PREVIEW_CHARS)}…` : details;
  return {
    body: [
      "Please check your request:",
      `Request: ${SUPPORT_CATEGORY_LABELS[draft.category ?? "OTHER"]}`,
      `Student: ${draft.studentName ?? "-"}`,
      `Details: ${preview}`,
      "Send it to our team?"
    ].join("\n"),
    buttons: CONFIRM_BUTTONS,
    kind: "buttons"
  };
}

// ── Input reading ──

/** Lower-cased, trimmed, inner whitespace collapsed, trailing punctuation dropped. */
export function normalizeSupportText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

type GlobalCommand = "AGENT" | "BACK" | "CANCEL" | "MENU" | "START" | "STOP";

const GLOBAL_WORDS: Record<string, GlobalCommand> = {
  "0": "MENU",
  agent: "AGENT",
  back: "BACK",
  cancel: "CANCEL",
  human: "AGENT",
  menu: "MENU",
  "main menu": "MENU",
  person: "AGENT",
  start: "START",
  stop: "STOP",
  "talk to a person": "AGENT",
  unsubscribe: "STOP"
};

/** At the menu, a greeting just shows the menu again (mid-form it is an answer like any other). */
const GREETINGS: ReadonlySet<string> = new Set(["hello", "hey", "hi", "hii", "namaste", "vanakkam"]);

/**
 * STOP / START in a message the bot doesn't answer (lead capture with the bot off): the same
 * words as the bot's own opt-out and opt-in, nothing else.
 */
export function supportOptCommand(text: string | null | undefined): "START" | "STOP" | null {
  if (!text) return null;
  const command = GLOBAL_WORDS[normalizeSupportText(text)];
  return command === "STOP" || command === "START" ? command : null;
}

function globalCommand(input: SupportInput): GlobalCommand | null {
  if (input.kind !== "text") return null;
  return GLOBAL_WORDS[normalizeSupportText(input.text)] ?? null;
}

/** Words that pick a category from the main menu without the number. */
const MENU_KEYWORDS: { category: SupportCategory; words: string[] }[] = [
  { category: "REFUND", words: ["refund", "money back"] },
  { category: "PAYMENT", words: ["paid twice", "payment", "charged"] },
  { category: "COURSE", words: ["course", "fees", "fee", "trial", "demo", "join academy", "admission"] },
  { category: "CLASS", words: ["class", "reschedule", "missed"] },
  { category: "TECH", words: ["login", "log in", "sign in", "password", "app", "not working"] }
];

/** A main-menu option picked exactly: a tapped row, its number or its title. */
function menuChoice(input: SupportInput, menu: SupportMenuEntry[]): SupportCategory | null {
  if (input.kind === "reply") {
    return menu.find((entry) => entry.row.id === input.id)?.category ?? null;
  }
  if (input.kind !== "text") return null;
  const text = normalizeSupportText(input.text);
  const index = /^\d+$/.test(text) ? Number(text) - 1 : -1;
  if (index >= 0 && index < menu.length) return menu[index].category;
  return menu.find((entry) => normalizeSupportText(entry.row.title) === text)?.category ?? null;
}

/** A main-menu option guessed from words in a typed message ("refund", "paid twice"…). */
function menuKeywordChoice(input: SupportInput, menu: SupportMenuEntry[]): SupportCategory | null {
  if (input.kind !== "text") return null;
  const text = normalizeSupportText(input.text);
  // A switched-off option isn't guessed either.
  return (
    MENU_KEYWORDS.find((entry) => menu.some((item) => item.category === entry.category) && entry.words.some((word) => text.includes(word)))
      ?.category ?? null
  );
}

/**
 * Lower-cased, trimmed keywords without duplicates or blanks, as stored on a
 * saved answer. A keyword is a word or a short phrase.
 */
export function normalizeSupportKeywords(keywords: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of keywords) {
    const keyword = normalizeSupportText(raw);
    if (keyword && !out.includes(keyword)) out.push(keyword);
  }
  return out;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The saved answer a typed message asks for, or null. A keyword matches as a
 * whole word or phrase (a plural "s"/"es" allowed: "fee" matches "fees"); when
 * several answers match, the longest keyword wins, then the earlier answer.
 */
export function matchSupportAnswer(text: string, answers: readonly SupportBotAnswer[]): SupportBotAnswer | null {
  const normalized = normalizeSupportText(text);
  if (!normalized) return null;
  let best: { answer: SupportBotAnswer; length: number } | null = null;
  for (const answer of answers) {
    for (const keyword of answer.keywords) {
      if (!keyword) continue;
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(keyword)}(?:s|es)?(?=$|[^\\p{L}\\p{N}])`, "u");
      if (pattern.test(normalized) && (!best || keyword.length > best.length)) best = { answer, length: keyword.length };
    }
  }
  return best?.answer ?? null;
}

/**
 * Edit distance with adjacent swaps (optimal string alignment): "fess" → "fees"
 * is 1. Stops early once it exceeds `max`.
 */
export function supportEditDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows: number[][] = [Array.from({ length: b.length + 1 }, (_, j) => j)];
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      row.push(value);
      best = Math.min(best, value);
    }
    if (best > max) return max + 1;
    rows.push(row);
  }
  return rows[a.length][b.length];
}

/**
 * Everyday words that sit one letter away from likely keywords ("feel" / "fees",
 * "time" / "tie"…): never read as a misspelling.
 */
const NOT_A_TYPO: ReadonlySet<string> = new Set([
  "about", "also", "after", "back", "been", "best", "call", "came", "come", "date", "days", "does", "done", "each",
  "even", "feed", "feel", "feet", "file", "fill", "find", "fine", "five", "free", "from", "game", "gave", "give", "good",
  "have", "here", "hope", "into", "just", "keep", "kind", "know", "last", "late", "left", "like", "line", "list", "live",
  "long", "look", "made", "make", "many", "more", "most", "much", "must", "name", "need", "next", "nice", "only", "open",
  "over", "part", "play", "real", "same", "says", "seen", "send", "sent", "some", "soon", "sure", "take", "tell", "than",
  "that", "them", "then", "they", "this", "time", "told", "took", "very", "want", "week", "well", "went", "were", "what",
  "when", "will", "with", "work", "your"
]);

/** How many letters a word of this length may be off by and still count as a misspelling. */
function typoAllowance(length: number): number {
  if (length < 4) return 0;
  return length < 8 ? 1 : 2;
}

function wordsOf(text: string): string[] {
  return normalizeSupportText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/** One typed word against one keyword word (or its plural): exact, or a small slip with the same first letter. */
function wordLooksLike(typed: string, keyword: string): boolean {
  for (const form of [keyword, `${keyword}s`, `${keyword}es`]) {
    if (typed === form) return true;
    const allowance = typoAllowance(form.length);
    if (allowance === 0 || typed.length < 4 || typed[0] !== form[0] || NOT_A_TYPO.has(typed)) continue;
    if (supportEditDistance(typed, form, allowance) <= allowance) return true;
  }
  return false;
}

/**
 * The saved answer a typed message probably means despite a spelling slip
 * ("fess", "timngs"), or null. Only for when `matchSupportAnswer` found
 * nothing: the bot then asks "Did you mean …?" rather than answering, so a
 * wrong guess costs one tap. Every word of a keyword phrase must be there, in
 * order, each exact or a small slip; the longest keyword wins.
 */
export function suggestSupportAnswer(text: string, answers: readonly SupportBotAnswer[]): SupportBotAnswer | null {
  const typed = wordsOf(text);
  if (typed.length === 0) return null;
  let best: { answer: SupportBotAnswer; length: number } | null = null;
  for (const answer of answers) {
    for (const keyword of answer.keywords) {
      const parts = wordsOf(keyword);
      if (parts.length === 0 || parts.length > typed.length) continue;
      for (let start = 0; start + parts.length <= typed.length; start += 1) {
        if (parts.every((part, i) => wordLooksLike(typed[start + i], part))) {
          if (!best || keyword.length > best.length) best = { answer, length: keyword.length };
          break;
        }
      }
    }
  }
  return best?.answer ?? null;
}

/** Whether a message the bot couldn't use is worth listing for admins (not "ok", "hmm", a number…). */
export function isSupportQuestionWorthListing(text: string): boolean {
  const normalized = normalizeSupportText(text);
  return normalized.length >= 6 && /\p{L}/u.test(normalized) && !/^\d+$/.test(normalized);
}

/** A saved answer picked from the course menu: a tapped row, its number or its title. */
function courseAnswerChoice(input: SupportInput, answers: readonly SupportBotAnswer[]): SupportBotAnswer | null {
  const shown = answers.slice(0, SUPPORT_BOT_ANSWERS_MAX);
  if (input.kind === "reply") {
    if (!input.id.startsWith(ANSWER_ROW_PREFIX)) return null;
    const id = input.id.slice(ANSWER_ROW_PREFIX.length);
    return answers.find((answer) => answer.id === id) ?? null;
  }
  if (input.kind !== "text") return null;
  const text = normalizeSupportText(input.text);
  const index = /^\d+$/.test(text) ? Number(text) - 1 : -1;
  if (index >= 0 && index < shown.length) return shown[index];
  return shown.find((answer) => answer.title.toLowerCase() === text) ?? null;
}

type CourseChoice = "DEMO" | "HUMAN" | "MORE" | "NO_THANKS";

/** The course menu's fixed options: its two last rows, the buttons under an answer and the nudge. */
function courseChoice(input: SupportInput, answerCount: number): CourseChoice | null {
  const ids: Record<string, CourseChoice> = {
    "course.demo": "DEMO",
    "course.human": "HUMAN",
    "course.more": "MORE",
    "nudge.no": "NO_THANKS"
  };
  if (input.kind === "reply") return ids[input.id] ?? null;
  if (input.kind !== "text") return null;
  const text = normalizeSupportText(input.text);
  const shown = Math.min(answerCount, SUPPORT_BOT_ANSWERS_MAX);
  if (text === String(shown + 1) || text === COURSE_DEMO_ROW.title.toLowerCase()) return "DEMO";
  if (text === String(shown + 2) || text === COURSE_HUMAN_ROW.title.toLowerCase()) return "HUMAN";
  if (["more questions", "ask a question"].includes(text)) return "MORE";
  if (["no thanks", "no thank you", "not now", "no"].includes(text)) return "NO_THANKS";
  return null;
}

function wantsDemo(input: SupportInput): boolean {
  if (input.kind !== "text") return false;
  const text = normalizeSupportText(input.text);
  return DEMO_WORDS.some((word) => text.includes(word));
}

function demoLevelChoice(input: SupportInput): SupportDemoLevel | null {
  if (input.kind === "reply") {
    return DEMO_LEVEL_BUTTONS.some((button) => button.id === input.id)
      ? (input.id.slice("demo.level.".length) as SupportDemoLevel)
      : null;
  }
  if (input.kind !== "text") return null;
  const text = normalizeSupportText(input.text);
  const index = /^\d+$/.test(text) ? Number(text) - 1 : -1;
  if (index >= 0 && index < SUPPORT_DEMO_LEVELS.length) return SUPPORT_DEMO_LEVELS[index];
  const byTitle = SUPPORT_DEMO_LEVELS.find((level) => SUPPORT_DEMO_LEVEL_LABELS[level].toLowerCase() === text);
  if (byTitle) return byTitle;
  if (/tournament|advanced|rated|fide/.test(text)) return "advanced";
  if (/moves|basic|intermediate|knows|plays a little/.test(text)) return "intermediate";
  if (/\bnew\b|beginner|never|no experience|just starting/.test(text)) return "beginner";
  return null;
}

/** The first whole number in a reply ("9", "9 years", "she is 9"), or null. */
function readAge(input: SupportInput): number | null {
  if (input.kind !== "text") return null;
  const match = /\b(\d{1,3})\b/.exec(input.text);
  return match ? Number(match[1]) : null;
}

type ButtonChoice = "CANCEL" | "CONTINUE" | "EDIT" | "RESTART" | "SEND";

function buttonChoice(input: SupportInput, state: SupportFlowState): ButtonChoice | null {
  const buttons =
    state === "CONFIRM"
      ? CONFIRM_BUTTONS
      : state === "DEMO_CONFIRM"
        ? DEMO_CONFIRM_BUTTONS
        : state === "RESUME_PROMPT"
          ? RESUME_BUTTONS
          : [];
  const ids: Record<string, ButtonChoice> = {
    "confirm.cancel": "CANCEL",
    "confirm.edit": "EDIT",
    "confirm.send": "SEND",
    "resume.continue": "CONTINUE",
    "resume.restart": "RESTART"
  };
  if (input.kind === "reply") {
    return buttons.some((button) => button.id === input.id) ? ids[input.id] ?? null : null;
  }
  if (input.kind !== "text") return null;
  // nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos -- /^\d+$/ runs in linear time
  const text = normalizeSupportText(input.text);
  const index = /^\d+$/.test(text) ? Number(text) - 1 : -1;
  const button =
    (index >= 0 ? buttons[index] : undefined) ??
    buttons.find((entry) => entry.title.toLowerCase() === text) ??
    ((state === "CONFIRM" || state === "DEMO_CONFIRM") && ["yes", "ok", "okay", "submit", "book"].includes(text)
      ? buttons[0]
      : undefined);
  return button ? ids[button.id] ?? null : null;
}

// ── Sensitive input ──

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Removes what must never be stored: a card-like number (13–19 digits, spaces or
 * dashes allowed, Luhn-valid) and a code written next to "OTP"/"PIN"/"password".
 * Runs before anything is written to the database.
 */
export function redactSupportText(text: string): { text: string; redacted: boolean } {
  let redacted = false;
  let out = text.replace(/\b\d(?:[ -]?\d){12,18}\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
    redacted = true;
    return "[card number removed]";
  });
  out = out.replace(/\b(otp|pin|password|passcode|cvv)\b(\s*(?:is|:|-|=)?\s*)(\S+)/gi, (_match, word: string, gap: string) => {
    redacted = true;
    return `${word}${gap}[removed]`;
  });
  return { redacted, text: out };
}

// ── The transition ──

function result(
  snapshot: SupportConversationSnapshot,
  replies: SupportReply[],
  actions: SupportAction[] = []
): SupportTransitionResult {
  return { ...snapshot, actions, replies };
}

const PREVIOUS: Partial<Record<SupportFlowState, SupportFlowState>> = {
  ASK_DETAILS: "ASK_STUDENT",
  ASK_STUDENT: "MAIN_MENU",
  CONFIRM: "ASK_DETAILS",
  COURSE_MENU: "MAIN_MENU",
  DEMO_AGE: "DEMO_STUDENT",
  DEMO_CONFIRM: "DEMO_TIME",
  DEMO_LEVEL: "DEMO_AGE",
  DEMO_PARENT: "DEMO_LEVEL",
  DEMO_STUDENT: "COURSE_MENU",
  DEMO_TIME: "DEMO_PARENT"
};

const IN_FORM: ReadonlySet<SupportFlowState> = new Set([
  "ASK_STUDENT",
  "ASK_DETAILS",
  "CONFIRM",
  "DEMO_STUDENT",
  "DEMO_AGE",
  "DEMO_LEVEL",
  "DEMO_PARENT",
  "DEMO_TIME",
  "DEMO_CONFIRM"
]);

/** The ticket text staff read for a demo booking. */
export function supportDemoSummary(demo: SupportDemoRequest): string {
  return [
    "Free demo class request",
    `Student: ${demo.studentName}, age ${demo.studentAge}`,
    `Level: ${SUPPORT_DEMO_LEVEL_LABELS[demo.level]}`,
    `Parent: ${demo.parentName}`,
    demo.slotClassId ? `Chosen class: ${demo.preferredTime}` : `Preferred time: ${demo.preferredTime}`
  ].join("\n");
}

function demoFromDraft(draft: SupportDraft): SupportDemoRequest | null {
  if (!draft.studentName || !draft.studentAge || !draft.level || !draft.parentName || !draft.preferredTime) return null;
  return {
    level: draft.level,
    parentName: draft.parentName,
    preferredTime: draft.preferredTime,
    ...(draft.replacesRegistrationId ? { replacesRegistrationId: draft.replacesRegistrationId } : {}),
    ...(draft.slotId ? { slotClassId: draft.slotId } : {}),
    studentAge: draft.studentAge,
    studentName: draft.studentName
  };
}

/** The course menu's state with a fresh draft. */
function courseMenuState(): SupportConversationSnapshot {
  return { draft: { category: "COURSE" }, state: "COURSE_MENU", status: "BOT" };
}

function startDemo(): SupportTransitionResult {
  return result({ draft: { category: "COURSE" }, state: "DEMO_STUDENT", status: "BOT" }, [
    { body: "Great! What is the student's name?", kind: "text" }
  ]);
}

function ticketAction(draft: SupportDraft, handoff: boolean): SupportAction {
  return {
    category: draft.category ?? "OTHER",
    details: draft.details ?? null,
    handoff,
    kind: "TICKET",
    studentName: draft.studentName ?? null
  };
}

function handoff(draft: SupportDraft): SupportTransitionResult {
  return result(
    { draft: {}, state: "DONE", status: "WAITING_AGENT" },
    [
      {
        body: `Okay, a member of our team will reply here as soon as they can. Your reference is ${SUPPORT_TICKET_REFERENCE_PLACEHOLDER}. Reply MENU to go back to the menu.`,
        kind: "text"
      }
    ],
    [ticketAction(draft.category ? draft : { ...draft, category: "OTHER" }, true)]
  );
}

/** A tap on an older message's button while the bot waits for typed text. */
const EARLIER_BUTTON = "That button is from an earlier message. Please type your answer instead.";

function invalid(
  snapshot: SupportConversationSnapshot,
  message: string,
  question: SupportReply
): SupportTransitionResult {
  const invalidCount = (snapshot.draft.invalidCount ?? 0) + 1;
  const offer =
    invalidCount >= SUPPORT_INVALID_REPLIES_BEFORE_OFFER ? " If you'd rather talk to a person, reply AGENT." : "";
  return result({ ...snapshot, draft: { ...snapshot.draft, invalidCount } }, [
    { body: `${message}${offer}`, kind: "text" },
    question
  ]);
}

/**
 * The bot's one decision function. Given the stored conversation and the
 * customer's (already redacted) message, returns the next state and what to
 * send and do. While a person owns the conversation the bot stays silent.
 */
export function transitionSupport(
  current: SupportConversationSnapshot,
  input: SupportInput,
  ctx: SupportTransitionContext
): SupportTransitionResult {
  const command = globalCommand(input);
  // nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos -- the regexes below (\p{L}, \s+) run in linear time
  const draft = current.draft ?? {};
  // Steps that read typed text explain a stale button tap instead of the length rule.
  const typed = (message: string): string => (input.kind === "reply" ? EARLIER_BUTTON : message);
  const warning: SupportReply[] = ctx.redacted
    ? [{ body: `For your safety I removed a card number or code from your message. ${NEVER_SEND}`, kind: "text" }]
    : [];
  const withWarning = (next: SupportTransitionResult): SupportTransitionResult => ({
    ...next,
    replies: [...warning, ...next.replies]
  });
  const typedAnswer = input.kind === "text" ? matchSupportAnswer(input.text, ctx.answers) : null;
  const answered = (answer: SupportBotAnswer, intro: SupportReply[] = []): SupportTransitionResult =>
    withWarning(result(courseMenuState(), [...intro, ...answerReplies(answer)]));
  // No exact keyword: maybe a spelling slip. The bot asks rather than answers.
  const typedSuggestion = input.kind === "text" && !typedAnswer ? suggestSupportAnswer(input.text, ctx.answers) : null;
  const suggested = (answer: SupportBotAnswer, intro: SupportReply[] = []): SupportTransitionResult =>
    withWarning(
      result(
        {
          draft: { category: "COURSE", suggestion: { answerId: answer.id, question: input.kind === "text" ? input.text.trim().slice(0, 500) : "" } },
          state: "COURSE_MENU",
          status: "BOT"
        },
        [...intro, suggestionMessage(answer)]
      )
    );
  /** Lists the message for admins when it looks like a real question. */
  const unanswered = (): SupportAction[] =>
    input.kind === "text" && isSupportQuestionWorthListing(input.text) ? [{ kind: "UNANSWERED", text: input.text.trim().slice(0, 500) }] : [];

  // Opt-out and opt-in work in every state; they only concern proactive messages.
  if (command === "STOP") {
    return result(current, [
      {
        body: "Done: you won't get reminders or updates from us on WhatsApp. Reply START to turn them back on. You can still message us any time.",
        kind: "text"
      }
    ], [{ kind: "OPT_OUT" }]);
  }
  if (command === "START" && current.status !== "BOT") {
    return result(current, [{ body: "WhatsApp reminders and updates are back on.", kind: "text" }], [{ kind: "OPT_IN" }]);
  }

  // Demo reminder buttons (docs/LEAD_STAGES.md). A confirmation is recorded whoever is
  // answering; the bot only says so, or reopens the times, while it has the conversation.
  if (input.kind === "reply" && input.id.startsWith(SUPPORT_DEMO_ATTEND_PREFIX)) {
    const registrationId = input.id.slice(SUPPORT_DEMO_ATTEND_PREFIX.length);
    const thanks: SupportReply[] =
      current.status === "BOT" ? [{ body: "Thank you! We've noted that you'll attend. See you at the class.", kind: "text" }] : [];
    return result(current, thanks, registrationId ? [{ kind: "DEMO_ATTEND", registrationId }] : []);
  }
  if (input.kind === "reply" && input.id.startsWith(SUPPORT_DEMO_MOVE_PREFIX) && current.status === "BOT") {
    const booking = ctx.reschedule;
    if (!booking || `${SUPPORT_DEMO_MOVE_PREFIX}${booking.registrationId}` !== input.id) {
      // An old reminder (that class is over or the booking is gone): book afresh.
      const fresh: SupportDraft = { category: "COURSE" };
      return result({ draft: fresh, state: "DEMO_STUDENT", status: "BOT" }, [questionFor("DEMO_STUDENT", fresh, ctx)]);
    }
    const nextDraft: SupportDraft = {
      category: "COURSE",
      level: booking.level,
      parentName: booking.parentName,
      replacesRegistrationId: booking.registrationId,
      studentAge: booking.studentAge,
      studentName: booking.studentName
    };
    return result({ draft: nextDraft, state: "DEMO_TIME", status: "BOT" }, [
      { body: `No problem, let's find another time for ${booking.studentName}.`, kind: "text" },
      questionFor("DEMO_TIME", nextDraft, ctx)
    ]);
  }

  // A person is answering: record only, never talk over them.
  if (current.status === "AGENT") return result(current, []);
  if (current.status === "WAITING_AGENT") {
    // Only an explicit MENU leaves the queue; a "hi" while waiting is for the team.
    const explicitMenu = input.kind === "text" && ["0", "main menu", "menu"].includes(normalizeSupportText(input.text));
    if (explicitMenu) {
      return withWarning(result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu(undefined, menuOf(ctx))]));
    }
    return result(current, []);
  }
  if (current.status === "CLOSED") {
    // A closed conversation is never resumed: the API opens a new one.
    return result(current, []);
  }

  // Existing students (Phase D): only where the academy switched it on. The
  // API answers; the conversation stays where it was.
  if (ctx.accountAnswers && input.kind === "text") {
    const code = supportLinkCodeIn(input.text);
    if (code) return result(current, [], [{ code, kind: "LINK_ACCOUNT" }]);
    if (isSupportAccountQuestion(input.text)) return result(current, [], [{ kind: "ACCOUNT_QUERY" }]);
  }

  if (command === "START") {
    return withWarning(
      result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [{ body: "WhatsApp reminders and updates are back on.", kind: "text" }, supportMainMenu(undefined, menuOf(ctx))], [
        { kind: "OPT_IN" }
      ])
    );
  }
  if (command === "AGENT") return withWarning(handoff(draft));
  if (command === "MENU") {
    const intro = current.state === "START" ? greeting(ctx) : undefined;
    return withWarning(result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu(intro, menuOf(ctx))]));
  }
  if (command === "CANCEL") {
    return withWarning(
      result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu("Cancelled. Nothing was sent to our team.", menuOf(ctx))])
    );
  }
  if (command === "BACK") {
    const previous = current.state === "RESUME_PROMPT" ? "MAIN_MENU" : PREVIOUS[current.state] ?? "MAIN_MENU";
    const nextDraft: SupportDraft =
      previous === "MAIN_MENU" ? {} : previous === "COURSE_MENU" ? { category: "COURSE" } : { ...draft, invalidCount: 0 };
    return withWarning(result({ draft: nextDraft, state: previous, status: "BOT" }, [questionFor(previous, nextDraft, ctx)]));
  }

  // First message of a conversation: greet, then answer it if it asks one of
  // the academy's questions, else show the menu.
  if (current.state === "START") {
    if (typedAnswer) return answered(typedAnswer, [{ body: greeting(ctx), kind: "text" }]);
    // A tap on an old follow-up's "Book free demo" after the conversation expired.
    if (input.kind === "reply" && courseChoice(input, ctx.answers.length) === "DEMO") return withWarning(startDemo());
    if (typedSuggestion) return suggested(typedSuggestion, [{ body: greeting(ctx), kind: "text" }]);
    // A first message is often just "hi"; only a real question goes on the admins' list.
    const asked = input.kind === "text" && input.text.includes("?") ? unanswered() : [];
    return withWarning(result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu(greeting(ctx), menuOf(ctx))], asked));
  }

  // Back after a pause in the middle of a form: offer to continue.
  if (ctx.idle && IN_FORM.has(current.state)) {
    const next: SupportConversationSnapshot = {
      draft: { ...draft, invalidCount: 0, resumeState: current.state },
      state: "RESUME_PROMPT",
      status: "BOT"
    };
    return withWarning(result(next, [questionFor("RESUME_PROMPT", next.draft, ctx)]));
  }

  if (current.state === "DONE") {
    if (typedAnswer) return answered(typedAnswer);
    if (typedSuggestion) return suggested(typedSuggestion);
    return withWarning(result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu("Welcome back!", menuOf(ctx))]));
  }

  if (input.kind === "unsupported") {
    return result(current, [
      { body: "Sorry, I can only read text messages for now.", kind: "text" },
      questionFor(current.state, draft, ctx)
    ]);
  }
  if (input.kind === "media") {
    return result(current, [
      {
        body: "Thanks, I've kept your file for our team. I can only read text myself, so please type your question too, or reply AGENT to reach a person.",
        kind: "text"
      },
      questionFor(current.state, draft, ctx)
    ]);
  }

  switch (current.state) {
    case "MAIN_MENU": {
      if (input.kind === "text" && GREETINGS.has(normalizeSupportText(input.text))) {
        return withWarning(result({ ...current, draft: {} }, [supportMainMenu(undefined, menuOf(ctx))]));
      }
      // An exact pick first, then one of the academy's answers, then a guess from words.
      const picked = menuChoice(input, menuOf(ctx));
      if (!picked && typedAnswer) return answered(typedAnswer);
      const category = picked ?? menuKeywordChoice(input, menuOf(ctx));
      if (!category) {
        if (typedSuggestion) return suggested(typedSuggestion);
        return withWarning({ ...invalid(current, "Sorry, I didn't get that.", supportMainMenu(undefined, menuOf(ctx))), actions: unanswered() });
      }
      if (category === "OTHER") return withWarning(handoff({ category: "OTHER" }));
      if (category === "COURSE") return withWarning(result(courseMenuState(), [supportCourseMenu(ctx.answers)]));
      const nextDraft: SupportDraft = { category };
      return withWarning(
        result({ draft: nextDraft, state: "ASK_STUDENT", status: "BOT" }, [questionFor("ASK_STUDENT", nextDraft, ctx)])
      );
    }

    case "COURSE_MENU": {
      // The answer to "Did you mean …?".
      if (draft.suggestion) {
        const said = input.kind === "text" ? normalizeSupportText(input.text) : "";
        const offered = ctx.answers.find((answer) => answer.id === draft.suggestion?.answerId);
        if (offered && ["yes", "y", "yes please", "yeah", "ok", "okay", "haan", "correct"].includes(said)) return answered(offered);
        const declined =
          (input.kind === "reply" && input.id === "suggest.no") || ["no", "n", "nope", "no, something else", "something else"].includes(said);
        if (declined) {
          return withWarning(
            result(
              courseMenuState(),
              [
                { body: "Okay. Reply AGENT and our team will answer you here, or pick an option:", kind: "text" },
                supportCourseMenu(ctx.answers)
              ],
              // They said the guess was wrong, so even a short word is a real miss.
              /\p{L}/u.test(draft.suggestion.question) ? [{ kind: "UNANSWERED", text: draft.suggestion.question }] : []
            )
          );
        }
      }
      const fixed = courseChoice(input, ctx.answers.length);
      if (fixed === "DEMO") return withWarning(startDemo());
      if (fixed === "HUMAN") return withWarning(handoff({ category: "COURSE" }));
      if (fixed === "MORE") return withWarning(result(courseMenuState(), [supportCourseMenu(ctx.answers)]));
      if (fixed === "NO_THANKS") {
        return withWarning(
          result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [
            { body: "No problem! Message us any time. Reply MENU to see everything we can help with.", kind: "text" }
          ])
        );
      }
      if (input.kind === "text" && GREETINGS.has(normalizeSupportText(input.text))) {
        return withWarning(result(courseMenuState(), [supportCourseMenu(ctx.answers)]));
      }
      const answer = courseAnswerChoice(input, ctx.answers) ?? typedAnswer;
      if (answer) return answered(answer);
      if (wantsDemo(input)) return withWarning(startDemo());
      // Something else from the main menu ("refund", "class") moves there.
      const category = menuKeywordChoice(input, menuOf(ctx));
      if (category && category !== "COURSE") {
        const nextDraft: SupportDraft = { category };
        return withWarning(
          result({ draft: nextDraft, state: "ASK_STUDENT", status: "BOT" }, [questionFor("ASK_STUDENT", nextDraft, ctx)])
        );
      }
      if (typedSuggestion) return suggested(typedSuggestion);
      return withWarning(
        result(
          { ...current, draft: { category: "COURSE" } },
          [
            {
              body: "Sorry, I don't have an answer to that yet. Reply AGENT and our team will answer you here, or pick an option:",
              kind: "text"
            },
            supportCourseMenu(ctx.answers)
          ],
          unanswered()
        )
      );
    }

    case "DEMO_STUDENT":
    case "DEMO_PARENT": {
      const name = input.kind === "text" ? input.text.trim().replace(/\s+/g, " ") : "";
      const limits = current.state === "DEMO_STUDENT" ? SUPPORT_INPUT_LIMITS.studentName : SUPPORT_INPUT_LIMITS.parentName;
      if (name.length < limits.min || name.length > limits.max) {
        return withWarning(
          invalid(current, typed(`Please reply with a name (${limits.min}–${limits.max} characters).`), questionFor(current.state, draft, ctx))
        );
      }
      const [nextDraft, state]: [SupportDraft, SupportFlowState] =
        current.state === "DEMO_STUDENT"
          ? [{ ...draft, invalidCount: 0, studentName: name }, "DEMO_AGE"]
          : [{ ...draft, invalidCount: 0, parentName: name }, "DEMO_TIME"];
      return withWarning(result({ draft: nextDraft, state, status: "BOT" }, [questionFor(state, nextDraft, ctx)]));
    }

    case "DEMO_AGE": {
      const age = readAge(input);
      const { max, min } = SUPPORT_INPUT_LIMITS.studentAge;
      if (age === null || age < min || age > max) {
        return withWarning(invalid(current, typed(`Please reply with the age as a number (${min}–${max}).`), questionFor("DEMO_AGE", draft, ctx)));
      }
      const nextDraft: SupportDraft = { ...draft, invalidCount: 0, studentAge: age };
      return withWarning(result({ draft: nextDraft, state: "DEMO_LEVEL", status: "BOT" }, [questionFor("DEMO_LEVEL", nextDraft, ctx)]));
    }

    case "DEMO_LEVEL": {
      const level = demoLevelChoice(input);
      if (!level) {
        return withWarning(invalid(current, "Please tap one of the buttons.", questionFor("DEMO_LEVEL", draft, ctx)));
      }
      const nextDraft: SupportDraft = { ...draft, invalidCount: 0, level };
      return withWarning(result({ draft: nextDraft, state: "DEMO_PARENT", status: "BOT" }, [questionFor("DEMO_PARENT", nextDraft, ctx)]));
    }

    case "DEMO_TIME": {
      if (input.kind === "reply" && input.id === DEMO_SLOT_OTHER) {
        const nextDraft: SupportDraft = { ...draft, askedOwnTime: true, invalidCount: 0 };
        return withWarning(result({ draft: nextDraft, state: "DEMO_TIME", status: "BOT" }, [questionFor("DEMO_TIME", nextDraft, ctx)]));
      }
      if (input.kind === "reply" && input.id.startsWith(SUPPORT_DEMO_SLOT_PREFIX)) {
        const slot = (ctx.demoSlots ?? []).find((candidate) => `${SUPPORT_DEMO_SLOT_PREFIX}${candidate.id}` === input.id);
        if (!slot) {
          // An old list: that class has started or is gone. Offer the current times.
          return withWarning(invalid(current, "That time is no longer available.", questionFor("DEMO_TIME", draft, ctx)));
        }
        const nextDraft: SupportDraft = { ...draft, invalidCount: 0, preferredTime: slot.title, slotId: slot.id };
        return withWarning(result({ draft: nextDraft, state: "DEMO_CONFIRM", status: "BOT" }, [demoConfirmMessage(nextDraft)]));
      }
      const time = input.kind === "text" ? input.text.trim().replace(/\s+/g, " ") : "";
      const { max, min } = SUPPORT_INPUT_LIMITS.preferredTime;
      if (time.length < min || time.length > max) {
        return withWarning(
          invalid(current, typed(`Please tell us a day and time that suits you (under ${max} characters).`), questionFor("DEMO_TIME", draft, ctx))
        );
      }
      // Typed words are a preferred time even while the list is showing.
      const nextDraft: SupportDraft = { ...draft, invalidCount: 0, preferredTime: time, slotId: undefined };
      return withWarning(result({ draft: nextDraft, state: "DEMO_CONFIRM", status: "BOT" }, [demoConfirmMessage(nextDraft)]));
    }

    case "DEMO_CONFIRM": {
      const choice = buttonChoice(input, "DEMO_CONFIRM");
      const demo = demoFromDraft(draft);
      if (choice === "SEND" && demo) {
        return withWarning(
          result(
            { draft: {}, state: "DONE", status: "WAITING_AGENT" },
            [
              {
                body: demo.slotClassId
                  ? `Thank you, ${demo.parentName}! Your free demo request ${SUPPORT_TICKET_REFERENCE_PLACEHOLDER} is in. One moment while we book your place.`
                  : `Thank you, ${demo.parentName}! Your free demo request ${SUPPORT_TICKET_REFERENCE_PLACEHOLDER} is with our team. We'll message you here soon to fix the time. Reply MENU if you need anything else.`,
                kind: "text"
              }
            ],
            [
              {
                category: "COURSE",
                demo,
                details: supportDemoSummary(demo),
                handoff: false,
                kind: "TICKET",
                studentName: demo.studentName
              }
            ]
          )
        );
      }
      if (choice === "EDIT" || (choice === "SEND" && !demo)) {
        return withWarning(startDemo());
      }
      if (choice === "CANCEL") {
        return withWarning(
          result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu("Cancelled. Nothing was sent to our team.", menuOf(ctx))])
        );
      }
      return withWarning(invalid(current, "Please tap Book demo, Edit details or Cancel.", demoConfirmMessage(draft)));
    }

    case "ASK_STUDENT": {
      const name = input.kind === "text" ? input.text.trim().replace(/\s+/g, " ") : "";
      const { max, min } = SUPPORT_INPUT_LIMITS.studentName;
      if (name.length < min || name.length > max) {
        return withWarning(
          invalid(current, typed(`Please reply with the student's name (${min}–${max} characters).`), questionFor("ASK_STUDENT", draft, ctx))
        );
      }
      const nextDraft: SupportDraft = { ...draft, invalidCount: 0, studentName: name };
      return withWarning(result({ draft: nextDraft, state: "ASK_DETAILS", status: "BOT" }, [questionFor("ASK_DETAILS", nextDraft, ctx)]));
    }

    case "ASK_DETAILS": {
      const details = input.kind === "text" ? input.text.trim() : "";
      const { max, min } = SUPPORT_INPUT_LIMITS.details;
      if (details.length < min) {
        return withWarning(invalid(current, typed("Please tell us a little more."), questionFor("ASK_DETAILS", draft, ctx)));
      }
      if (details.length > max) {
        return withWarning(
          invalid(current, `That's a bit long: please keep it under ${max} characters.`, questionFor("ASK_DETAILS", draft, ctx))
        );
      }
      const nextDraft: SupportDraft = { ...draft, details, invalidCount: 0 };
      return withWarning(result({ draft: nextDraft, state: "CONFIRM", status: "BOT" }, [confirmMessage(nextDraft)]));
    }

    case "CONFIRM": {
      const choice = buttonChoice(input, "CONFIRM");
      if (choice === "SEND") {
        return withWarning(
          result(
            { draft: {}, state: "DONE", status: "WAITING_AGENT" },
            [
              {
                body: `Thank you! Your request ${SUPPORT_TICKET_REFERENCE_PLACEHOLDER} is with our team, and we'll reply here. Reply MENU if you need anything else.`,
                kind: "text"
              }
            ],
            [ticketAction(draft, false)]
          )
        );
      }
      if (choice === "EDIT") {
        const nextDraft: SupportDraft = { ...draft, details: undefined, invalidCount: 0 };
        return withWarning(result({ draft: nextDraft, state: "ASK_DETAILS", status: "BOT" }, [questionFor("ASK_DETAILS", nextDraft, ctx)]));
      }
      if (choice === "CANCEL") {
        return withWarning(
          result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu("Cancelled. Nothing was sent to our team.", menuOf(ctx))])
        );
      }
      return withWarning(invalid(current, "Please tap Send, Edit details or Cancel.", confirmMessage(draft)));
    }

    case "RESUME_PROMPT": {
      const choice = buttonChoice(input, "RESUME_PROMPT");
      if (choice === "CONTINUE" && draft.resumeState && IN_FORM.has(draft.resumeState)) {
        const state = draft.resumeState;
        const nextDraft: SupportDraft = { ...draft, invalidCount: 0, resumeState: undefined };
        return withWarning(result({ draft: nextDraft, state, status: "BOT" }, [questionFor(state, nextDraft, ctx)]));
      }
      if (choice === "RESTART" || choice === "CONTINUE") {
        return withWarning(result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu(undefined, menuOf(ctx))]));
      }
      return withWarning(invalid(current, "Please tap Continue or Start again.", questionFor("RESUME_PROMPT", draft, ctx)));
    }

    default:
      return withWarning(result({ draft: {}, state: "MAIN_MENU", status: "BOT" }, [supportMainMenu(undefined, menuOf(ctx))]));
  }
}

/** The plain-text form of a reply, as shown in the staff transcript. */
export function supportReplyText(reply: SupportReply): string {
  if (reply.kind === "text") return reply.body;
  if (reply.kind === "buttons") return `${reply.body}\n[${reply.buttons.map((button) => button.title).join("] [")}]`;
  return `${reply.body}\n${reply.rows.map((row, index) => `${index + 1}. ${row.title}`).join("\n")}`;
}
