import { Injectable } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID, SUPPORT_DEMO_SLOTS_MAX, type SupportDemoSlot } from "@nexa-chess/types";
import { ClassStatus, TenantDomainStatus } from "@prisma/client";
import { DEFAULT_TIME_ZONE } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";
import { requireTenantId } from "../tenancy/tenant-sql";

/** A slot starting sooner than this isn't offered: the parent needs time to get ready. */
export const SUPPORT_DEMO_SLOT_LEAD_MS = 60 * 60_000;
/** How far ahead slots are offered. */
export const SUPPORT_DEMO_SLOT_HORIZON_MS = 14 * 24 * 60 * 60_000;

/** "Tue 18 Nov, 5:00 pm" in the schedule's own zone: fits a 24-character list row. */
export function supportSlotTitle(startsAt: Date, timeZone: string): string {
  const zone = (() => {
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone }).format(0);
      return timeZone;
    } catch {
      return DEFAULT_TIME_ZONE;
    }
  })();
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    hour: "numeric",
    hour12: true,
    minute: "2-digit",
    month: "short",
    timeZone: zone,
    weekday: "short"
  }).formatToParts(startsAt);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

/**
 * The demo classes the WhatsApp bot may offer, and where their join links
 * point (docs/WHATSAPP_SUPPORT_MODES_PLAN.md Phase C). Occurrences of the
 * academy's active demo schedules only: a one-off demo class an admin made for
 * a particular family is never offered to strangers.
 */
@Injectable()
export class SupportDemoSlotsService {
  private readonly env = getApiEnv();

  constructor(private readonly prisma: PrismaService) {}

  /** Call inside the academy. */
  async upcoming(now: Date): Promise<SupportDemoSlot[]> {
    const classes = await this.prisma.coachClass.findMany({
      include: { demoSchedule: { select: { timezone: true } } },
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: SUPPORT_DEMO_SLOTS_MAX,
      where: {
        demoSchedule: { isActive: true, isDeleted: false },
        isDemo: true,
        startsAt: { gte: new Date(now.getTime() + SUPPORT_DEMO_SLOT_LEAD_MS), lte: new Date(now.getTime() + SUPPORT_DEMO_SLOT_HORIZON_MS) },
        status: ClassStatus.SCHEDULED
      }
    });
    return classes.map((demoClass) => ({
      id: demoClass.id,
      title: supportSlotTitle(demoClass.startsAt, demoClass.demoSchedule?.timezone ?? DEFAULT_TIME_ZONE),
      ...(demoClass.topic ? { description: demoClass.topic } : {})
    }));
  }

  /**
   * The academy's web address for links in WhatsApp messages: Nexa's own for
   * Nexa, else the academy's primary active domain. Null when it has none (a
   * Nexa link would open the wrong academy).
   */
  async academyOrigin(): Promise<string | null> {
    const tenantId = requireTenantId("support links");
    const frontend = getFrontendUrl(this.env);
    if (tenantId === DEFAULT_TENANT_ID) return frontend;
    const domain = await asPlatform("support:academy-origin", () =>
      this.prisma.tenantDomain.findFirst({
        orderBy: [{ isPrimary: "desc" }, { hostname: "asc" }],
        select: { hostname: true },
        where: { status: TenantDomainStatus.ACTIVE, tenantId }
      })
    );
    if (!domain) return null;
    return `${frontend.startsWith("http://") ? "http" : "https"}://${domain.hostname}`;
  }
}
