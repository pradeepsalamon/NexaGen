import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./_login";

const STUDENT = USERS.student;
const API_BASE = "http://localhost:3011";
const FIXTURE_TITLE = "E2E Student Fixture";
const BATCH = "cmsm5o3ho0005l601dr6wamjy";

test.beforeAll(async () => {
  // Reset the E2E Student Fixture to a fresh PENDING state (undeploy + redeploy)
  // so the browser flow below is repeatable across runs.
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(USERS.coach),
  });
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const deps = await (await fetch(`${API_BASE}/assignments/deployments`, { headers: { Cookie: cookie } })).json();
  const dep = deps.deployments.find((d: any) => d.title === FIXTURE_TITLE);
  if (dep?.id) {
    await fetch(`${API_BASE}/assignments/deployments/${dep.id}`, { method: "DELETE", headers: { Cookie: cookie } });
  }
  await fetch(`${API_BASE}/assignments/deployments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      assignmentId: dep.assignmentId,
      batchIds: [BATCH],
      dueDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    }),
  });
});

async function clickSquare(page: Page, board: ReturnType<Page["locator"]>, square: string) {
  await board.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  const box = await board.boundingBox();
  if (!box) throw new Error("board not found");
  const x = box.x + box.width * ((file + 0.5) / 8);
  const y = box.y + box.height * ((8 - rank + 0.5) / 8);
  await page.mouse.click(x, y);
  await page.waitForTimeout(400);
}

test("STUDENT: SOLVE_LINE - play correct line, get scored result", async ({ page }) => {
  await login(page, STUDENT.email, STUDENT.password);
  await page.goto("/student/practice");
  await page.waitForLoadState("networkidle");

  // open the fixture detail via the Start button on its card
  await page.getByRole("button", { name: /Start/i }).first().click();
  await page.waitForLoadState("networkidle");

  // attempting for the first time -> practice board shown
  const board = page.locator(".cg-wrap.manipulable").first();
  await expect(board).toBeVisible();

  // play e2-e4 (correct white opener)
  await clickSquare(page, board, "e2");
  await clickSquare(page, board, "e4");
  await expect(page.getByText(/Correct!/i)).toBeVisible();

  // after e4, black auto-replies e5; play g1-f3 for white -> line completes -> result view
  await clickSquare(page, board, "g1");
  await clickSquare(page, board, "f3");

  // result view shows completion heading + 100% score and accuracy
  await expect(page.getByRole("heading", { name: /assignment completed/i })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("100%").first()).toBeVisible();
  // move-by-move review marks both student moves correct
  await expect(page.getByText(/Full line: 1\. e4 e5 2\. Nf3 Nc6/)).toBeVisible();
  await expect(page.getByText("✓ Correct").first()).toBeVisible();
});
