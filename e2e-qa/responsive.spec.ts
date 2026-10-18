import { test, expect, type Page } from "@playwright/test";
import { login, USERS } from "./_login";

async function noHorizOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

test("THEME: light <-> dark toggle persists data-theme on admin assignments", async ({ page }) => {
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");
  // find the theme toggle (aria-label contains "theme")
  const toggle = page.getByRole("button", { name: /theme/i }).first();
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  // The choice survives a reload.
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  await toggle.click();
  await expect(html).toHaveAttribute("data-theme", "light");
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
    const box = await dialog.boundingBox();
    expect(box, "dialog has a layout box").not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
  });
}
