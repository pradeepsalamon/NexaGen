import {
  supportLinkCodeIn,
  DEFAULT_SUPPORT_MENU,
  supportMainMenu,
  supportMenuEntries,
  isSupportQuestionWorthListing,
  matchSupportAnswer,
  normalizeSupportKeywords,
  redactSupportText,
  suggestSupportAnswer,
  supportEditDistance,
  SUPPORT_TICKET_REFERENCE_PLACEHOLDER,
  supportNudgeMessage,
  supportReplyText,
  transitionSupport,
  type SupportBotAnswer,
  type SupportConversationSnapshot,
  type SupportInput,
  type SupportTransitionContext
} from "@nexa-chess/types";

// The bot's pure decision function (packages/types/src/support-flows.ts).

const ctx: SupportTransitionContext = {
  academyName: "Nexa",
  answers: [],
  idle: false,
  privacyUrl: "https://nexa.test/privacy",
  redacted: false
};

const FEES: SupportBotAnswer = {
  body: "Group classes are ₹2,000 a month.",
  description: "Monthly fees by format",
  id: "fees",
  keywords: ["fee", "price", "cost"],
  title: "Fees"
};
const TIMINGS: SupportBotAnswer = {
  body: "Batches run weekday evenings and weekend mornings.",
  description: null,
  id: "timings",
  keywords: ["timing", "batch time", "when are classes"],
  title: "Batch timings"
};
const withAnswers: SupportTransitionContext = { ...ctx, answers: [FEES, TIMINGS] };
const text = (value: string): SupportInput => ({ kind: "text", text: value });
const tap = (id: string): SupportInput => ({ id, kind: "reply" });
const at = (state: SupportConversationSnapshot["state"], draft = {}, status: SupportConversationSnapshot["status"] = "BOT") => ({
  draft,
  state,
  status
});

function run(snapshot: SupportConversationSnapshot, inputs: SupportInput[], context = ctx) {
  let current = snapshot;
  let last = transitionSupport(current, inputs[0], context);
  for (const input of inputs.slice(1)) {
    current = { draft: last.draft, state: last.state, status: last.status };
    last = transitionSupport(current, input, context);
  }
  return last;
}

describe("transitionSupport", () => {
  it("greets a new conversation with the privacy link and the menu, whatever was said", () => {
    const next = transitionSupport(at("START"), text("I want a refund"), ctx);
    expect(next.state).toBe("MAIN_MENU");
    expect(next.replies).toHaveLength(1);
    expect(next.replies[0]).toMatchObject({ kind: "list" });
    expect(next.replies[0].body).toContain("https://nexa.test/privacy");
    expect(next.replies[0].body).toContain("Nexa");
    expect(next.actions).toEqual([]);
  });

  it("walks a refund request from the menu to a ticket", () => {
    const next = run(at("MAIN_MENU"), [
      tap("menu.refund"),
      text("Asha Menon"),
      text("March batch, paid on 2 March, ref pay_123, the batch was cancelled"),
      tap("confirm.send")
    ]);
    expect(next.state).toBe("DONE");
    expect(next.status).toBe("WAITING_AGENT");
    expect(next.actions).toEqual([
      {
        category: "REFUND",
        details: "March batch, paid on 2 March, ref pay_123, the batch was cancelled",
        handoff: false,
        kind: "TICKET",
        studentName: "Asha Menon"
      }
    ]);
    expect(next.replies[0].body).toContain(SUPPORT_TICKET_REFERENCE_PLACEHOLDER);
    expect(next.draft).toEqual({});
  });

  it("reads menu numbers, titles and keywords as well as taps", () => {
    expect(transitionSupport(at("MAIN_MENU"), text("3"), ctx).draft.category).toBe("CLASS");
    expect(transitionSupport(at("MAIN_MENU"), text("Payment issue"), ctx).draft.category).toBe("PAYMENT");
    expect(transitionSupport(at("MAIN_MENU"), text("I was charged twice"), ctx).draft.category).toBe("PAYMENT");
    expect(transitionSupport(at("MAIN_MENU"), text("refund please"), ctx).draft.category).toBe("REFUND");
  });

  it("hands off straight away for 'Talk to our team' and for AGENT anywhere", () => {
    const fromMenu = transitionSupport(at("MAIN_MENU"), tap("menu.human"), ctx);
    expect(fromMenu.status).toBe("WAITING_AGENT");
    expect(fromMenu.actions[0]).toMatchObject({ category: "OTHER", handoff: true, kind: "TICKET" });

    const midForm = transitionSupport(at("ASK_DETAILS", { category: "TECH", studentName: "Ravi" }), text("agent"), ctx);
    expect(midForm.actions[0]).toMatchObject({ category: "TECH", handoff: true, studentName: "Ravi" });
    expect(midForm.replies[0].body).toContain(SUPPORT_TICKET_REFERENCE_PLACEHOLDER);
  });

  it("re-asks after a reply it can't use, and offers a person after three", () => {
    let next = transitionSupport(at("MAIN_MENU"), text("blah"), ctx);
    expect(next.state).toBe("MAIN_MENU");
    expect(next.draft.invalidCount).toBe(1);
    expect(next.replies[0].body).not.toContain("AGENT");
    next = run(at("MAIN_MENU"), [text("blah"), text("blah"), text("blah")]);
    expect(next.draft.invalidCount).toBe(3);
    expect(next.replies[0].body).toContain("reply AGENT");
  });

  it("validates the student's name and the details length", () => {
    const shortName = transitionSupport(at("ASK_STUDENT", { category: "CLASS" }), text("A"), ctx);
    expect(shortName.state).toBe("ASK_STUDENT");
    const shortDetails = transitionSupport(at("ASK_DETAILS", { category: "CLASS", studentName: "Asha" }), text("hi"), ctx);
    expect(shortDetails.state).toBe("ASK_DETAILS");
    const longDetails = transitionSupport(at("ASK_DETAILS", { category: "CLASS", studentName: "Asha" }), text("x".repeat(1501)), ctx);
    expect(longDetails.state).toBe("ASK_DETAILS");
  });

  it("goes back one question, cancels without a ticket, and edits the details", () => {
    expect(transitionSupport(at("ASK_DETAILS", { category: "CLASS", studentName: "Asha" }), text("back"), ctx).state).toBe("ASK_STUDENT");
    const cancelled = transitionSupport(at("CONFIRM", { category: "CLASS", details: "x", studentName: "Asha" }), text("cancel"), ctx);
    expect(cancelled).toMatchObject({ actions: [], draft: {}, state: "MAIN_MENU" });
    expect(cancelled.replies[0].body).toContain("Nothing was sent");
    const edit = transitionSupport(at("CONFIRM", { category: "CLASS", details: "x", studentName: "Asha" }), tap("confirm.edit"), ctx);
    expect(edit).toMatchObject({ draft: { category: "CLASS", studentName: "Asha" }, state: "ASK_DETAILS" });
  });

  it("offers to continue after a pause mid-form, and picks up where it stopped", () => {
    const draft = { category: "REFUND" as const, studentName: "Asha" };
    const prompt = transitionSupport(at("ASK_DETAILS", draft), text("hello again"), { ...ctx, idle: true });
    expect(prompt.state).toBe("RESUME_PROMPT");
    expect(prompt.replies[0]).toMatchObject({ kind: "buttons" });

    const resumed = transitionSupport({ draft: prompt.draft, state: prompt.state, status: "BOT" }, tap("resume.continue"), ctx);
    expect(resumed).toMatchObject({ draft: { category: "REFUND", studentName: "Asha" }, state: "ASK_DETAILS" });
    const restarted = transitionSupport({ draft: prompt.draft, state: prompt.state, status: "BOT" }, tap("resume.restart"), ctx);
    expect(restarted).toMatchObject({ draft: {}, state: "MAIN_MENU" });
  });

  it("stays silent while staff own the conversation, except for STOP", () => {
    const agent = at("DONE", {}, "AGENT");
    expect(transitionSupport(agent, text("hello?"), ctx).replies).toEqual([]);
    expect(transitionSupport(agent, text("menu"), ctx)).toMatchObject({ replies: [], status: "AGENT" });
    const stop = transitionSupport(agent, text("STOP"), ctx);
    expect(stop.actions).toEqual([{ kind: "OPT_OUT" }]);
    expect(stop.status).toBe("AGENT");
  });

  it("while waiting for staff, only an explicit MENU brings the bot back", () => {
    const waiting = at("DONE", {}, "WAITING_AGENT");
    expect(transitionSupport(waiting, text("hi"), ctx)).toMatchObject({ replies: [], status: "WAITING_AGENT" });
    expect(transitionSupport(at("MAIN_MENU", { invalidCount: 2 }), text("Hello!"), ctx)).toMatchObject({ draft: {}, state: "MAIN_MENU" });
    expect(transitionSupport(waiting, text("Menu"), ctx)).toMatchObject({ state: "MAIN_MENU", status: "BOT" });
  });

  it("opts out and back in", () => {
    expect(transitionSupport(at("MAIN_MENU"), text("stop"), ctx).actions).toEqual([{ kind: "OPT_OUT" }]);
    expect(transitionSupport(at("MAIN_MENU"), text("START"), ctx).actions).toEqual([{ kind: "OPT_IN" }]);
  });

  it("warns when a card number or code was removed, and asks again for media", () => {
    const warned = transitionSupport(at("MAIN_MENU"), text("1"), { ...ctx, redacted: true });
    expect(warned.replies[0].body).toContain("removed a card number");
    const media = transitionSupport(at("ASK_STUDENT", { category: "CLASS" }), { kind: "unsupported" }, ctx);
    expect(media.state).toBe("ASK_STUDENT");
    expect(media.replies[0].body).toContain("only read text");
    // A kept image or PDF: thanked for, never read, and the same question again.
    const file = transitionSupport(at("ASK_STUDENT", { category: "PAYMENT" }), { kind: "media" }, ctx);
    expect(file).toMatchObject({ actions: [], state: "ASK_STUDENT" });
    expect(file.replies[0].body).toContain("kept your file for our team");
    expect(transitionSupport(at("DONE", {}, "WAITING_AGENT"), { kind: "media" }, ctx).replies).toEqual([]);
  });

  it("flattens interactive replies for the transcript", () => {
    const menu = transitionSupport(at("START"), text("hi"), ctx).replies[0];
    expect(supportReplyText(menu)).toContain("1. Courses & free demo");
    expect(supportReplyText({ body: "Send?", buttons: [{ id: "a", title: "Yes" }], kind: "buttons" })).toBe("Send?\n[Yes]");
  });
});

describe("course enquiries (saved answers)", () => {
  it("answers a typed question at once, even as the first message", () => {
    const next = transitionSupport(at("START"), text("Hi, what are your fees?"), withAnswers);
    expect(next.state).toBe("COURSE_MENU");
    expect(next.replies.map((reply) => reply.body)).toEqual([
      expect.stringContaining("https://nexa.test/privacy"),
      FEES.body,
      expect.stringContaining("Anything else?")
    ]);
    expect(next.replies[2]).toMatchObject({ kind: "buttons" });
    expect(next.actions).toEqual([]);
  });

  it("answers from the main menu before guessing a category from words", () => {
    // "fee" would otherwise pick Courses; "batch time" beats nothing.
    expect(transitionSupport(at("MAIN_MENU"), text("fees?"), withAnswers).replies[0].body).toBe(FEES.body);
    expect(transitionSupport(at("MAIN_MENU"), text("what is the batch time"), withAnswers).replies[0].body).toBe(TIMINGS.body);
    // An exact menu pick still wins.
    expect(transitionSupport(at("MAIN_MENU"), text("3"), withAnswers).draft.category).toBe("CLASS");
  });

  it("opens the course menu with the answers, a demo row and a person row", () => {
    const next = transitionSupport(at("MAIN_MENU"), tap("menu.course"), withAnswers);
    expect(next.state).toBe("COURSE_MENU");
    const menu = next.replies[0];
    expect(menu.kind).toBe("list");
    if (menu.kind !== "list") throw new Error("expected a list");
    expect(menu.rows.map((row) => row.id)).toEqual(["answer.fees", "answer.timings", "course.demo", "course.human"]);
    expect(menu.rows[0]).toMatchObject({ description: "Monthly fees by format", title: "Fees" });
  });

  it("answers taps, numbers and titles in the course menu", () => {
    const course = at("COURSE_MENU", { category: "COURSE" });
    expect(transitionSupport(course, tap("answer.timings"), withAnswers).replies[0].body).toBe(TIMINGS.body);
    expect(transitionSupport(course, text("1"), withAnswers).replies[0].body).toBe(FEES.body);
    expect(transitionSupport(course, text("batch timings"), withAnswers).replies[0].body).toBe(TIMINGS.body);
    expect(transitionSupport(course, text("3"), withAnswers).state).toBe("DEMO_STUDENT");
    expect(transitionSupport(course, text("4"), withAnswers)).toMatchObject({ status: "WAITING_AGENT" });
  });

  it("forwards a question it can't answer to the team on AGENT, and never invents one", () => {
    const course = at("COURSE_MENU", { category: "COURSE" });
    const unknown = transitionSupport(course, text("do you teach in Tamil?"), withAnswers);
    expect(unknown.state).toBe("COURSE_MENU");
    expect(unknown.replies[0].body).toContain("Reply AGENT");
    expect(unknown.actions).toEqual([{ kind: "UNANSWERED", text: "do you teach in Tamil?" }]);
    const handoff = transitionSupport(course, tap("course.human"), withAnswers);
    expect(handoff.actions[0]).toMatchObject({ category: "COURSE", handoff: true, kind: "TICKET" });
  });

  it("works with no saved answers: the menu offers the demo and a person", () => {
    const next = transitionSupport(at("MAIN_MENU"), tap("menu.course"), ctx);
    const menu = next.replies[0];
    if (menu.kind !== "list") throw new Error("expected a list");
    expect(menu.rows.map((row) => row.id)).toEqual(["course.demo", "course.human"]);
    expect(transitionSupport(at("COURSE_MENU", { category: "COURSE" }), text("1"), ctx).state).toBe("DEMO_STUDENT");
  });

  it("moves to another category's form when the words say so", () => {
    const next = transitionSupport(at("COURSE_MENU", { category: "COURSE" }), text("I want a refund"), withAnswers);
    expect(next).toMatchObject({ draft: { category: "REFUND" }, state: "ASK_STUDENT" });
  });
});

describe("free demo booking", () => {
  it("collects the lead's fields and ends in a ticket with the demo", () => {
    const next = run(
      at("COURSE_MENU", { category: "COURSE" }),
      [tap("course.demo"), text("Asha Menon"), text("She is 9"), tap("demo.level.intermediate"), text("Priya Menon"), text("Saturday morning"), tap("confirm.send")],
      withAnswers
    );
    expect(next).toMatchObject({ draft: {}, state: "DONE", status: "WAITING_AGENT" });
    expect(next.actions).toEqual([
      {
        category: "COURSE",
        demo: { level: "intermediate", parentName: "Priya Menon", preferredTime: "Saturday morning", studentAge: 9, studentName: "Asha Menon" },
        details: expect.stringContaining("Free demo class request"),
        handoff: false,
        kind: "TICKET",
        studentName: "Asha Menon"
      }
    ]);
    expect(next.replies[0].body).toContain("Thank you, Priya Menon!");
    expect(next.replies[0].body).toContain(SUPPORT_TICKET_REFERENCE_PLACEHOLDER);
  });

  it("starts from typed words in the course menu", () => {
    expect(transitionSupport(at("COURSE_MENU", { category: "COURSE" }), text("book a demo please"), ctx).state).toBe("DEMO_STUDENT");
  });

  it("validates the age and the level, and reads typed levels", () => {
    const age = at("DEMO_AGE", { category: "COURSE", studentName: "Asha" });
    expect(transitionSupport(age, text("nine"), ctx).state).toBe("DEMO_AGE");
    expect(transitionSupport(age, text("2"), ctx).state).toBe("DEMO_AGE");
    expect(transitionSupport(age, text("12 years"), ctx)).toMatchObject({ draft: { studentAge: 12 }, state: "DEMO_LEVEL" });
    const level = at("DEMO_LEVEL", { category: "COURSE", studentAge: 9, studentName: "Asha" });
    expect(transitionSupport(level, text("she plays tournaments"), ctx).draft.level).toBe("advanced");
    expect(transitionSupport(level, text("1"), ctx).draft.level).toBe("beginner");
    expect(transitionSupport(level, text("maybe"), ctx).state).toBe("DEMO_LEVEL");
  });

  it("goes back a step, edits from the start, and offers to resume after a pause", () => {
    const filled = { category: "COURSE" as const, level: "beginner" as const, parentName: "Priya", preferredTime: "Sat", studentAge: 9, studentName: "Asha" };
    expect(transitionSupport(at("DEMO_TIME", filled), text("back"), ctx).state).toBe("DEMO_PARENT");
    expect(transitionSupport(at("DEMO_STUDENT", { category: "COURSE" }), text("back"), ctx).state).toBe("COURSE_MENU");
    expect(transitionSupport(at("DEMO_CONFIRM", filled), tap("confirm.edit"), ctx)).toMatchObject({ draft: { category: "COURSE" }, state: "DEMO_STUDENT" });
    const prompt = transitionSupport(at("DEMO_PARENT", filled), text("hello"), { ...ctx, idle: true });
    expect(prompt.state).toBe("RESUME_PROMPT");
    expect(prompt.replies[0].body).toContain("booking a free demo class");
  });

  describe("with the academy's real demo times", () => {
    const slots: SupportTransitionContext = {
      ...ctx,
      demoSlots: [
        { description: "Chess basics", id: "class_tue", title: "Tue 18 Nov, 5:00 pm" },
        { id: "class_sat", title: "Sat 22 Nov, 10:00 am" }
      ]
    };
    const filled = { category: "COURSE" as const, level: "beginner" as const, parentName: "Priya", studentAge: 9, studentName: "Asha" };

    it("offers the times as a list with Another time, and a tap books that class", () => {
      const ask = transitionSupport(at("DEMO_PARENT", { ...filled, parentName: undefined }), text("Priya"), slots);
      expect(ask.state).toBe("DEMO_TIME");
      expect(ask.replies[0]).toMatchObject({ kind: "list" });
      const rows = ask.replies[0].kind === "list" ? ask.replies[0].rows : [];
      expect(rows.map((row) => row.id)).toEqual(["demo.slot.class_tue", "demo.slot.class_sat", "demo.slot.other"]);

      const confirm = transitionSupport(at("DEMO_TIME", filled), tap("demo.slot.class_tue"), slots);
      expect(confirm).toMatchObject({ draft: { preferredTime: "Tue 18 Nov, 5:00 pm", slotId: "class_tue" }, state: "DEMO_CONFIRM" });
      expect(confirm.replies[0].body).toContain("Class: Tue 18 Nov, 5:00 pm");

      const sent = transitionSupport(at("DEMO_CONFIRM", confirm.draft), tap("confirm.send"), slots);
      expect(sent.actions[0]).toMatchObject({ demo: { preferredTime: "Tue 18 Nov, 5:00 pm", slotClassId: "class_tue" }, kind: "TICKET" });
      // Booked is said only by the API, after the booking succeeds.
      expect(sent.replies[0].body).not.toMatch(/booked/i);
    });

    it("asks in words after Another time, and takes typed words as a preferred time", () => {
      const other = transitionSupport(at("DEMO_TIME", filled), tap("demo.slot.other"), slots);
      expect(other).toMatchObject({ draft: { askedOwnTime: true }, state: "DEMO_TIME" });
      expect(other.replies[0].kind).toBe("text");
      const typed = transitionSupport(at("DEMO_TIME", filled), text("Sunday evening"), slots);
      expect(typed).toMatchObject({ draft: { preferredTime: "Sunday evening" }, state: "DEMO_CONFIRM" });
      expect(typed.draft.slotId).toBeUndefined();
    });

    it("refuses a time from an old list and shows the current ones", () => {
      const stale = transitionSupport(at("DEMO_TIME", filled), tap("demo.slot.class_gone"), slots);
      expect(stale.state).toBe("DEMO_TIME");
      expect(stale.replies.map((reply) => reply.body).join(" ")).toContain("no longer available");
      expect(stale.replies.at(-1)?.kind).toBe("list");
    });

    it("asks in words when the academy has no upcoming demo times", () => {
      const ask = transitionSupport(at("DEMO_PARENT", { ...filled, parentName: undefined }), text("Priya"), { ...ctx, demoSlots: [] });
      expect(ask.replies[0].kind).toBe("text");
    });
  });

  it("never books with a half-filled draft", () => {
    const next = transitionSupport(at("DEMO_CONFIRM", { category: "COURSE", studentName: "Asha" }), tap("confirm.send"), ctx);
    expect(next.actions).toEqual([]);
    expect(next.state).toBe("DEMO_STUDENT");
  });
});

describe("the follow-up nudge", () => {
  it("offers a demo, a question or no thanks, and each choice works from the course menu", () => {
    const nudge = supportNudgeMessage();
    if (nudge.kind !== "buttons") throw new Error("expected buttons");
    expect(nudge.buttons.map((button) => button.id)).toEqual(["course.demo", "course.more", "nudge.no"]);
    const course = at("COURSE_MENU", { category: "COURSE" });
    expect(transitionSupport(course, tap("course.demo"), withAnswers).state).toBe("DEMO_STUDENT");
    expect(transitionSupport(course, tap("course.more"), withAnswers).replies[0]).toMatchObject({ kind: "list" });
    expect(transitionSupport(course, tap("nudge.no"), withAnswers)).toMatchObject({ actions: [], state: "MAIN_MENU" });
  });

  it("starts the demo when the nudge is tapped after the conversation expired", () => {
    expect(transitionSupport(at("START"), tap("course.demo"), ctx).state).toBe("DEMO_STUDENT");
  });
});

describe("matchSupportAnswer", () => {
  it("matches whole words and phrases, plurals included, longest keyword first", () => {
    expect(matchSupportAnswer("What are the FEES?", [FEES, TIMINGS])?.id).toBe("fees");
    expect(matchSupportAnswer("coffee", [FEES])).toBeNull();
    expect(matchSupportAnswer("when are classes held", [FEES, TIMINGS])?.id).toBe("timings");
    const both = matchSupportAnswer("cost of the batch time slot", [FEES, TIMINGS]);
    expect(both?.id).toBe("timings");
    expect(matchSupportAnswer("", [FEES])).toBeNull();
  });

  it("normalizes keywords: lower case, trimmed, no blanks or repeats", () => {
    expect(normalizeSupportKeywords([" Fees ", "fees", "", "Batch  Time"])).toEqual(["fees", "batch time"]);
  });
});

describe("spelling slips", () => {
  it("measures edit distance with swapped letters as one slip", () => {
    expect(supportEditDistance("fess", "fees")).toBe(1);
    expect(supportEditDistance("timngs", "timings")).toBe(1);
    expect(supportEditDistance("abc", "xyz", 1)).toBe(2); // stops early: anything above max
  });

  it("suggests the answer a misspelled word means, keeping the first letter and a small slip", () => {
    expect(suggestSupportAnswer("fess?", [FEES, TIMINGS])?.id).toBe("fees");
    expect(suggestSupportAnswer("prise of classes", [FEES, TIMINGS])?.id).toBe("fees");
    expect(suggestSupportAnswer("batch timngs", [FEES, TIMINGS])?.id).toBe("timings");
    expect(suggestSupportAnswer("what is the bach time", [FEES, TIMINGS])?.id).toBe("timings");
  });

  it("does not read everyday words or short words as slips", () => {
    expect(suggestSupportAnswer("I feel good", [FEES])).toBeNull(); // "feel" is a word, not "fees"
    expect(suggestSupportAnswer("free demo", [FEES])).toBeNull();
    expect(suggestSupportAnswer("ok", [FEES])).toBeNull();
    expect(suggestSupportAnswer("rees", [FEES])).toBeNull(); // first letter differs
  });

  it("asks 'Did you mean …?' instead of answering a misspelled question", () => {
    const next = transitionSupport(at("MAIN_MENU"), text("fess?"), withAnswers);
    expect(next).toMatchObject({ draft: { suggestion: { answerId: "fees", question: "fess?" } }, state: "COURSE_MENU" });
    expect(next.replies[0]).toMatchObject({ body: 'Did you mean "Fees"?', kind: "buttons" });
    expect(next.actions).toEqual([]);

    const draft = next.draft;
    expect(transitionSupport(at("COURSE_MENU", draft), tap("answer.fees"), withAnswers).replies[0].body).toBe(FEES.body);
    expect(transitionSupport(at("COURSE_MENU", draft), text("yes"), withAnswers).replies[0].body).toBe(FEES.body);
    const no = transitionSupport(at("COURSE_MENU", draft), tap("suggest.no"), withAnswers);
    expect(no.actions).toEqual([{ kind: "UNANSWERED", text: "fess?" }]);
    expect(no.draft).toEqual({ category: "COURSE" });
    expect(no.replies[0].body).toContain("Reply AGENT");
  });

  it("greets and asks when the first message has a slip", () => {
    const next = transitionSupport(at("START"), text("hi, fess for group class?"), withAnswers);
    expect(next.replies.map((reply) => reply.body)).toEqual([expect.stringContaining("privacy"), 'Did you mean "Fees"?']);
  });
});

describe("questions for the admins' list", () => {
  it("lists a course question no answer matched", () => {
    const next = transitionSupport(at("COURSE_MENU", { category: "COURSE" }), text("Do you teach in Tamil?"), withAnswers);
    expect(next.actions).toEqual([{ kind: "UNANSWERED", text: "Do you teach in Tamil?" }]);
  });

  it("lists main-menu messages it didn't get, and a first message only when it is a question", () => {
    expect(transitionSupport(at("MAIN_MENU"), text("is there a sibling discount"), withAnswers).actions).toEqual([
      { kind: "UNANSWERED", text: "is there a sibling discount" }
    ]);
    expect(transitionSupport(at("START"), text("hello there"), withAnswers).actions).toEqual([]);
    expect(transitionSupport(at("START"), text("Do you have weekend batches?"), withAnswers).actions).toEqual([
      { kind: "UNANSWERED", text: "Do you have weekend batches?" }
    ]);
  });

  it("skips noise: short replies, numbers", () => {
    expect(isSupportQuestionWorthListing("ok")).toBe(false);
    expect(isSupportQuestionWorthListing("1234567")).toBe(false);
    expect(isSupportQuestionWorthListing("sibling discount?")).toBe(true);
    expect(transitionSupport(at("MAIN_MENU"), text("hmm"), withAnswers).actions).toEqual([]);
  });
});

describe("redactSupportText", () => {
  it("removes Luhn-valid card numbers, with or without spaces", () => {
    expect(redactSupportText("card 4111 1111 1111 1111 thanks")).toEqual({ redacted: true, text: "card [card number removed] thanks" });
    expect(redactSupportText("4111-1111-1111-1111").redacted).toBe(true);
  });

  it("keeps numbers that aren't cards: phones, references, amounts", () => {
    expect(redactSupportText("call 9876543210, ref 1234567890123 (not Luhn), paid 4500").redacted).toBe(false);
  });

  it("removes a code written next to OTP, PIN or password", () => {
    expect(redactSupportText("my OTP is 482913")).toEqual({ redacted: true, text: "my OTP is [removed]" });
    expect(redactSupportText("password: hunter2").text).toBe("password: [removed]");
  });
});

describe("supportMenuEntries (the academy's main menu)", () => {
  it("keeps the built-in menu without settings", () => {
    expect(supportMenuEntries(null).map((entry) => entry.row.id)).toEqual([
      "menu.course",
      "menu.refund",
      "menu.class",
      "menu.payment",
      "menu.tech",
      "menu.human"
    ]);
  });

  it("follows the academy's order and titles, drops switched-off options, and never drops Talk to our team", () => {
    const items = DEFAULT_SUPPORT_MENU.map((item) =>
      item.category === "TECH"
        ? { ...item, enabled: false }
        : item.category === "OTHER"
          ? { ...item, enabled: false, title: "A person, please" }
          : item.category === "CLASS"
            ? { ...item, description: "", title: "  Class problem  " }
            : item
    ).reverse();
    const entries = supportMenuEntries(items);
    expect(entries.map((entry) => entry.category)).toEqual(["OTHER", "PAYMENT", "CLASS", "REFUND", "COURSE"]);
    expect(entries[0].row).toMatchObject({ id: "menu.human", title: "A person, please" });
    expect(entries[2].row).toEqual({ id: "menu.class", title: "Class problem" });
    expect(supportMainMenu(undefined, entries).body).toContain("(1–5)");
  });
});

describe("existing students (LINK and NEXT CLASS)", () => {
  const menu = { draft: {}, state: "MAIN_MENU" as const, status: "BOT" as const };

  it("reads a link code with or without the dash, in any case", () => {
    expect(supportLinkCodeIn("LINK ABCD-2345")).toBe("ABCD2345");
    expect(supportLinkCodeIn("  link abcd 2345 ")).toBe("ABCD2345");
    expect(supportLinkCodeIn("link abc")).toBeNull();
    expect(supportLinkCodeIn("please link my account")).toBeNull();
  });

  it("hands both to the API only where the academy switched it on, without moving the conversation", () => {
    const on = { ...ctx, accountAnswers: true };
    expect(transitionSupport(menu, text("LINK ABCD-2345"), on)).toMatchObject({ actions: [{ code: "ABCD2345", kind: "LINK_ACCOUNT" }], replies: [], state: "MAIN_MENU" });
    expect(transitionSupport(menu, text("Next class"), on)).toMatchObject({ actions: [{ kind: "ACCOUNT_QUERY" }], replies: [] });
    expect(transitionSupport(menu, text("next class"), ctx).actions.map((action) => action.kind)).not.toContain("ACCOUNT_QUERY");
    expect(transitionSupport(menu, text("LINK ABCD-2345"), ctx).actions.map((action) => action.kind)).not.toContain("LINK_ACCOUNT");
  });

  it("never answers for an account while staff have the conversation", () => {
    const on = { ...ctx, accountAnswers: true };
    expect(transitionSupport({ ...menu, status: "AGENT" }, text("next class"), on)).toMatchObject({ actions: [], replies: [] });
  });
});

describe("demo reminder buttons (docs/LEAD_STAGES.md)", () => {
  const slots: SupportTransitionContext = {
    ...ctx,
    demoSlots: [{ id: "class_sat", title: "Sat 22 Nov, 10:00 am" }]
  };
  const booking = { level: "beginner" as const, parentName: "Priya", registrationId: "reg_1", studentAge: 9, studentName: "Asha" };

  it("records Yes, I'll attend in any state, and only the bot says thank you", () => {
    const yes = transitionSupport(at("MAIN_MENU"), tap("demo.attend.reg_1"), ctx);
    expect(yes.actions).toEqual([{ kind: "DEMO_ATTEND", registrationId: "reg_1" }]);
    expect(yes.state).toBe("MAIN_MENU");
    expect(yes.replies[0].body).toContain("you'll attend");

    const withStaff = transitionSupport(at("DONE", {}, "AGENT"), tap("demo.attend.reg_1"), ctx);
    expect(withStaff).toMatchObject({ actions: [{ kind: "DEMO_ATTEND", registrationId: "reg_1" }], replies: [], status: "AGENT" });
  });

  it("Reschedule reopens the demo times with the child's details, and the new booking replaces the old one", () => {
    const move = transitionSupport(at("MAIN_MENU"), tap("demo.move.reg_1"), { ...slots, reschedule: booking });
    expect(move).toMatchObject({ draft: { replacesRegistrationId: "reg_1", studentName: "Asha" }, state: "DEMO_TIME" });
    expect(move.replies[1]).toMatchObject({ kind: "list" });

    const confirm = transitionSupport(at("DEMO_TIME", move.draft), tap("demo.slot.class_sat"), slots);
    const sent = transitionSupport(at("DEMO_CONFIRM", confirm.draft), tap("confirm.send"), slots);
    expect(sent.actions[0]).toMatchObject({ demo: { replacesRegistrationId: "reg_1", slotClassId: "class_sat" }, kind: "TICKET" });
  });

  it("an old Reschedule button starts a fresh booking, and staff conversations are left alone", () => {
    expect(transitionSupport(at("MAIN_MENU"), tap("demo.move.reg_9"), { ...slots, reschedule: booking }).state).toBe("DEMO_STUDENT");
    expect(transitionSupport(at("MAIN_MENU"), tap("demo.move.reg_1"), slots).state).toBe("DEMO_STUDENT");
    expect(transitionSupport(at("DONE", {}, "AGENT"), tap("demo.move.reg_1"), { ...slots, reschedule: booking })).toMatchObject({
      replies: [],
      status: "AGENT"
    });
  });
});
