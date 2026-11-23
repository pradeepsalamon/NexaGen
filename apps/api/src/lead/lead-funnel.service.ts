import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  LEAD_FUNNEL_MAX_DAYS,
  leadFunnelQuerySchema,
  leadFunnelReach,
  type LeadFunnelResponse,
  type LeadFunnelRow
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { DEFAULT_TIME_ZONE, zonedDateToUtc } from "../common/time";
import { MetaAdsInsightsService, type AdSpendReport } from "../meta-capi/meta-ads-insights.service";
import { PrismaService } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";

const DAY_MS = 24 * 60 * 60_000;
/** Leads read per query while counting (the report lists groups, not leads). */
const BATCH = 1000;
/** Shown for a lead with no recorded source. */
const NO_SOURCE = "Unknown";

type Group = LeadFunnelRow & { adIds: Set<string> };

function ymdParts(ymd: string): [number, number, number] {
  const [year, month, day] = ymd.split("-").map(Number);
  return [year, month, day];
}

/** The next calendar day of a YYYY-MM-DD (UTC arithmetic on the date alone). */
function nextDay(ymd: string): string {
  const [year, month, day] = ymdParts(ymd);
  return new Date(Date.UTC(year, month - 1, day) + DAY_MS).toISOString().slice(0, 10);
}

const sumSpend = (ads: AdSpendReport["ads"]) => ads.reduce((sum, ad) => sum + ad.spendMinor, 0);

/**
 * Shares Meta's spend out over the rows, each ad counted once (null = nothing matched):
 *
 * - A WhatsApp ad row gets the ads its leads came from (by ad id).
 * - A website row gets its campaign's ads by name (utm_campaign = the Meta campaign's name),
 *   leaving out ads a WhatsApp row already took. Several rows with one campaign (say instagram and
 *   facebook) split that spend by their leads, so the column adds up.
 */
export function allocateSpend(groups: { adIds: Set<string>; campaign: string | null; leads: number; spendMinor: number | null }[], report: AdSpendReport): void {
  const taken = new Set<string>();
  for (const group of groups) {
    if (group.adIds.size === 0) continue;
    const ads = report.ads.filter((ad) => group.adIds.has(ad.adId));
    group.spendMinor = ads.length > 0 ? sumSpend(ads) : null;
    for (const ad of ads) taken.add(ad.adId);
  }
  const byCampaign = new Map<string, typeof groups>();
  for (const group of groups) {
    if (group.adIds.size > 0) continue;
    group.spendMinor = null;
    const campaign = group.campaign?.trim().toLowerCase();
    if (!campaign) continue;
    byCampaign.set(campaign, [...(byCampaign.get(campaign) ?? []), group]);
  }
  for (const [campaign, rows] of byCampaign) {
    const ads = report.ads.filter((ad) => !taken.has(ad.adId) && ad.campaignName?.trim().toLowerCase() === campaign);
    if (ads.length === 0) continue;
    const total = sumSpend(ads);
    const leads = rows.reduce((sum, row) => sum + row.leads, 0);
    let left = total;
    rows.forEach((row, index) => {
      const share = index === rows.length - 1 ? left : Math.round((total * row.leads) / leads);
      row.spendMinor = share;
      left -= share;
    });
  }
}

/**
 * Admin Leads → Funnel (docs/AD_MEASUREMENT.md "Funnel report"): for leads created between two
 * days in the academy's time zone, how many booked a demo, attended and enrolled
 * (`leadFunnelReach`), by source and campaign, with Meta ad spend when it is configured.
 */
@Injectable()
export class LeadFunnelService {
  constructor(
    private readonly insights: MetaAdsInsightsService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async report(accessToken: string | undefined, rawQuery: Record<string, unknown>): Promise<LeadFunnelResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage leads.");
    }
    const query = parseOrBadRequest(leadFunnelQuerySchema, { from: rawQuery.from, to: rawQuery.to }, "query");
    const [fy, fm, fd] = ymdParts(query.from);
    const [ty, tm, td] = ymdParts(query.to);
    const days = Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS) + 1;
    if (days > LEAD_FUNNEL_MAX_DAYS) throw new BadRequestException(`query: at most ${LEAD_FUNNEL_MAX_DAYS} days at a time.`);

    const tenant = await this.prisma.tenant.findUnique({ select: { timezone: true }, where: { id: requireTenantId("leadFunnel") } });
    const timeZone = tenant?.timezone || DEFAULT_TIME_ZONE;
    const start = zonedDateToUtc(timeZone, fy, fm, fd);
    const end = zonedDateToUtc(timeZone, ...ymdParts(nextDay(query.to)));

    const groups = new Map<string, Group>();
    let cursor: string | undefined;
    for (;;) {
      const leads = await this.prisma.lead.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: { id: "asc" },
        select: {
          adClick: { select: { firstAdId: true } },
          campaign: true,
          convertedAt: true,
          demoRegistrations: { select: { joinedAt: true } },
          id: true,
          source: true,
          status: true
        },
        take: BATCH,
        where: { createdAt: { gte: start, lt: end } }
      });
      for (const lead of leads) {
        const source = lead.source?.trim() || NO_SOURCE;
        const campaign = lead.campaign?.trim() || null;
        const key = `${source}\u0000${campaign ?? ""}`;
        let group = groups.get(key);
        if (!group) {
          group = { adIds: new Set(), campaign, demoAttended: 0, demoBooked: 0, enrolled: 0, leads: 0, source, spendMinor: null };
          groups.set(key, group);
        }
        const reach = leadFunnelReach({
          attendedDemo: lead.demoRegistrations.some((registration) => registration.joinedAt !== null),
          bookedDemo: lead.demoRegistrations.length > 0,
          convertedAt: lead.convertedAt,
          status: lead.status
        });
        group.leads += 1;
        if (reach.booked) group.demoBooked += 1;
        if (reach.attended) group.demoAttended += 1;
        if (reach.enrolled) group.enrolled += 1;
        if (lead.adClick?.firstAdId) group.adIds.add(lead.adClick.firstAdId);
      }
      if (leads.length < BATCH) break;
      cursor = leads[leads.length - 1].id;
    }

    let spend: LeadFunnelResponse["spend"] = null;
    try {
      const report = await this.insights.spend(query.from, query.to);
      if (report) {
        spend = { currency: report.currency, error: null, totalMinor: report.totalMinor };
        allocateSpend([...groups.values()], report);
      }
    } catch (error) {
      // The funnel still shows; only the spend columns say why they're empty.
      spend = { currency: "INR", error: (error as Error).message.slice(0, 200), totalMinor: 0 };
    }

    const rows = [...groups.values()]
      .map(({ adIds: _adIds, ...row }) => row)
      .sort((a, b) => b.leads - a.leads || a.source.localeCompare(b.source) || (a.campaign ?? "").localeCompare(b.campaign ?? ""));
    const totals = rows.reduce(
      (sum, row) => ({
        demoAttended: sum.demoAttended + row.demoAttended,
        demoBooked: sum.demoBooked + row.demoBooked,
        enrolled: sum.enrolled + row.enrolled,
        leads: sum.leads + row.leads,
        spendMinor: spend && !spend.error ? spend.totalMinor : null
      }),
      { demoAttended: 0, demoBooked: 0, enrolled: 0, leads: 0, spendMinor: null as number | null }
    );
    return { from: query.from, rows, spend, timeZone, to: query.to, totals };
  }
}
