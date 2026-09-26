import { createRequire } from "node:module";
import path from "node:path";
import { test, expect, type Browser, type Page } from "@playwright/test";
import { loginContext } from "./fixtures";

/**
 * Coach feedback & ratings — admin builds a form, a student answers it on the
 * dashboard (pop-up + card placements), and the rating reaches the coach's
 * anonymous page and the admin's coach-ratings tab.
 *
 * Opt-in (writes to the DB it points at — never aim it at a shared/prod DB):
 *   1. api + web running:  npm run dev
 *   2. seed applied:       npm run db:seed
 *   3. RUN_FEEDBACK_E2E=1 DATABASE_URL=<local db> E2E_BASE_URL=http://localhost:3000 \
 *        npx playwright test coach-feedback
 *
 * A completed class needs LiveKit to produce the normal way, so the fixture
 * classes + attendance are written straight through Prisma (ids prefixed
 * `e2e_fb_`), and removed again afterwards along with the form and responses.
 * Any other active feedback form is paused for the run and restored after.
 */

const RUN = process.env.RUN_FEEDBACK_E2E === "1" && Boolean(process.env.DATABASE_URL);

// The Prisma client lives in the API workspace, not the repo root.
const apiRequire = createRequire(path.join(__dirname, "../apps/api/package.json"));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Prisma = any;

const FORM_TITLE = `E2E coach feedback ${Date.now()}`;
const PREFIX = "e2e_fb_";

test.describe.configure({ mode: "serial" });
test.skip(!RUN, "Set RUN_FEEDBACK_E2E=1 and DATABASE_URL to run the coach-feedback flow.");

let prisma: Prisma;
let pausedFormIds: string[] = [];

async function pageAs(browser: Browser, role: "admin" | "coach" | "student"): Promise<Page> {
  const context = await browser.newContext();
  await loginContext(context, role);
  return context.newPage();
}

async function cleanup() {
  await prisma.feedbackResponse.deleteMany({ where: { form: { title: { startsWith: "E2E coach feedback" } } } });
  await prisma.feedbackForm.deleteMany({ where: { title: { startsWith: "E2E coach feedback" } } });
  await prisma.feedbackResponse.deleteMany({ where: { classId: { startsWith: PREFIX } } });
  await prisma.coachClass.deleteMany({ where: { id: { startsWith: PREFIX } } });
}

test.beforeAll(async () => {
  const { PrismaClient } = apiRequire("@prisma/client");
  prisma = new PrismaClient();
  await cleanup();

  const student = await prisma.user.findUniqueOrThrow({ where: { email: "student@nexa.test" } });
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "coach@nexa.test" } });
  const shared = await prisma.batchStudent.findFirstOrThrow({
    where: { studentId: student.id, batch: { coaches: { some: { coachId: coach.id, isDeleted: false } } } }
  });

  const now = Date.now();
  const classes = [
    { id: `${PREFIX}class_old`, title: "Rook Endgames", endedAgoMs: 2 * 86_400_000 },
    { id: `${PREFIX}class_new`, title: "Opening Principles", endedAgoMs: 30 * 60_000 }
  ];
  for (const cls of classes) {
    await prisma.coachClass.create({
      data: {
        batchId: shared.batchId,
        coachId: coach.id,
        endsAt: new Date(now - cls.endedAgoMs),
        id: cls.id,
        startsAt: new Date(now - cls.endedAgoMs - 3_600_000),
        status: "COMPLETED",
        title: cls.title,
        topic: cls.title
      }
    });
    await prisma.classAttendance.create({
      data: { classId: cls.id, status: "PRESENT", studentId: student.id }
    });
  }

  // Isolate the run from any real forms, then put them back afterwards.
  const active = await prisma.feedbackForm.findMany({ where: { isActive: true }, select: { id: true } });
  pausedFormIds = active.map((f: { id: string }) => f.id);
  await prisma.feedbackForm.updateMany({ where: { id: { in: pausedFormIds } }, data: { isActive: false } });
});

test.afterAll(async () => {
  if (!prisma) return;
  await cleanup();
  await prisma.feedbackForm.updateMany({ where: { id: { in: pausedFormIds } }, data: { isActive: true } });
  await prisma.$disconnect();
});

test("admin creates a feedback form with custom questions, timing and placements", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  await page.goto("/admin/feedback");
  await expect(page.getByRole("heading", { name: "Coach Feedback" }).first()).toBeVisible();

  await page.getByRole("button", { name: "New form" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "New feedback form" })).toBeVisible();

  await dialog.getByLabel("Title").fill(FORM_TITLE);

  // Add a custom multiple-choice question to the default template.
  await dialog.getByRole("button", { name: "Add question" }).click();
  await dialog.getByLabel("Question 4 text").fill("How was the pace?");
  await dialog.getByLabel("Question 4 type").selectOption("SINGLE_CHOICE");
  await dialog.getByLabel("Question 4 choices, one per line").fill("Too slow\nJust right\nToo fast");

  // Where: add the pop-up to the default class-end + card placements.
  await dialog.getByText("Dashboard pop-up", { exact: true }).click();

  await dialog.getByRole("button", { name: "Create form" }).click();
  await expect(dialog).toBeHidden();

  const card = page.locator("div").filter({ hasText: FORM_TITLE }).first();
  await expect(card).toBeVisible();
  await expect(page.getByText("After every class").first()).toBeVisible();
  await expect(page.getByText("Dashboard pop-up").first()).toBeVisible();
});

test("student answers in the dashboard pop-up and skips the dashboard card", async ({ browser }) => {
  // After-class forms only count classes ending after the form starts; the
  // fixture classes predate it, so backdate the form as if made last week.
  await prisma.feedbackForm.updateMany({
    where: { title: FORM_TITLE },
    data: { createdAt: new Date(Date.now() - 7 * 86_400_000) }
  });

  const page = await pageAs(browser, "student");
  await page.goto("/student");

  // Pop-up: the newest class.
  const popup = page.getByRole("dialog");
  await expect(popup.getByRole("heading", { name: FORM_TITLE })).toBeVisible({ timeout: 30_000 });
  await expect(popup.getByText("Opening Principles")).toBeVisible();

  // Submitting without the required rating is refused client-side.
  await popup.getByRole("button", { name: "Submit feedback" }).click();
  await expect(popup.getByText("This question needs an answer.").first()).toBeVisible();

  await popup.getByRole("radiogroup", { name: "Overall, how would you rate your coach?" })
    .getByRole("radio", { name: /^4 of 5/ }).click();
  await popup.getByRole("radiogroup", { name: "How clearly did your coach explain things?" })
    .getByRole("radio", { name: /^5 of 5/ }).click();
  await popup.getByRole("radio", { name: "Just right" }).click();
  await popup.getByLabel(/Anything your coach could do better/).fill("More puzzles please");
  await popup.getByRole("button", { name: "Submit feedback" }).click();
  await expect(page.getByText("Thanks for your feedback!")).toBeVisible();
  await expect(popup).toBeHidden();

  // Card: the older class stays at the top of the dashboard until handled.
  // (Scoped to the card's "About <coach> · <class>" line — the class title
  // also appears in the dashboard's past-classes list.)
  const cardLine = page.getByText(/About .* Rook Endgames/);
  await expect(cardLine).toBeVisible();
  await page.getByRole("button", { name: "Skip" }).click();
  await expect(cardLine).toBeHidden();
});

test("an answered request can't be submitted again", async ({ browser }) => {
  const context = await browser.newContext();
  await loginContext(context, "student");
  const form = await prisma.feedbackForm.findFirstOrThrow({ where: { title: FORM_TITLE } });
  const coach = await prisma.user.findUniqueOrThrow({ where: { email: "coach@nexa.test" } });

  const res = await context.request.post(
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/feedback/submit`,
    {
      data: {
        answers: [{ questionId: form.questions[0].id, ratingValue: 1 }],
        coachId: coach.id,
        contextKey: `class:${PREFIX}class_new`,
        formId: form.id
      }
    }
  );
  expect(res.status()).toBe(404);

  const stored = await prisma.feedbackResponse.findMany({ where: { formId: form.id } });
  expect(stored.map((r: { status: string }) => r.status).sort()).toEqual(["SKIPPED", "SUBMITTED"]);
  expect(stored.find((r: { status: string }) => r.status === "SUBMITTED").overallRating).toBe(4.5);
});

test("coach sees their rating anonymously", async ({ browser }) => {
  const page = await pageAs(browser, "coach");
  await page.goto("/coach/feedback");

  await expect(page.getByText("Your rating")).toBeVisible();
  await expect(page.getByText("4.5").first()).toBeVisible();
  await expect(page.getByText("More puzzles please")).toBeVisible();
  await expect(page.getByText("Anonymous student").first()).toBeVisible();
});

test("admin sees the coach rating and the named response", async ({ browser }) => {
  const page = await pageAs(browser, "admin");
  await page.goto("/admin/feedback");

  await page.getByRole("tab", { name: "Coach ratings" }).click();
  const coachCard = page.locator("div").filter({ hasText: /coach/i }).filter({ hasText: "4.5" }).first();
  await expect(coachCard).toBeVisible();

  await page.getByRole("button", { name: "View responses" }).first().click();
  await expect(page.getByText("More puzzles please")).toBeVisible();
  await expect(page.getByText("Anonymous student")).toHaveCount(0);

  // A form with responses can only be deactivated, not deleted.
  await page.getByRole("tab", { name: "Forms" }).click();
  await expect(page.getByRole("button", { name: "Has responses — deactivate instead" }).first()).toBeDisabled();
});
