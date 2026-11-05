import { test, expect } from "@playwright/test";

/**
 * White label (docs/SAAS_MULTI_TENANCY.md §F "Nexa disappears everywhere"):
 * a second academy's own address shows no "Nexa" anywhere a visitor sees.
 *
 * Opt-in (needs a real academy host, which this box doesn't have until the
 * wildcard DNS + certificate in docs/DEPLOYMENT.md Step 4c exist):
 *   1. an academy on a plan with `whiteLabel`, its address ACTIVE
 *   2. RUN_WHITE_LABEL_E2E=1 ACADEMY_BASE_URL=https://<slug>.nexachess.in npx playwright test white-label
 */

const RUN = process.env.RUN_WHITE_LABEL_E2E === "1";
const BASE = process.env.ACADEMY_BASE_URL ?? "";
const NEXA = /nexa/i;

test.describe("white label", () => {
  test.skip(!RUN || !BASE, "RUN_WHITE_LABEL_E2E=1 and ACADEMY_BASE_URL are required");

  for (const path of ["/", "/login", "/forgot-password", "/register"]) {
    test(`${path} shows no Nexa branding`, async ({ page }) => {
      await page.goto(`${BASE}${path}`);
      await page.waitForLoadState("networkidle");
      // What a person sees: visible text, the tab title and image alt text.
      const visible = await page.evaluate(() => document.body.innerText);
      expect(visible).not.toMatch(NEXA);
      expect(await page.title()).not.toMatch(NEXA);
      const alts = await page.locator("img:visible").evaluateAll((images) => images.map((image) => image.getAttribute("alt") ?? ""));
      expect(alts.join(" ")).not.toMatch(NEXA);
    });
  }
});
