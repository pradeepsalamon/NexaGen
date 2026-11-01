import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { API_URL, cookieHeader, login, type Cookie } from "./fixtures";

/**
 * PDF chess-diagram import — the real browser pipeline: pdf.js renders each
 * fixture page, the recognizer reads it, the coach reviews, confirms and uses
 * the position.
 *
 * Opt-in (saves a draft puzzle and a Game Library import as the seeded coach):
 *   1. api + web running against a throwaway DB, seed applied (npm run db:seed)
 *   2. RUN_DIAGRAM_IMPORT_E2E=1 E2E_BASE_URL=http://localhost:3100 \
 *      NEXT_PUBLIC_API_URL=http://localhost:3101 npx playwright test diagram-import
 *
 * Fixtures: e2e/fixtures/diagram-import (scripts/diagram-import/generate-fixtures.mjs).
 * They are drawn with the app's own piece sets, so passing here says the
 * pipeline works — not that every book font will be read correctly.
 */

const RUN = process.env.RUN_DIAGRAM_IMPORT_E2E === "1";
const FIXTURES = join(__dirname, "fixtures/diagram-import");
const expected = JSON.parse(readFileSync(join(FIXTURES, "expected.json"), "utf8")) as Record<
  string,
  { diagrams?: { fen: string; orientation: string; sideToMove: string | null }[] }
>;

// Fake camera/microphone for the live-classroom test (harmless for the rest).
test.use({ launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] } });

const placementOf = (fen: string) => fen.split(" ")[0];

async function upload(page: Page, file: string) {
  await page.getByTestId("diagram-pdf-input").setInputFiles(join(FIXTURES, file));
}

async function scan(page: Page, from: number, to: number) {
  await page.getByTestId("diagram-from").fill(String(from));
  await page.getByTestId("diagram-to").fill(String(to));
  await page.getByTestId("diagram-scan").click();
  await expect(page.getByTestId("diagram-scan")).toHaveText(/Scan for diagrams/, { timeout: 60_000 });
}

async function fen(page: Page) {
  return page.getByTestId("diagram-fen").inputValue();
}

const ROLE: Record<string, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const expandPlacement = (pl: string) =>
  pl
    .split("/")
    .map((r) => r.replace(/\d/g, (n) => ".".repeat(Number(n))))
    .join("");
const squareName = (i: number) => `${"abcdefgh"[i % 8]}${8 - (i >> 3)}`;

/** Centre of a square on the review board. */
async function squareAt(page: Page, square: string, orientation: "white" | "black") {
  // Board and both spare trays on screen, as a coach would have them.
  await page.getByTestId("position-editor-board").evaluate((el) => el.scrollIntoView({ block: "center" }));
  const box = (await page.getByTestId("position-editor-board").boundingBox()) as { x: number; y: number; width: number; height: number };
  const file = "abcdefgh".indexOf(square[0]);
  const rank = Number(square[1]);
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 8 - rank : rank - 1;
  return { x: box.x + (col + 0.5) * (box.width / 8), y: box.y + (row + 0.5) * (box.height / 8), box };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

/**
 * The recognizer may misread a square; that is what review is for. Every
 * misread square must be listed under "Check these squares" — then the coach
 * fixes it on the board (drag the wrong piece off, drag the right one in from
 * the spare tray). Returns the squares that needed fixing.
 */
async function reviewAndCorrect(page: Page, want: string, orientation: "white" | "black" = "white") {
  const got = expandPlacement(placementOf(await fen(page)));
  const target = expandPlacement(want);
  const wrong = [...Array(64).keys()].filter((i) => got[i] !== target[i]).map(squareName);
  if (wrong.length > 0) {
    const doubts = await page.getByText(/The recognizer was unsure about/).innerText();
    for (const sq of wrong) expect(doubts, `misread ${sq} was not flagged`).toContain(sq);
  }
  for (const sq of wrong) {
    const i = [...Array(64).keys()].find((k) => squareName(k) === sq) as number;
    const at = await squareAt(page, sq, orientation);
    if (got[i] !== ".") await drag(page, at, { x: at.box.x + at.box.width + 150, y: at.y });
    if (target[i] !== ".") {
      const piece = target[i];
      const spare = page.locator(`[data-spare-piece="${piece === piece.toUpperCase() ? "white" : "black"}-${ROLE[piece.toLowerCase()]}"]`);
      const sb = (await spare.boundingBox()) as { x: number; y: number; width: number; height: number };
      await drag(page, { x: sb.x + sb.width / 2, y: sb.y + sb.height / 2 }, at);
    }
  }
  await expect.poll(async () => placementOf(await fen(page))).toBe(want);
  return wrong;
}

test.describe("PDF diagram import", () => {
  test.skip(!RUN, "opt-in: RUN_DIAGRAM_IMPORT_E2E=1 against a throwaway stack");
  test.describe.configure({ mode: "serial" });
  // Wide enough that the coach sidebar is docked, not a drawer over the page.
  test.use({ viewport: { width: 1600, height: 1000 } });

  let cookies: Cookie[] = [];

  // One login for the serial suite: /auth/login is throttled 5/min.
  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext();
    cookies = await login(request, "coach");
    await request.dispose();
  });

  test.beforeEach(async ({ context, page }) => {
    await context.addCookies(cookies);
    await page.goto("/coach/puzzles/import-pdf");
    await expect(page.getByRole("heading", { name: "Import chess diagrams from a PDF" })).toBeVisible();
    // The mouse starts at (0, 0), on the edge that slides the sidebar drawer open.
    await page.mouse.move(1000, 500);
  });

  test("rejects files that are not usable PDFs, with a reason", async ({ page }) => {
    for (const [file, message] of [
      ["not-a-pdf.pdf", /not a PDF/],
      ["encrypted.pdf", /password-protected/],
      ["malformed.pdf", /damaged/],
    ] as const) {
      await upload(page, file);
      await expect(page.getByTestId("diagram-file-error")).toContainText(message);
    }
  });

  test("a PDF without diagrams ends in an empty state", async ({ page }) => {
    await upload(page, "no-diagrams.pdf");
    await scan(page, 1, 1);
    await expect(page.getByText("No diagrams found")).toBeVisible();
  });

  test("book page: two diagrams, coordinates and captions read, unknown fields asked, confirmed, saved as a draft", async ({
    page,
  }) => {
    const [italian, tactic] = expected["book-two-diagrams.pdf"].diagrams ?? [];
    await upload(page, "book-two-diagrams.pdf");
    await scan(page, 1, 2);
    // Two boards on page 1; the 8×8 table on page 2 is not one.
    await expect(page.getByTestId("diagram-candidate")).toHaveCount(2);

    // Diagram 1: orientation from coordinates, "White to move" from the caption,
    // any misread square flagged and corrected by hand.
    await page.getByTestId("diagram-candidate").first().click();
    const corrected = await reviewAndCorrect(page, placementOf(italian.fen));
    await expect(page.getByText("Read from the printed coordinates.")).toBeVisible();
    await expect(page.getByText('From the caption: "White to move".')).toBeVisible();
    // Castling and the counters are never assumed.
    await expect(page.getByTestId("diagram-status")).toHaveText("Needs review");
    await expect(page.getByTestId("diagram-pending")).toContainText("castling");
    await expect(page.getByRole("button", { name: "Confirm position" })).toBeDisabled();

    await page.getByRole("radio", { name: "Choose" }).check();
    for (const label of ["White O-O", "White O-O-O", "Black O-O", "Black O-O-O"]) {
      await page.getByLabel(label, { exact: true }).click();
    }
    await page.getByLabel(/Use these: en passant none/).click();
    await expect(page.getByTestId("diagram-status")).toHaveText("Valid candidate");
    expect(await fen(page)).toBe(italian.fen);
    await page.getByRole("button", { name: "Confirm position" }).click();
    await expect(page.getByTestId("diagram-status")).toHaveText("Confirmed by coach");

    // Diagram 2: "Black to play" from its caption.
    await page.getByTestId("diagram-candidate").nth(1).click();
    await reviewAndCorrect(page, placementOf(tactic.fen));
    await expect(page.getByText('From the caption: "Black to play".')).toBeVisible();
    expect((await fen(page)).split(" ")[1]).toBe("b");

    // Back to diagram 1 → save into the library through the normal puzzle form.
    await page.getByTestId("diagram-candidate").first().click();
    await page.getByTestId("diagram-save-library").click();
    await page.waitForURL(/\/coach\/puzzles\/new\?from=pdf/);
    await expect(page.getByText("Position imported from a PDF diagram")).toBeVisible();
    await expect(page.locator("#pz-title")).toHaveValue("book-two-diagrams — p.1 #1");
    await expect(page.locator("#pz-description")).toHaveValue(
      corrected.length > 0
        ? 'Imported from "book-two-diagrams.pdf", page 1, diagram 1 (corrected by coach).'
        : 'Imported from "book-two-diagrams.pdf", page 1, diagram 1.',
    );
    const topic = page.locator("#pz-topic");
    const firstTopic = await topic.locator("option").nth(1).getAttribute("value");
    await topic.selectOption(firstTopic as string);
    await page.getByRole("button", { name: "Save draft" }).click();
    await page.waitForURL(/\/coach\/puzzles\/[^/]+$/);

    // Saved as a DRAFT with the confirmed FEN — never published by the import.
    const res = await page.request.get(`${API_URL}/puzzles?placement=${encodeURIComponent(placementOf(italian.fen))}`, {
      headers: { Cookie: (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = await res.json();
    const mine = body.puzzles.filter((p: { title: string }) => p.title === "book-two-diagrams — p.1 #1");
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("DRAFT");
    expect(mine[0].visibility).toBe("PRIVATE");
  });

  test("importing the same diagram again warns about the existing puzzle", async ({ page }) => {
    const [italian] = expected["book-two-diagrams.pdf"].diagrams ?? [];
    await upload(page, "book-two-diagrams.pdf");
    await scan(page, 1, 1);
    await page.getByTestId("diagram-candidate").first().click();
    await reviewAndCorrect(page, placementOf(italian.fen));
    await page.getByRole("radio", { name: "None" }).check();
    await page.getByLabel(/Use these: en passant none/).click();
    await page.getByRole("button", { name: "Confirm position" }).click();
    await page.getByTestId("diagram-save-library").click();
    await expect(page.getByText("This position is already in your library")).toBeVisible();
    await expect(page.getByRole("link", { name: "book-two-diagrams — p.1 #1" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/import-pdf/);
  });

  test("a board printed from Black's side is turned round from its coordinates", async ({ page }) => {
    const [d] = expected["flipped-gray.pdf"].diagrams ?? [];
    await upload(page, "flipped-gray.pdf");
    await scan(page, 1, 1);
    await expect(page.getByTestId("diagram-candidate")).toHaveCount(1);
    await page.getByTestId("diagram-candidate").first().click();
    await expect(page.getByRole("radio", { name: "Black" }).first()).toBeChecked();
    await reviewAndCorrect(page, placementOf(d.fen), "black");
    // No caption: the side to move stays unanswered.
    await expect(page.getByText("Not shown in the diagram — choose one.")).toBeVisible();
  });

  test("a scan has no text layer: orientation is only a suggestion; a correction changes the FEN and Reset undoes it", async ({
    page,
  }) => {
    const [d] = expected["scanned-page.pdf"].diagrams ?? [];
    await upload(page, "scanned-page.pdf");
    await scan(page, 1, 1);
    await page.getByTestId("diagram-candidate").first().click();
    await expect(page.getByText(/Suggested from the pawns/)).toBeVisible();
    await expect(page.getByTestId("diagram-pending")).toContainText("Confirm which side is at the bottom");

    // A hand correction changes the FEN; Reset goes back to what was recognized.
    const recognized = placementOf(await fen(page));
    expect(expandPlacement(recognized)[59]).toBe("Q"); // d1
    await drag(page, await squareAt(page, "d1", "white"), await squareAt(page, "d2", "white"));
    const moved = expandPlacement(recognized).split("");
    moved[51] = "Q";
    moved[59] = ".";
    const movedPlacement = Array.from({ length: 8 }, (_, r) => moved.slice(r * 8, r * 8 + 8).join("").replace(/\.+/g, (m) => String(m.length))).join("/");
    await expect.poll(async () => placementOf(await fen(page))).toBe(movedPlacement);
    await page.getByRole("button", { name: "Reset" }).click();
    await expect.poll(async () => placementOf(await fen(page))).toBe(recognized);
    await reviewAndCorrect(page, placementOf(d.fen));

    // Answer everything → confirm → open on the analysis board (a private Game Library import).
    await page.getByRole("radio", { name: "White" }).first().check();
    await page.getByRole("radio", { name: "White" }).nth(1).check();
    // Both kings have castled: nothing to ask, and nothing assumed either.
    await expect(page.getByText("None possible — no king and rook stand on their home squares.")).toBeVisible();
    await page.getByLabel(/Use these: en passant none/).click();
    await page.getByRole("button", { name: "Confirm position" }).click();
    expect(await fen(page)).toBe(`${placementOf(d.fen)} w - - 0 1`);
    await page.getByRole("button", { name: "Open on analysis board" }).click();
    await page.waitForURL(/\/games\/[^/]+$/);
    await expect(page.getByText("scanned-page — p.1 #1")).toBeVisible();
  });

  // generate-jpx-fixture.py: the scanned-page.pdf page, stored as JPEG2000.
  test("a JPEG2000 scan is decoded and read like any other scan", async ({ page }) => {
    const [d] = expected["scanned-page.pdf"].diagrams ?? [];
    await upload(page, "scanned-jpeg2000.pdf");
    await scan(page, 1, 1);
    await page.getByTestId("diagram-candidate").first().click();
    // This proves the page was decoded, not that the read is perfect: lossy
    // compression costs a few squares, which the coach reviews as usual.
    const got = expandPlacement(placementOf(await fen(page)));
    const want = expandPlacement(placementOf(d.fen));
    const right = [...want].filter((square, i) => got[i] === square).length;
    expect(right).toBeGreaterThanOrEqual(56);
  });

  test("a scan whose image can't be decoded is reported, not called empty", async ({ page }) => {
    await page.route("**/vendor/pdfjs/wasm/**", (route) => route.abort());
    await upload(page, "scanned-jpeg2000.pdf");
    await scan(page, 1, 1);
    await expect(page.getByText("1 page could not be read")).toBeVisible();
    await expect(page.getByText(/scanned image that could not be decoded/)).toBeVisible();
    await expect(page.getByText("Nothing could be read")).toBeVisible();
    await expect(page.getByText("No diagrams found")).toBeHidden();
  });

  test("an impossible position cannot be confirmed", async ({ page }) => {
    await upload(page, "book-two-diagrams.pdf");
    await scan(page, 1, 1);
    await page.getByTestId("diagram-candidate").first().click();
    // Remove the white king (drag it off the board): hard error, no confirm.
    const e1 = await squareAt(page, "e1", "white");
    await drag(page, e1, { x: e1.box.x + e1.box.width + 150, y: e1.y });
    await expect(page.getByText("White has no king.")).toBeVisible();
    await expect(page.getByTestId("diagram-status")).toHaveText("Invalid position");
    await expect(page.getByRole("button", { name: "Confirm position" })).toBeDisabled();
  });
});

/**
 * Loading onto the live classroom board. Needs, in addition: a private LiveKit
 * the API points at, and a SCHEDULED class of the seeded coach inside its start
 * window, given as DIAGRAM_IMPORT_CLASS_ID.
 */
test.describe("PDF diagram import — live classroom", () => {
  const CLASS_ID = process.env.DIAGRAM_IMPORT_CLASS_ID;
  test.skip(!RUN || !CLASS_ID, "opt-in: also needs DIAGRAM_IMPORT_CLASS_ID + LiveKit");
  test.use({
    permissions: ["camera", "microphone"],
    viewport: { width: 1600, height: 1000 },
  });

  test("a confirmed position replaces the shared board only after a second confirmation", async ({ page, playwright, baseURL }) => {
    const request = await playwright.request.newContext();
    const cookies = await login(request, "coach");
    const headers = { Cookie: cookieHeader(cookies), Origin: baseURL as string };
    const started = await request.post(`${API_URL}/live-class/${CLASS_ID}/start`, { headers });
    expect([200, 201, 409]).toContain(started.status()); // 409 = already live
    await page.context().addCookies(cookies);

    await page.goto(`/live-class/${CLASS_ID}`);
    await page.mouse.move(1000, 500);
    const join = page.getByRole("button", { name: /^Join/i }).first();
    if (await join.isVisible({ timeout: 8_000 }).catch(() => false)) await join.click();
    await page.getByRole("button", { name: "Setup position" }).first().click();
    await page.getByRole("tab", { name: "From PDF" }).click();

    const [d] = expected["flipped-gray.pdf"].diagrams ?? [];
    await upload(page, "flipped-gray.pdf");
    await scan(page, 1, 1);
    await page.getByTestId("diagram-candidate").first().click();
    await reviewAndCorrect(page, placementOf(d.fen), "black");
    await page.getByRole("radio", { name: "White" }).nth(1).check();
    await page.getByLabel(/Use these: en passant none/).click();
    await page.getByRole("button", { name: "Confirm position" }).click();
    expect(await fen(page)).toBe(d.fen);

    // Cancelling the replace confirmation leaves the class board alone.
    await page.getByTestId("diagram-load-class").click();
    await expect(page.getByText("Replace the shared board?")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();
    await page.getByTestId("diagram-load-class").click();
    await page.getByTestId("diagram-load-class-confirm").click();
    await expect(page.getByText("Position loaded on the class board")).toBeVisible();

    // The coach's board saves the shared state (throttled to one save per 2 s).
    await expect
      .poll(
        async () => {
          const res = await request.get(`${API_URL}/live-class/${CLASS_ID}/board-state`, { headers });
          const body = await res.json().catch(() => null);
          return body?.boardState?.fen ?? body?.state?.fen ?? body?.fen ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe(d.fen);
    await request.dispose();
  });
});
