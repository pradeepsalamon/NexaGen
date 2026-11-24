import { DEFAULT_SUPPORT_OUT_OF_HOURS_MESSAGE } from "./support-hours";
import {
  SUPPORT_TICKET_REFERENCE_PLACEHOLDER,
  supportMenuEntries,
  supportNudgeMessage,
  transitionSupport,
  type SupportConversationSnapshot,
  type SupportReply,
  type SupportTransitionContext
} from "./support-flows";

// ──────────────────────────────────────────────────────────────
// The bot's built-in messages, shown to admins (Support → Settings → "Bot messages").
//
// Nothing here is a copy of the wording: every reply comes from running
// `transitionSupport` itself through sample conversations, so the page can never
// drift from what parents receive. A new step or wording shows up by itself.
// ──────────────────────────────────────────────────────────────

/** A sample reference in place of `{{ticket.reference}}` (support-tickets.service.ts format). */
const SAMPLE_REFERENCE = "NXS-2026-000123";

/** What the parent sends in a sample conversation. */
export type SupportBotScriptMessage =
  | { kind: "text"; text: string }
  /** A tap on a button or list row; `text` is the label the parent sees. */
  | { kind: "tap"; text: string };

export interface SupportBotScriptStep {
  /** The parent's message; absent when the bot speaks first (a follow-up). */
  sent?: SupportBotScriptMessage;
  /** Shown above the step, e.g. "After 30 quiet minutes". */
  note?: string;
  replies: SupportReply[];
}

export interface SupportBotScriptSection {
  id: string;
  title: string;
  description: string;
  steps: SupportBotScriptStep[];
}

type Move =
  | { text: string; idle?: boolean; note?: string }
  | { tap: string; note?: string };

const START: SupportConversationSnapshot = { draft: {}, state: "START", status: "BOT" };

function withReference(reply: SupportReply): SupportReply {
  return { ...reply, body: reply.body.split(SUPPORT_TICKET_REFERENCE_PLACEHOLDER).join(SAMPLE_REFERENCE) };
}

/** The label of the button or row `id`, from the newest message that has it (old buttons stay tappable). */
function labelOf(replies: SupportReply[], id: string): string {
  for (const reply of [...replies].reverse()) {
    if (reply.kind === "buttons") {
      const button = reply.buttons.find((candidate) => candidate.id === id);
      if (button) return button.title;
    }
    if (reply.kind === "list") {
      const row = reply.rows.find((candidate) => candidate.id === id);
      if (row) return row.title;
    }
  }
  return id;
}

/** Plays `moves` from `from`, recording each message and the bot's answer. */
function play(ctx: SupportTransitionContext, from: SupportConversationSnapshot, moves: Move[], shown: SupportReply[] = []) {
  let snapshot = from;
  let onScreen = shown;
  const steps: SupportBotScriptStep[] = [];
  for (const move of moves) {
    const isTap = "tap" in move;
    const input = isTap ? ({ id: move.tap, kind: "reply" } as const) : ({ kind: "text", text: move.text } as const);
    const next = transitionSupport(snapshot, input, { ...ctx, idle: !isTap && Boolean(move.idle) });
    const replies = next.replies.map(withReference);
    steps.push({
      ...(move.note ? { note: move.note } : {}),
      replies,
      sent: isTap ? { kind: "tap", text: labelOf(onScreen, move.tap) } : { kind: "text", text: move.text }
    });
    snapshot = { draft: next.draft, state: next.state, status: next.status };
    onScreen = [...onScreen, ...replies];
  }
  return { snapshot, onScreen, steps };
}

/**
 * Sample conversations covering every built-in message, in the academy's own
 * menu and name. `ctx.answers` decides whether the course menu lists questions;
 * pass none to show what a parent sees before any saved answer exists.
 */
export function supportBotScript(
  ctx: Pick<SupportTransitionContext, "academyName" | "answers" | "menu" | "privacyUrl">,
  options: { outOfHoursMessage?: string | null } = {}
): SupportBotScriptSection[] {
  const menu = ctx.menu ?? supportMenuEntries(null);
  const base: SupportTransitionContext = { ...ctx, demoSlots: [], idle: false, menu, redacted: false };
  const menuRow = (category: string) => menu.find((entry) => entry.category === category)?.row.id ?? "";
  const sections: SupportBotScriptSection[] = [];

  // First contact and the main menu.
  const first = play(base, START, [{ text: "Hi" }]);
  sections.push({
    description: "The first message from a new number, and the main menu (its options are set above).",
    id: "welcome",
    steps: first.steps,
    title: "Welcome and main menu"
  });

  // Courses and the free demo, start to finish.
  const demo = play(base, first.snapshot, [
    { tap: menuRow("COURSE") },
    { tap: "course.demo" },
    { text: "Aarav" },
    { text: "9" },
    { tap: "demo.level.beginner" },
    { text: "Priya" },
    { text: "Saturday morning" },
    { tap: "confirm.send" }
  ], first.onScreen);
  sections.push({
    description:
      "Questions about courses, then booking a free demo class. With saved answers, the course menu lists them first. When demo classes are scheduled, the bot offers their times as a list.",
    id: "demo",
    steps: demo.steps,
    title: "Courses and free demo"
  });

  // Slips during the demo form.
  const askingName: SupportConversationSnapshot = { draft: { category: "COURSE" }, state: "DEMO_STUDENT", status: "BOT" };
  const slips = play(base, askingName, [
    { note: "A one-letter name", text: "A" },
    { note: "A question instead of a name", text: "fees" },
    { note: "A button from an earlier message", tap: "confirm.send" }
  ], demo.steps.find((step) => step.replies.some((reply) => reply.kind === "buttons" && reply.buttons.some((b) => b.id === "confirm.send")))?.replies);
  const age = play(base, { draft: { category: "COURSE", studentName: "Aarav" }, state: "DEMO_AGE", status: "BOT" }, [
    { note: "An age that isn't a number", text: "nine" }
  ]);
  sections.push({
    description: "What the bot says when an answer can't be used. After three in a row it also offers a person.",
    id: "slips",
    steps: [...slips.steps, ...age.steps],
    title: "When a reply doesn't fit"
  });

  // The help forms: one per menu option that collects details for the team.
  for (const category of ["REFUND", "CLASS", "PAYMENT", "TECH"] as const) {
    const entry = menu.find((candidate) => candidate.category === category);
    if (!entry) continue; // switched off in this academy's menu
    const run = play(base, first.snapshot, [
      { tap: entry.row.id },
      { text: "Aarav" },
      { text: "Example details from the parent." },
      { tap: "confirm.send" }
    ], first.onScreen);
    sections.push({
      description: "The form behind this menu option. Sending it creates a request for your team in WhatsApp support.",
      id: `form-${category.toLowerCase()}`,
      steps: run.steps,
      title: entry.row.title
    });
  }
  const team = menu.find((candidate) => candidate.category === "OTHER");
  if (team) {
    sections.push({
      description: "Hands the chat to your team at once; the bot stays quiet until the parent sends MENU.",
      id: "form-other",
      steps: play(base, first.snapshot, [{ tap: team.row.id }], first.onScreen).steps,
      title: team.row.title
    });
  }

  // Questions the bot has no answer for.
  const courseMenu: SupportConversationSnapshot = { draft: { category: "COURSE" }, state: "COURSE_MENU", status: "BOT" };
  const unknown = play({ ...base, answers: [] }, courseMenu, [{ text: "Do you teach in Tamil?" }]);
  sections.push({
    description:
      "A question no saved answer matches. It is listed under Insights so you can add an answer. A close spelling of a saved answer's keyword gets \"Did you mean …?\" instead.",
    id: "unknown",
    steps: unknown.steps,
    title: "A question without an answer"
  });

  // Words that work everywhere.
  const midForm: SupportConversationSnapshot = { draft: { category: "COURSE", studentName: "Aarav" }, state: "DEMO_AGE", status: "BOT" };
  const commands = [
    ...play(base, midForm, [{ text: "BACK" }]).steps,
    ...play(base, midForm, [{ text: "CANCEL" }]).steps,
    ...play(base, midForm, [{ text: "AGENT" }]).steps,
    ...play(base, { draft: {}, state: "MAIN_MENU", status: "BOT" }, [{ text: "STOP" }, { text: "START" }]).steps
  ];
  sections.push({
    description: "BACK, CANCEL, MENU, AGENT, STOP and START work at any step. AGENT hands the chat to your team and the bot goes quiet.",
    id: "commands",
    steps: commands,
    title: "Words that work anywhere"
  });

  // Coming back after a break.
  const resume = play(base, midForm, [{ idle: true, note: "After 30 quiet minutes in a form", text: "hello" }]);
  sections.push({
    description: "A parent who comes back to a half-finished form chooses to continue or start again.",
    id: "resume",
    steps: resume.steps,
    title: "Coming back after a break"
  });

  // Messages the bot sends on its own.
  sections.push({
    description: "Sent without the parent writing first: the follow-up timing and team hours are set above.",
    id: "later",
    steps: [
      { note: "Follow-up to a parent who asked about classes but didn't book", replies: [supportNudgeMessage()] },
      {
        note: "A message while your team is away (only when team hours are on)",
        replies: [{ body: options.outOfHoursMessage?.trim() || DEFAULT_SUPPORT_OUT_OF_HOURS_MESSAGE, kind: "text" }]
      }
    ],
    title: "Messages the bot sends on its own"
  });

  return sections;
}
