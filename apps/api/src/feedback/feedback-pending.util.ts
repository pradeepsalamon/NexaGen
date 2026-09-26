import type { FeedbackPlacement, FeedbackQuestion, FeedbackTrigger } from "@nexa-chess/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The parts of a `FeedbackForm` row the pending computation reads. */
export interface PendingFormInput {
  id: string;
  title: string;
  description: string | null;
  questions: FeedbackQuestion[];
  trigger: FeedbackTrigger;
  classInterval: number;
  intervalDays: number | null;
  expiresAfterDays: number;
  placements: FeedbackPlacement[];
  batchIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  allowSkip: boolean;
  createdAt: Date;
}

/** A completed class the student actually attended. */
export interface AttendedClassInput {
  classId: string;
  classTitle: string | null;
  coachId: string;
  batchId: string;
  endedAt: Date;
}

export interface PendingCandidate {
  form: PendingFormInput;
  coachId: string;
  contextKey: string;
  classId: string | null;
  classTitle: string | null;
  classEndedAt: Date | null;
  expiresAt: Date | null;
}

export const responseKey = (formId: string, coachId: string, contextKey: string) =>
  `${formId}|${coachId}|${contextKey}`;

/** A form is live between its optional start and end. */
export function isFormLive(form: PendingFormInput, now: Date): boolean {
  if (form.startsAt && form.startsAt > now) return false;
  if (form.endsAt && form.endsAt <= now) return false;
  return true;
}

/** When a form started counting: its explicit start, else when it was created. */
function anchorOf(form: PendingFormInput): Date {
  return form.startsAt ?? form.createdAt;
}

function inScope(form: PendingFormInput, batchId: string): boolean {
  return form.batchIds.length === 0 || form.batchIds.includes(batchId);
}

function minDate(a: Date, b: Date | null): Date {
  return b && b < a ? b : a;
}

/**
 * Every open feedback request for one student.
 *
 * - AFTER_CLASS: each attended class with a coach — counted per coach from the
 *   form's anchor — whose ordinal is a multiple of `classInterval`, while it is
 *   still within `expiresAfterDays` of the class ending.
 * - RECURRING: one request per coach per `intervalDays` window since the anchor,
 *   open for `expiresAfterDays` (never past the window's end).
 * - ONE_TIME: one request per coach while the form is live.
 *
 * RECURRING and ONE_TIME only ask about a coach the student has actually
 * attended an in-scope class with, so nobody rates a stranger.
 * `answered` holds `responseKey`s of submitted/skipped responses.
 */
export function computePendingFeedback(input: {
  forms: PendingFormInput[];
  attended: AttendedClassInput[];
  answered: ReadonlySet<string>;
  now: Date;
}): PendingCandidate[] {
  const { answered, now } = input;
  const attended = [...input.attended].sort((a, b) => a.endedAt.getTime() - b.endedAt.getTime());
  const candidates: PendingCandidate[] = [];

  for (const form of input.forms) {
    if (!isFormLive(form, now)) continue;

    const scoped = attended.filter((c) => inScope(form, c.batchId) && c.endedAt <= now);

    if (form.trigger === "AFTER_CLASS") {
      const anchor = anchorOf(form);
      const ordinalByCoach = new Map<string, number>();
      const interval = Math.max(1, form.classInterval);

      for (const cls of scoped) {
        if (cls.endedAt < anchor) continue;
        const ordinal = (ordinalByCoach.get(cls.coachId) ?? 0) + 1;
        ordinalByCoach.set(cls.coachId, ordinal);
        if (ordinal % interval !== 0) continue;

        const expiresAt = minDate(
          new Date(cls.endedAt.getTime() + form.expiresAfterDays * DAY_MS),
          form.endsAt
        );
        if (expiresAt <= now) continue;

        candidates.push({
          form,
          coachId: cls.coachId,
          contextKey: `class:${cls.classId}`,
          classId: cls.classId,
          classTitle: cls.classTitle,
          classEndedAt: cls.endedAt,
          expiresAt
        });
      }
      continue;
    }

    const coachIds = [...new Set(scoped.map((c) => c.coachId))];

    if (form.trigger === "RECURRING") {
      const intervalMs = Math.max(1, form.intervalDays ?? 30) * DAY_MS;
      const anchor = anchorOf(form).getTime();
      if (now.getTime() < anchor) continue;
      const period = Math.floor((now.getTime() - anchor) / intervalMs);
      const periodStart = anchor + period * intervalMs;
      const expiresAt = minDate(
        new Date(Math.min(periodStart + form.expiresAfterDays * DAY_MS, periodStart + intervalMs)),
        form.endsAt
      );
      if (expiresAt <= now) continue;

      for (const coachId of coachIds) {
        candidates.push({
          form,
          coachId,
          contextKey: `period:${period}`,
          classId: null,
          classTitle: null,
          classEndedAt: null,
          expiresAt
        });
      }
      continue;
    }

    for (const coachId of coachIds) {
      candidates.push({
        form,
        coachId,
        contextKey: "once",
        classId: null,
        classTitle: null,
        classEndedAt: null,
        expiresAt: form.endsAt
      });
    }
  }

  return candidates
    .filter((c) => !answered.has(responseKey(c.form.id, c.coachId, c.contextKey)))
    .sort((a, b) => (b.classEndedAt?.getTime() ?? 0) - (a.classEndedAt?.getTime() ?? 0));
}

/**
 * Checks a student's answers against the form's questions. Returns the
 * cleaned answers (unknown ids dropped, empty optional answers dropped) or a
 * list of human-readable problems.
 */
export function validateFeedbackAnswers(
  questions: FeedbackQuestion[],
  answers: { questionId: string; ratingValue?: number | null; textValue?: string | null }[]
):
  | { ok: true; answers: { question: FeedbackQuestion; ratingValue: number | null; textValue: string | null }[] }
  | { ok: false; errors: string[] } {
  const byId = new Map(answers.map((a) => [a.questionId, a]));
  const errors: string[] = [];
  const cleaned: { question: FeedbackQuestion; ratingValue: number | null; textValue: string | null }[] = [];

  for (const question of questions) {
    const answer = byId.get(question.id);
    const text = answer?.textValue?.trim() || null;
    const rating = answer?.ratingValue ?? null;

    if (question.type === "RATING") {
      if (rating === null) {
        if (question.required) errors.push(`"${question.label}" needs a rating.`);
        continue;
      }
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        errors.push(`"${question.label}" must be rated 1-5.`);
        continue;
      }
      cleaned.push({ question, ratingValue: rating, textValue: null });
      continue;
    }

    if (text === null) {
      if (question.required) errors.push(`"${question.label}" is required.`);
      continue;
    }

    if (question.type === "SINGLE_CHOICE" && !(question.options ?? []).includes(text)) {
      errors.push(`"${question.label}" has an invalid choice.`);
      continue;
    }
    if (question.type === "YES_NO" && text !== "Yes" && text !== "No") {
      errors.push(`"${question.label}" must be Yes or No.`);
      continue;
    }

    cleaned.push({ question, ratingValue: null, textValue: text });
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, answers: cleaned };
}
