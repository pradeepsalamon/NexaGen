import { test, expect } from "@playwright/test";
import { login, USERS } from "./_login";

test("login + admin assignments page loads", async ({ page }) => {
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveTitle(/.*/);
  await page.waitForTimeout(1500);
  console.log("URL:", page.url());
  const body = await page.locator("body").innerText();
  console.log("BODY_PREVIEW:", body.slice(0, 500).replace(/\n+/g, " | "));
});
