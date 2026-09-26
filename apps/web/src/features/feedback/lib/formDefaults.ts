import type { FeedbackFormDto, FeedbackQuestion, UpsertFeedbackFormRequest } from "@nexa-chess/types";

export function newQuestionId(): string {
  return `q_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function blankQuestion(): FeedbackQuestion {
  return { id: newQuestionId(), label: "", required: false, type: "RATING" };
}

/** A new form starts as a sensible "rate your coach after class" template. */
export function defaultFormValues(): UpsertFeedbackFormRequest {
  return {
    allowSkip: true,
    batchIds: [],
    classInterval: 1,
    description: "",
    endsAt: null,
    expiresAfterDays: 7,
    intervalDays: 30,
    isActive: true,
    placements: ["CLASS_END", "DASHBOARD_CARD"],
    questions: [
      { id: newQuestionId(), label: "Overall, how would you rate your coach?", required: true, type: "RATING" },
      { id: newQuestionId(), label: "How clearly did your coach explain things?", required: false, type: "RATING" },
      { id: newQuestionId(), label: "Anything your coach could do better?", required: false, type: "TEXT" }
    ],
    showToCoach: true,
    startsAt: null,
    title: "Class feedback",
    trigger: "AFTER_CLASS"
  };
}

export function formToValues(form: FeedbackFormDto): UpsertFeedbackFormRequest {
  return {
    allowSkip: form.allowSkip,
    batchIds: form.batchIds,
    classInterval: form.classInterval,
    description: form.description ?? "",
    endsAt: form.endsAt,
    expiresAfterDays: form.expiresAfterDays,
    intervalDays: form.intervalDays ?? 30,
    isActive: form.isActive,
    placements: form.placements,
    questions: form.questions,
    showToCoach: form.showToCoach,
    startsAt: form.startsAt,
    title: form.title,
    trigger: form.trigger
  };
}

/** Plain-language "when" line for the forms list. */
export function describeSchedule(form: Pick<FeedbackFormDto, "trigger" | "classInterval" | "intervalDays">) {
  if (form.trigger === "AFTER_CLASS") {
    return form.classInterval === 1 ? "After every class" : `After every ${form.classInterval} classes`;
  }
  if (form.trigger === "RECURRING") {
    return `Every ${form.intervalDays ?? 30} days per coach`;
  }
  return "Once per coach";
}
