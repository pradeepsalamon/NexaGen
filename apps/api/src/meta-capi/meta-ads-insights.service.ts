import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { currentTenantId } from "../tenancy/tenant-context";

const GRAPH_BASE = "https://graph.facebook.com";
const TIMEOUT_MS = 15_000;
/** Insights pages followed per request (500 ads each). */
const MAX_PAGES = 20;
/** Spend for a range is fetched at most this often (the report is read many times a day). */
export const AD_SPEND_CACHE_MS = 6 * 60 * 60_000;

/** One ad's spend over a range, in the ad account's currency. */
export type AdSpend = { adId: string; campaignName: string | null; spendMinor: number };
export type AdSpendReport = { ads: AdSpend[]; currency: string; totalMinor: number };

type InsightsPage = {
  data?: { account_currency?: unknown; ad_id?: unknown; campaign_name?: unknown; spend?: unknown }[];
  error?: { message?: unknown };
  paging?: { next?: unknown };
};

/** "123.45" (major units) → 12345. */
export function spendToMinor(spend: unknown): number {
  const value = typeof spend === "string" ? Number(spend) : typeof spend === "number" ? spend : NaN;
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
}

/**
 * Meta ad spend for the funnel report (docs/AD_MEASUREMENT.md "Funnel report"): read-only Marketing
 * API Insights at ad level for a date range, cached for six hours per range. Never writes to Meta.
 * Nexa's academy only; off unless META_ADS_ACCESS_TOKEN and META_AD_ACCOUNT_ID are set. Dates are
 * the ad account's days (Meta's own time zone setting).
 */
@Injectable()
export class MetaAdsInsightsService {
  private readonly logger = new Logger(MetaAdsInsightsService.name);
  private readonly cache = new Map<string, { at: number; report: AdSpendReport }>();

  /** Null = off. A method so tests can switch it on. */
  config(): { accessToken: string; accountId: string; apiVersion: string } | null {
    const env = getApiEnv();
    if (!env.META_ADS_ACCESS_TOKEN || !env.META_AD_ACCOUNT_ID) return null;
    const digits = env.META_AD_ACCOUNT_ID.replace(/^act_/, "");
    return { accessToken: env.META_ADS_ACCESS_TOKEN, accountId: `act_${digits}`, apiVersion: env.META_GRAPH_API_VERSION };
  }

  /** The HTTP call; a method so tests replace it (no test ever reaches Meta). */
  async get(url: string, init: RequestInit): Promise<Response> {
    return fetch(url, init);
  }

  /** Spend per ad between two days (both included), or null when off or not Nexa's academy. Throws on Meta errors. */
  async spend(from: string, to: string, now = Date.now()): Promise<AdSpendReport | null> {
    const config = this.config();
    if (!config || currentTenantId() !== DEFAULT_TENANT_ID) return null;
    const key = `${from}:${to}`;
    const cached = this.cache.get(key);
    if (cached && now - cached.at < AD_SPEND_CACHE_MS) return cached.report;

    const params = new URLSearchParams({
      fields: "ad_id,campaign_name,spend,account_currency",
      level: "ad",
      limit: "500",
      time_range: JSON.stringify({ since: from, until: to })
    });
    let url: string | null = `${GRAPH_BASE}/${encodeURIComponent(config.apiVersion)}/${config.accountId}/insights?${params.toString()}`;
    const ads: AdSpend[] = [];
    let currency = "INR";
    for (let page = 0; url && page < MAX_PAGES; page += 1) {
      const res = await this.get(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${config.accessToken}` },
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      const json = (await res.json().catch(() => null)) as InsightsPage | null;
      if (!res.ok) {
        const detail = typeof json?.error?.message === "string" ? `: ${json.error.message}` : "";
        throw new Error(`Meta answered ${res.status}${detail}`);
      }
      for (const row of json?.data ?? []) {
        if (typeof row.ad_id !== "string") continue;
        if (typeof row.account_currency === "string") currency = row.account_currency;
        ads.push({ adId: row.ad_id, campaignName: typeof row.campaign_name === "string" ? row.campaign_name : null, spendMinor: spendToMinor(row.spend) });
      }
      // Only follow Meta's own next page.
      const next = json?.paging?.next;
      url = typeof next === "string" && next.startsWith(`${GRAPH_BASE}/`) ? next : null;
    }
    const report = { ads, currency, totalMinor: ads.reduce((sum, ad) => sum + ad.spendMinor, 0) };
    this.cache.set(key, { at: now, report });
    if (this.cache.size > 50) this.cache.delete(this.cache.keys().next().value as string);
    this.logger.log(`Read Meta ad spend ${from}..${to}: ${ads.length} ads.`);
    return report;
  }
}
