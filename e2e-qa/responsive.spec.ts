import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./_login";

async function noHorizOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test("THEME: light <-> dark toggle persists data-theme on admin assignments", async ({ page }) => {
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");
  const theme = () => page.evaluate(() => document.documentElement.getAttribute("data-theme"));
  expect(await theme()).toBe("light");
  // find the theme toggle (aria-label contains "theme")
  const toggle = page.getByRole("button", { name: /theme/i });
  await toggle.first().click();
  await page.waitForTimeout(700);
  expect(await theme()).toBe("dark");
  await toggle.first().click();
  await page.waitForTimeout(700);
  expect(await theme()).toBe("light");
});

for (const vp of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`RESPONSIVE ${vp.name}: assignment screens have no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await login(page, USERS.admin.email, USERS.admin.password);
    await page.goto("/admin/assignments");
    await page.waitForLoadState("networkidle");
    expect(await noHorizOverflow(page)).toBe(true);
    // new-assignment dialog opens and is within viewport (mobile: still usable)
    await page.getByRole("button", { name: /new assignment/i }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    expect(await noHorizOverflow(page)).toBe(true);
  });
}
