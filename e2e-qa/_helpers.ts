import type { Page } from "@playwright/test";

/** The QA stack's API (scripts/nexa.sh serves it on :3011). */
export const API_BASE = process.env.E2E_QA_API_URL || "http://localhost:3011";

/** Logs in over the API and returns a `Cookie` header value. */
export async function apiLogin(user: { email: string; password: string }): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user),
  });
  if (!res.ok) {
    throw new Error(`API login for ${user.email} failed: ${res.status} ${await res.text()}`);
  }
  return res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}

export async function clickBoardSquare(page: Page, board: ReturnType<Page["locator"]>, square: string) {
  await board.scrollIntoViewIfNeeded();
  await board.waitFor({ state: "visible" });
  const file = square.charCodeAt(0) - 97; // 0-7
  const rank = parseInt(square[1], 10); // 1-8
  const box = await board.boundingBox();
  if (!box) throw new Error("board not found");
  const x = box.x + box.width * ((file + 0.5) / 8);
  const y = box.y + box.height * ((8 - rank + 0.5) / 8);
  await page.mouse.click(x, y);
}
