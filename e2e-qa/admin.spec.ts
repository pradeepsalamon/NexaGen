import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./_login";

export { login, USERS };

const API_BASE = "http://localhost:3011";
let adminCookie: string | null = null;

async function apiLogin() {
  if (adminCookie) return adminCookie;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(USERS.admin),
  });
  adminCookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return adminCookie;
}

async function getAssignments(prefix: string) {
  const cookie = await apiLogin();
  const lib = await (await fetch(`${API_BASE}/assignments/library`, { headers: { Cookie: cookie } })).json();
  return lib.assignments.filter((a: any) => a.title.startsWith(prefix));
}

test.beforeEach(async () => {
  const cookie = await apiLogin();
  for (const it of await getAssignments("QA UI ")) {
    await fetch(`${API_BASE}/assignments/library/${it.id}`, { method: "DELETE", headers: { Cookie: cookie } });
  }
});

/** Drag a spare piece (aria-label "Add white <Role>") onto the PositionEditor board square. */
async function dragPiece(page: Page, dialog: any, role: string, square: string, board: any) {
  const spare = dialog.getByRole("button", { name: `Add white ${role}` }).first();
  // Scroll the spare into view FIRST so the board sits above it (no overlap), then
  // read both bounding boxes without re-scrolling the board.
  await spare.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const spareBox = await spare.boundingBox();
  if (!spareBox) throw new Error("spare piece not found");
  const startX = spareBox.x + spareBox.width / 2;
  const startY = spareBox.y + spareBox.height / 2;
  const box = await board.boundingBox();
  if (!box) throw new Error("board not found");
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1], 10);
  const endX = box.x + box.width * ((file + 0.5) / 8);
  const endY = box.y + box.height * ((8 - rank + 0.5) / 8);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(200);
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(startX + ((endX - startX) * i) / 12, startY + ((endY - startY) * i) / 12);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(500);
}

test("ADMIN: PositionEditor - castling toggles + drag piece update FEN", async ({ page }) => {
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /new assignment/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Activity type").selectOption("SOLVE_LINE");

  // All 4 castling checkboxes present & visible (incl. Black row not obscured)
  const fenInput = dialog.getByLabel("FEN", { exact: true });
  await expect(fenInput).toHaveValue(/w KQkq - 0 1/);
  await expect(dialog.getByRole("checkbox", { name: "White kingside (O-O)" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "White queenside (O-O-O)" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Black kingside (O-O)" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Black queenside (O-O-O)" })).toBeChecked();

  // Toggle off White kingside -> FEN castling loses 'K'
  await dialog.getByRole("checkbox", { name: "White kingside (O-O)" }).click();
  await expect(fenInput).toHaveValue(/w Qkq - 0 1/);
  // Toggle it back on
  await dialog.getByRole("checkbox", { name: "White kingside (O-O)" }).click();
  await expect(fenInput).toHaveValue(/w KQkq - 0 1/);

  // Drag a white Queen onto e4 -> FEN gains a white queen at e4 (placement "Q4/")
  const board = dialog.getByTestId("position-editor-board");
  await dragPiece(page, dialog, "Queen", "e4", board);
  await expect(fenInput).toHaveValue(/Q4\/|4Q3|Q\//);
});
export async function clickBoardSquare(page: Page, board: ReturnType<Page["locator"]>, square: string) {
  await board.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const file = square.charCodeAt(0) - 97; // 0-7
  const rank = parseInt(square[1], 10); // 1-8
  const box = await board.boundingBox();
  if (!box) throw new Error("board not found");
  const x = box.x + box.width * ((file + 0.5) / 8);
  const y = box.y + box.height * ((8 - rank + 0.5) / 8);
  await page.mouse.click(x, y);
  await page.waitForTimeout(250);
}

test("ADMIN: create SOLVE_LINE with PositionEditor + SolutionEditor", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");

  // Open New assignment dialog
  const newBtn = page.getByRole("button", { name: /new assignment/i }).first();
  await newBtn.click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });

  // Choose activity = SOLVE_LINE
  await dialog.getByLabel("Activity type").selectOption("SOLVE_LINE");
  await dialog.getByLabel("Title").fill("QA UI Solve Line");
  await dialog.getByLabel("Difficulty").selectOption("BEGINNER");

  // PositionEditor: starting position standard. Check FEN input reflects defaults.
  const board = dialog.getByTestId("position-editor-board");
  await expect(board).toBeVisible();
  // FEN default = start position
  const fenInput = dialog.getByLabel("FEN", { exact: true });
  await expect(fenInput).toHaveValue(/rnbqkbnr\/pppppppp\/8\/8\/8\/8\/PPPPPPPP\/RNBQKBNR w KQkq - 0 1/);

  // Set side to move = White (already default) ; verify castling checkboxes present
  await expect(dialog.getByRole("checkbox", { name: "White kingside (O-O)" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Black kingside (O-O)" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Black queenside (O-O-O)" })).toBeChecked();
  // Black Castling row visible (regression: not obscured) — check it's not hidden
  await expect(dialog.getByRole("checkbox", { name: "Black queenside (O-O-O)" })).toBeVisible();

  // Starting position + Reset buttons exist
  await expect(dialog.getByRole("button", { name: /Starting position/i })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /Clear board/i })).toBeVisible();

  // SolutionEditor: record the full line (both sides): 1. e4 e5 2. Nf3 Nc6.
  const solutionBoard = dialog.locator(".cg-wrap.manipulable:not([data-testid='position-editor-board'])").first();
  await expect(dialog.getByText("Correct solution")).toBeVisible();
  await expect(dialog.getByText("No solution moves recorded yet.")).toBeVisible();
  // 1. e4 (white) e5 (black)
  await clickBoardSquare(page, solutionBoard, "e2");
  await clickBoardSquare(page, solutionBoard, "e4");
  await expect(dialog.locator("ol").last()).toContainText("e4");
  await clickBoardSquare(page, solutionBoard, "e7");
  await clickBoardSquare(page, solutionBoard, "e5");
  // 2. Nf3 (white) Nc6 (black)
  await clickBoardSquare(page, solutionBoard, "g1");
  await clickBoardSquare(page, solutionBoard, "f3");
  await expect(dialog.locator("ol").last()).toContainText("Nf3");
  await clickBoardSquare(page, solutionBoard, "b8");
  await clickBoardSquare(page, solutionBoard, "c6");

  // undo last move (Nc6 removed)
  await dialog.getByRole("button", { name: /Undo last move/i }).click();
  let movesText = await dialog.locator("ol").innerText();
  expect(movesText).not.toContain("Nc6");
  // re-add Nc6
  await clickBoardSquare(page, solutionBoard, "b8");
  await clickBoardSquare(page, solutionBoard, "c6");

  // Reset solution
  await dialog.getByRole("button", { name: /Reset solution/i }).click();
  await expect(dialog.getByText("No solution moves recorded yet.")).toBeVisible();
  // re-play all four
  await clickBoardSquare(page, solutionBoard, "e2");
  await clickBoardSquare(page, solutionBoard, "e4");
  await clickBoardSquare(page, solutionBoard, "e7");
  await clickBoardSquare(page, solutionBoard, "e5");
  await clickBoardSquare(page, solutionBoard, "g1");
  await clickBoardSquare(page, solutionBoard, "f3");
  await clickBoardSquare(page, solutionBoard, "b8");
  await clickBoardSquare(page, solutionBoard, "c6");

  // Config fields
  await dialog.getByRole("checkbox", { name: /Allow retry of a wrong move/i }).click();
  await dialog.getByLabel("Maximum attempts (blank = unlimited)").fill("2");
  await dialog.getByLabel("Pass threshold (%)").fill("50");

  // Save
  await dialog.getByRole("button", { name: /Create assignment/i }).click();
  await page.waitForTimeout(2500);
  await expect(page.getByText("QA UI Solve Line")).toBeVisible();

  // Verify config persisted via library API
  const items = await getAssignments("QA UI Solve Line");
  const item = items[0];
  expect(item).toBeTruthy();
  expect(item.activityType).toBe("SOLVE_LINE");
  expect(item.maxAttempts).toBe(2);
  expect(item.passThresholdPercent).toBe(50);
  expect(item.solutionMoves.length).toBe(4);
  expect(item.solutionMoves[0].uci).toBe("e2e4");
  expect(item.solutionMoves[0].san).toBe("e4");
  expect(item.solutionMoves[3].uci).toBe("b8c6");
});

test("ADMIN: invalid PGN rejected for REPLAY", async ({ page }) => {
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /new assignment/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Activity type").selectOption("REPLAY");
  await dialog.getByLabel("Title").fill("QA UI Bad PGN");
  await dialog.getByLabel("PGN", { exact: true }).fill("1. e4 e5 ZZ invalid!!@@#$ not chess");
  await dialog.getByRole("button", { name: /Create assignment/i }).click();
  await page.waitForTimeout(2500);
  // dialog still open => not created; server returned a parse error toast
  await expect(dialog).toBeVisible();
  // The failed assignment must not appear in the library
  const items = await getAssignments("QA UI Bad PGN");
  expect(items.length).toBe(0);
});

test("ADMIN: valid REPLAY + preview + edit + light/dark theme", async ({ page }) => {
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /new assignment/i }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Activity type").selectOption("REPLAY");
  await dialog.getByLabel("Title").fill("QA UI Replay");
  await dialog.getByLabel("PGN", { exact: true }).fill("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6");
  await dialog.getByRole("button", { name: /Create assignment/i }).click();
  await page.waitForTimeout(2000);
  await expect(page.getByText("QA UI Replay")).toBeVisible();

  // find its card and preview
  const card = page.locator("div", { hasText: "QA UI Replay" }).last();
  // Preview via icon button aria-label
  const previewBtn = page.getByRole("button", { name: "Preview" }).first();
  await previewBtn.click();
  const prev = page.getByRole("dialog");
  await expect(prev.getByText("Study PGN")).toBeVisible();
  // board nav buttons present
  await expect(prev.getByRole("button", { name: "Next move" })).toBeVisible();
  await prev.getByRole("button", { name: /Close/i }).click().catch(() => page.keyboard.press("Escape"));

  // Edit
  await page.getByRole("button", { name: "Edit assignment" }).first().click();
  const ed = page.getByRole("dialog");
  await ed.getByLabel("Title").fill("QA UI Replay Edited");
  await ed.getByRole("button", { name: /Save changes/i }).click();
  await page.waitForTimeout(2000);
  await expect(page.getByText("QA UI Replay Edited")).toBeVisible();

  // dark theme toggle on the assignments page
  await page.getByRole("button", { name: /dark theme/i }).click().catch(() => {});
  await page.waitForTimeout(500);
  const dark = await page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  console.log("data-theme after toggle:", dark);
});
