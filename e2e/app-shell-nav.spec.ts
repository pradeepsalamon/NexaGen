/**
 * App shell nav (docs/UI_RULES.md § "Role nav", docs/RESPONSIVE.md § "App shell"):
 * from `xl` the page is offset by the icon rail only, the expanded nav slides over
 * the page (which never moves), rail sections open a flyout, and below `xl` the
 * drawer is unchanged.
 *
 * Needs E2E_BASE_URL + NEXT_PUBLIC_API_URL (.env.e2e) and the seeded super admin.
 * Run: npx playwright test e2e/app-shell-nav.spec.ts
 */
import { expect, request as playwrightRequest, test, type Locator, type Page } from "@playwright/test";
import { login, type Cookie } from "./fixtures";

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];
type Rect = { height: number; width: number; x: number; y: number };

let cookies: Cookie[] = [];

test.beforeAll(async () => {
  // One login for the whole file: /auth/login allows 5 a minute.
  const context = await playwrightRequest.newContext();
  cookies = await login(context, "admin");
  await context.dispose();
});

async function open(page: Page, theme: Theme, path = "/admin") {
  await page.context().addCookies(cookies);
  await page.addInitScript((mode) => {
    window.localStorage.setItem("nexa-chess-theme", JSON.stringify({ mode, preference: mode }));
  }, theme);
  await page.goto(path);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("#nav-drawer")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("main").first()).toBeVisible({ timeout: 60_000 });
}

function rectOf(locator: Locator): Promise<Rect> {
  return locator.evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { height: r.height, width: r.width, x: r.x, y: r.y };
  });
}

const navToggle = (page: Page) => page.locator('#nav-drawer button[aria-controls="nav-drawer"]');
const navPanel = (page: Page) => page.locator("#nav-drawer").locator("..");

/** Waits until the nav card has finished sliding to its rail (64px) or expanded (256px) width. */
async function settled(page: Page, expanded: boolean) {
  await expect(navToggle(page)).toHaveAttribute("aria-expanded", String(expanded));
  await expect
    .poll(async () => Math.round((await rectOf(navPanel(page))).width))
    .toBe(expanded ? 256 : 64);
}

for (const theme of THEMES) {
  test.describe(`app shell nav (${theme})`, () => {
    for (const width of [1440, 1280]) {
      test(`expanding the nav never moves the page at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ height: 900, width });
        await open(page, theme);
        const main = page.locator("main").first();
        const logo = page.getByRole("link", { name: "Go to Dashboard" });
        await settled(page, false);

        const measure = async () => ({
          logo: await rectOf(logo),
          main: await rectOf(main),
          toggle: await rectOf(navToggle(page))
        });

        const rail = await measure();
        expect(rail.main.x).toBe(64);

        await navToggle(page).click();
        await settled(page, true);
        const expanded = await measure();

        await navToggle(page).click();
        await settled(page, false);
        const collapsed = await measure();

        console.log(`[${theme} ${width}px] main rect rail/expanded/collapsed`, JSON.stringify([rail.main, expanded.main, collapsed.main]));
        expect(expanded).toEqual(rail);
        expect(collapsed).toEqual(rail);
      });
    }

    test("the expanded nav closes on navigation, Escape and a click outside", async ({ page }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
      await open(page, theme);
      const main = page.locator("main").first();
      const before = await rectOf(main);

      // A link: navigates and puts the panel away.
      await navToggle(page).click();
      await settled(page, true);
      await page.locator("#nav-drawer").getByRole("button", { name: "People" }).click();
      await page.locator("#sidebar-submenu-people").getByRole("link", { exact: true, name: "Users" }).click();
      await page.waitForURL(/\/admin\/users$/);
      await settled(page, false);
      const after = await rectOf(main);
      expect({ width: after.width, x: after.x, y: after.y }).toEqual({ width: before.width, x: before.x, y: before.y });

      // Escape: closes, focus back on the toggle.
      await navToggle(page).click();
      await settled(page, true);
      await page.keyboard.press("Escape");
      await settled(page, false);
      await expect(navToggle(page)).toBeFocused();

      // A click outside the panel and the header.
      await navToggle(page).click();
      await settled(page, true);
      await page.mouse.click(1420, 600);
      await settled(page, false);
    });

    test("a rail section opens its flyout on hover and keeps it while the pointer moves in", async ({ page }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
      await open(page, theme);
      await settled(page, false);
      const trigger = page.locator("#nav-drawer").getByRole("button", { name: "People" });
      const flyout = page.locator("#sidebar-flyout-people");

      await trigger.hover();
      await expect(flyout).toBeVisible();
      // Into the flyout, across the gap, and wait past the close delay.
      const users = flyout.getByRole("link", { exact: true, name: "Users" });
      await users.hover();
      await page.waitForTimeout(600);
      await expect(flyout).toBeVisible();
      await expect(flyout.getByText("People", { exact: true })).toBeVisible();

      await users.click();
      await page.waitForURL(/\/admin\/users$/);
      await expect(flyout).toBeHidden();
      await expect(users).toHaveCount(0);
    });

    test("a rail section's flyout works from the keyboard", async ({ page }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
      await open(page, theme);
      await settled(page, false);
      const trigger = page.locator("#nav-drawer").getByRole("button", { name: "People" });
      const flyout = page.locator("#sidebar-flyout-people");

      await trigger.focus();
      await page.keyboard.press("Enter");
      await expect(flyout).toBeVisible();
      await expect(flyout.getByRole("link").first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(flyout.getByRole("link").nth(1)).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(flyout).toBeHidden();
      await expect(trigger).toBeFocused();

      await page.keyboard.press("ArrowRight");
      await expect(flyout).toBeVisible();
      await expect(flyout.getByRole("link").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    });

    test("a click outside closes a rail flyout", async ({ page }) => {
      await page.setViewportSize({ height: 900, width: 1440 });
      await open(page, theme);
      await settled(page, false);
      const trigger = page.locator("#nav-drawer").getByRole("button", { name: "People" });
      const flyout = page.locator("#sidebar-flyout-people");

      await trigger.click();
      await expect(flyout).toBeVisible();
      // A clicked flyout stays when the pointer leaves it...
      await page.mouse.move(900, 600);
      await page.waitForTimeout(600);
      await expect(flyout).toBeVisible();
      // ...until a click lands outside it.
      await page.mouse.click(1420, 600);
      await expect(flyout).toBeHidden();
    });

    test("phones keep the drawer (regression guard)", async ({ page }) => {
      await page.setViewportSize({ height: 844, width: 390 });
      await open(page, theme, "/admin/users");
      const html = page.locator("html");
      const openButton = page.getByRole("button", { name: "Open menu" });

      await openButton.click();
      await expect(html).toHaveAttribute("data-nav-drawer-open", "");
      // Let the 300 ms slide finish (WebKit's Linux build is slow), then tap the backdrop's
      // free right edge (it is the full-screen "Close menu" button behind the drawer).
      await page.waitForTimeout(600);
      await page.locator("button.fixed.inset-0[aria-label='Close menu']").click({ position: { x: 370, y: 420 } });
      await expect(html).not.toHaveAttribute("data-nav-drawer-open", "");

      await openButton.click();
      await expect(html).toHaveAttribute("data-nav-drawer-open", "");
      await page.locator("#nav-drawer").getByRole("link", { exact: true, name: "Dashboard" }).click();
      await page.waitForURL(/\/admin$/);
      await expect(html).not.toHaveAttribute("data-nav-drawer-open", "");

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
