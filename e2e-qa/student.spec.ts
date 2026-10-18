import { test, expect } from "@playwright/test";
import { API_BASE, apiLogin, clickBoardSquare } from "./_helpers";
import { login, USERS } from "./_login";

const STUDENT = USERS.student;
const FIXTURE_TITLE = "E2E Student Fixture";
// The seed's batch holding student@nexa.test.
const BATCH_NAME = process.env.E2E_QA_BATCH_NAME || "Seeded Beginner Batch";

async function getJson<T>(path: string, cookie: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: { Cookie: cookie } });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

test.beforeAll(async () => {
  // Reset the E2E Student Fixture to a fresh PENDING state (undeploy + redeploy)
  // so the browser flow below is repeatable across runs.
  const cookie = await apiLogin(USERS.coach);
  const deps = await getJson<{ deployments: Array<{ id: string; title: string; assignmentId: string }> }>(
    "/assignments/deployments",
    cookie
  );
  const dep = deps.deployments.find((d) => d.title === FIXTURE_TITLE);
  let assignmentId = dep?.assignmentId;
  if (!assignmentId) {
    const lib = await getJson<{ assignments: Array<{ id: string; title: string }> }>("/assignments/library", cookie);
    assignmentId = lib.assignments.find((a) => a.title === FIXTURE_TITLE)?.id;
  }
  if (!assignmentId) throw new Error(`No "${FIXTURE_TITLE}" assignment in the library.`);

  const batches = await getJson<{ batches?: Array<{ id: string; name: string }> } | Array<{ id: string; name: string }>>(
    "/coach/batches",
    cookie
  );
  const batch = (Array.isArray(batches) ? batches : batches.batches ?? []).find((b) => b.name === BATCH_NAME);
  if (!batch) throw new Error(`coach@nexa.test has no "${BATCH_NAME}" batch.`);

  if (dep?.id) {
    const undeploy = await fetch(`${API_BASE}/assignments/deployments/${dep.id}`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    if (!undeploy.ok) throw new Error(`Undeploy failed: ${undeploy.status} ${await undeploy.text()}`);
  }
  const redeploy = await fetch(`${API_BASE}/assignments/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      assignmentId,
      batchIds: [batch.id],
      dueDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    }),
  });
  if (!redeploy.ok) throw new Error(`Redeploy failed: ${redeploy.status} ${await redeploy.text()}`);
});

test("STUDENT: SOLVE_LINE - play correct line, get scored result", async ({ page }) => {
  await login(page, STUDENT.email, STUDENT.password);
  await page.goto("/student/practice");
  await page.waitForLoadState("networkidle");

  // open the fixture detail via the Start button on its own card ("Restart" excluded)
  const card = page
    .locator("div")
    .filter({ hasText: FIXTURE_TITLE })
    .filter({ has: page.getByRole("button", { name: /^start\b/i }) })
    .last();
  await card.getByRole("button", { name: /^start\b/i }).click();
  await page.waitForLoadState("networkidle");

  // attempting for the first time -> practice board shown
  const board = page.locator(".cg-wrap.manipulable").first();
  await expect(board).toBeVisible();

  // play e2-e4 (correct white opener)
  await clickBoardSquare(page, board, "e2");
  await clickBoardSquare(page, board, "e4");
  await expect(page.getByText(/Correct!/i)).toBeVisible();

  // after e4, black auto-replies e5; play g1-f3 for white -> line completes -> result view
  await clickBoardSquare(page, board, "g1");
  await clickBoardSquare(page, board, "f3");

  // result view shows completion heading + 100% score and accuracy
  await expect(page.getByRole("heading", { name: /assignment completed/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("100%").first()).toBeVisible();
  // move-by-move review marks both student moves correct
  await expect(page.getByText(/Full line: 1\. e4 e5 2\. Nf3 Nc6/)).toBeVisible();
  await expect(page.getByText("✓ Correct").first()).toBeVisible();
});
