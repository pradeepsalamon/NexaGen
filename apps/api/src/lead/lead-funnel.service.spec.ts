import { DEFAULT_TENANT_ID, leadFunnelReach } from "@nexa-chess/types";
import { runInTenant } from "../tenancy/tenant-context";
import { AD_SPEND_CACHE_MS, MetaAdsInsightsService, spendToMinor } from "../meta-capi/meta-ads-insights.service";
import { allocateSpend } from "./lead-funnel.service";

describe("leadFunnelReach", () => {
  const reach = (over: Partial<Parameters<typeof leadFunnelReach>[0]>) =>
    leadFunnelReach({ attendedDemo: false, bookedDemo: false, convertedAt: null, status: "NEW", ...over });

  it("counts a lead from the facts, even after its stage moved on", () => {
    expect(reach({})).toEqual({ attended: false, booked: false, enrolled: false });
    expect(reach({ bookedDemo: true, status: "LOST" })).toEqual({ attended: false, booked: true, enrolled: false });
    expect(reach({ attendedDemo: true, bookedDemo: true, status: "FOLLOW_UP" })).toEqual({ attended: true, booked: true, enrolled: false });
    expect(reach({ convertedAt: new Date(), status: "LOST" })).toMatchObject({ enrolled: true });
  });

  it("falls back on the stage for a lead moved by hand", () => {
    expect(reach({ status: "DEMO_SCHEDULED" })).toMatchObject({ booked: true });
    expect(reach({ status: "NO_SHOW" })).toMatchObject({ attended: false, booked: true });
    expect(reach({ status: "DEMO_ATTENDED" })).toMatchObject({ attended: true, booked: true });
    expect(reach({ status: "ACTIVE_STUDENT" })).toMatchObject({ enrolled: true });
  });
});

describe("ad spend", () => {
  const report = {
    ads: [
      { adId: "a1", campaignName: "Diwali Kids", spendMinor: 1000 },
      { adId: "a2", campaignName: "Diwali Kids", spendMinor: 500 },
      { adId: "a3", campaignName: "Weekend", spendMinor: 250 }
    ],
    currency: "INR",
    totalMinor: 1750
  };

  const row = (campaign: string | null, leads: number, adIds: string[] = []) => ({ adIds: new Set(adIds), campaign, leads, spendMinor: null as number | null });

  it("matches WhatsApp ad rows by ad id and website rows by campaign name", () => {
    const rows = [row("anything", 1, ["a1", "a3"]), row(" diwali kids ", 2), row("unknown", 1), row(null, 1), row("Weekend", 1, ["zz"])];
    allocateSpend(rows, report);
    // a1 (Diwali Kids) went to the WhatsApp row, so the website row gets only a2.
    expect(rows.map((r) => r.spendMinor)).toEqual([1250, 500, null, null, null]);
  });

  it("splits one campaign's spend over its rows by their leads, so the total adds up", () => {
    const rows = [row("Diwali Kids", 3), row("diwali kids", 1)];
    allocateSpend(rows, report);
    expect(rows.map((r) => r.spendMinor)).toEqual([1125, 375]);
  });

  it("reads Meta's spend in minor units", () => {
    expect(spendToMinor("123.45")).toBe(12345);
    expect(spendToMinor("0")).toBe(0);
    expect(spendToMinor("bad")).toBe(0);
  });
});

describe("MetaAdsInsightsService", () => {
  function service(pages: Record<string, unknown>[]) {
    const svc = new MetaAdsInsightsService();
    jest.spyOn(svc, "config").mockReturnValue({ accessToken: "token", accountId: "act_42", apiVersion: "v21.0" });
    const urls: string[] = [];
    jest.spyOn(svc, "get").mockImplementation(async (url) => {
      urls.push(url);
      const body = pages[urls.length - 1] ?? { data: [] };
      return { json: async () => body, ok: !("error" in body), status: "error" in body ? 400 : 200 } as Response;
    });
    return { svc, urls };
  }

  it("reads every page of ad-level spend for the range, read-only, and caches it", async () => {
    const { svc, urls } = service([
      { data: [{ account_currency: "INR", ad_id: "a1", campaign_name: "C", spend: "10.50" }], paging: { next: "https://graph.facebook.com/v21.0/act_42/insights?after=x" } },
      { data: [{ account_currency: "INR", ad_id: "a2", campaign_name: "C", spend: "4" }] }
    ]);
    const report = await runInTenant(DEFAULT_TENANT_ID, "test", () => svc.spend("2026-11-01", "2026-11-22", 1_000));
    expect(report).toEqual({
      ads: [
        { adId: "a1", campaignName: "C", spendMinor: 1050 },
        { adId: "a2", campaignName: "C", spendMinor: 400 }
      ],
      currency: "INR",
      totalMinor: 1450
    });
    expect(urls[0]).toContain("/v21.0/act_42/insights?");
    expect(decodeURIComponent(urls[0])).toContain('time_range={"since":"2026-11-01","until":"2026-11-22"}');
    expect(urls).toHaveLength(2);

    await runInTenant(DEFAULT_TENANT_ID, "test", () => svc.spend("2026-11-01", "2026-11-22", 1_000 + AD_SPEND_CACHE_MS - 1));
    expect(urls).toHaveLength(2);
  });

  it("never follows a next link off Meta's host", async () => {
    const { svc, urls } = service([{ data: [], paging: { next: "https://evil.example/steal" } }]);
    await runInTenant(DEFAULT_TENANT_ID, "test", () => svc.spend("2026-11-01", "2026-11-02"));
    expect(urls).toHaveLength(1);
  });

  it("throws Meta's error, and is off for another academy or without config", async () => {
    const { svc } = service([{ error: { message: "Invalid OAuth access token" } }]);
    await expect(runInTenant(DEFAULT_TENANT_ID, "test", () => svc.spend("2026-11-01", "2026-11-02"))).rejects.toThrow("Meta answered 400: Invalid OAuth access token");
    await expect(runInTenant("tenant_rook", "test", () => svc.spend("2026-11-01", "2026-11-02"))).resolves.toBeNull();
    expect(new MetaAdsInsightsService().config()).toBeNull();
  });
});
