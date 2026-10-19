import { test, expect } from "@playwright/test";
import { login, USERS } from "./_login";

test("login + admin assignments page loads", async ({ page }) => {
  await login(page, USERS.admin.email, USERS.admin.password);
  await page.goto("/admin/assignments");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/admin\/assignments/);
  await expect(page.getByRole("button", { name: /new assignment/i }).first()).toBeVisible();
});
