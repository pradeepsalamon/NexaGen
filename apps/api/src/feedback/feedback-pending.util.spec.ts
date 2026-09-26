import type { FeedbackQuestion } from "@nexa-chess/types";
import {
  computePendingFeedback,
  responseKey,
  validateFeedbackAnswers,
  type AttendedClassInput,
  type PendingFormInput
} from "./feedback-pending.util";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-26T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

function form(overrides: Partial<PendingFormInput> = {}): PendingFormInput {
  return {
    allowSkip: true,
    batchIds: [],
    classInterval: 1,
    createdAt: daysAgo(60),
    description: null,
    endsAt: null,
    expiresAfterDays: 7,
    id: "form-1",
    intervalDays: null,
    placements: ["DASHBOARD_CARD"],
    questions: [],
    startsAt: null,
    title: "How was class?",
    trigger: "AFTER_CLASS",
    ...overrides
  };
}

function cls(id: string, endedDaysAgo: number, overrides: Partial<AttendedClassInput> = {}): AttendedClassInput {
  return {
    batchId: "batch-1",
    classId: id,
    classTitle: `Class ${id}`,
    coachId: "coach-1",
    endedAt: daysAgo(endedDaysAgo),
    ...overrides
  };
}

const run = (forms: PendingFormInput[], attended: AttendedClassInput[], answered: string[] = []) =>
  computePendingFeedback({ answered: new Set(answered), attended, forms, now: NOW });

describe("computePendingFeedback", () => {
  describe("AFTER_CLASS", () => {
    it("asks about each recent attended class, newest first", () => {
      const result = run([form()], [cls("a", 3), cls("b", 1)]);
      expect(result.map((c) => c.contextKey)).toEqual(["class:b", "class:a"]);
      expect(result[0].coachId).toBe("coach-1");
    });

    it("drops classes older than the expiry window", () => {
      const result = run([form({ expiresAfterDays: 2 })], [cls("old", 5), cls("new", 1)]);
      expect(result.map((c) => c.classId)).toEqual(["new"]);
    });

    it("only asks every Nth class, counted per coach", () => {
      const attended = [
        cls("a1", 5),
        cls("a2", 4),
        cls("b1", 3.5, { coachId: "coach-2" }),
        cls("a3", 3),
        cls("a4", 2),
        cls("b2", 1, { coachId: "coach-2" })
      ];
      const result = run([form({ classInterval: 2 })], attended);
      expect(result.map((c) => c.classId).sort()).toEqual(["a2", "a4", "b2"]);
    });

    it("ignores classes that ended before the form started", () => {
      const result = run([form({ startsAt: daysAgo(2) })], [cls("before", 3), cls("after", 1)]);
      expect(result.map((c) => c.classId)).toEqual(["after"]);
    });

    it("respects the batch scope", () => {
      const result = run(
        [form({ batchIds: ["batch-2"] })],
        [cls("a", 1), cls("b", 1, { batchId: "batch-2" })]
      );
      expect(result.map((c) => c.classId)).toEqual(["b"]);
    });

    it("never expires later than the form's end", () => {
      const endsAt = new Date(NOW.getTime() + DAY);
      const [candidate] = run([form({ endsAt, expiresAfterDays: 30 })], [cls("a", 1)]);
      expect(candidate.expiresAt).toEqual(endsAt);
    });
  });

  it("RECURRING asks once per coach per period, only for coaches actually attended", () => {
    const recurring = form({ createdAt: daysAgo(35), intervalDays: 30, trigger: "RECURRING" });
    const result = run([recurring], [cls("a", 20), cls("b", 10, { coachId: "coach-2" })]);

    expect(result).toHaveLength(2);
    expect(new Set(result.map((c) => c.contextKey))).toEqual(new Set(["period:1"]));
    expect(result.map((c) => c.coachId).sort()).toEqual(["coach-1", "coach-2"]);
  });

  it("RECURRING closes once the period's expiry passes", () => {
    const recurring = form({
      createdAt: daysAgo(40),
      expiresAfterDays: 5,
      intervalDays: 30,
      trigger: "RECURRING"
    });
    // Period 1 started 10 days ago; open only its first 5 days.
    expect(run([recurring], [cls("a", 20)])).toEqual([]);
  });

  it("ONE_TIME asks each attended coach once", () => {
    const once = form({ trigger: "ONE_TIME" });
    const result = run([once], [cls("a", 30), cls("b", 20)]);
    expect(result).toHaveLength(1);
    expect(result[0].contextKey).toBe("once");
  });

  it("filters out anything already answered or skipped", () => {
    const result = run([form()], [cls("a", 1), cls("b", 2)], [responseKey("form-1", "coach-1", "class:a")]);
    expect(result.map((c) => c.classId)).toEqual(["b"]);
  });

  it("skips forms outside their live window", () => {
    expect(run([form({ startsAt: new Date(NOW.getTime() + DAY) })], [cls("a", 1)])).toEqual([]);
    expect(run([form({ endsAt: daysAgo(0.5) })], [cls("a", 1)])).toEqual([]);
  });

  it("never asks about a class that hasn't ended yet", () => {
    expect(run([form()], [cls("future", -0.1)])).toEqual([]);
  });
});

describe("validateFeedbackAnswers", () => {
  const questions: FeedbackQuestion[] = [
    { id: "q1", label: "Overall", required: true, type: "RATING" },
    { id: "q2", label: "Comments", required: false, type: "TEXT" },
    { id: "q3", label: "Pace", options: ["Slow", "Right", "Fast"], required: true, type: "SINGLE_CHOICE" },
    { id: "q4", label: "Recommend?", required: false, type: "YES_NO" }
  ];

  it("accepts a valid set and drops empty optional answers", () => {
    const result = validateFeedbackAnswers(questions, [
      { questionId: "q1", ratingValue: 4 },
      { questionId: "q2", textValue: "  " },
      { questionId: "q3", textValue: "Right" },
      { questionId: "unknown", textValue: "ignored" }
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.answers.map((a) => a.question.id)).toEqual(["q1", "q3"]);
    }
  });

  it("reports missing required answers and invalid values", () => {
    const result = validateFeedbackAnswers(questions, [
      { questionId: "q1", ratingValue: 9 },
      { questionId: "q3", textValue: "Very fast" },
      { questionId: "q4", textValue: "Maybe" }
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toHaveLength(3);
    }
  });

  it("requires a rating for a required RATING question", () => {
    const result = validateFeedbackAnswers([questions[0]], []);
    expect(result).toEqual({ errors: ['"Overall" needs a rating.'], ok: false });
  });
});
