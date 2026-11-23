import {
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  leadChildDetailsGiven,
  supportDemoSummary,
  type SupportDemoRequest
} from "@nexa-chess/types";
import type {
  AssignLeadDemoClassRequest,
  CreateLeadNoteRequest,
  CreateLeadRequest,
  CreateLeadResponse,
  LeadAssignableDemoClass,
  LeadDetailResponse,
  LeadListResponse,
  LeadMetricsResponse,
  PaginatedQuery,
  UpdateLeadStatusRequest
} from "@nexa-chess/types";
import {
  LeadStatus,
  Prisma,
  User,
  UserRole,
  type Lead
} from "@prisma/client";
import {
  paginationMeta,
  resolveOrderBy,
  resolvePagination
} from "../common/pagination";
import { DemoInviteService } from "../demo-class/demo-invite.service";
import { SystemNotifier } from "../mail/system-notifier.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { ReferralTrackerService } from "../referral/referral-tracker.service";
import { MetaCapiService } from "../meta-capi/meta-capi.service";
import { FrappeCrmPushService } from "./frappe-crm-push.service";
import { WHATSAPP_LEAD_REUSE_DAYS, WHATSAPP_LEAD_SOURCE } from "./lead-constants";
import { parseUserAgent, parseVisitAttribution } from "./lead-tracking.util";
import { authenticateUser } from "../auth/authenticate";
import { queryEnum } from "../common/query-params";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "status">;

const CONVERTING_STATUSES: LeadStatus[] = ["CONVERTED", "ACTIVE_STUDENT"];

/** Meta's `_fbp` cookie value: `fb.<subdomain index>.<creation ms>.<random>`. */
function isMetaFbp(value: string | undefined): value is string {
  return typeof value === "string" && /^fb\.\d\.\d{10,16}\.\d{1,30}$/.test(value);
}

type LeadRow = {
  id: string;
  studentName: string;
  parentName: string;
  studentAge: number;
  experienceLevel: string;
  phone: string;
  email: string | null;
  status: LeadStatus;
  source: string | null;
  campaign: string | null;
  lastActivityAt: Date | null;
  convertedAt: Date | null;
  assignedClassId: string | null;
  createdAt: Date;
};

@Injectable()
export class LeadService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly demoInvites: DemoInviteService,
    private readonly referrals: ReferralTrackerService,
    private readonly notifier: SystemNotifier,
    private readonly trash: TrashRepository,
    private readonly crmPush: FrappeCrmPushService,
    private readonly metaCapi: MetaCapiService
  ) {}

  // ── Public ──

  /**
   * Creates a Lead from the academy "book a demo" form. Attribution
   * (`source`/`campaign`) is derived from the visitor's tracked session, if
   * any — a visitor who never hit the tracking endpoint (ad blocker, JS
   * disabled) still gets a Lead, just without attribution.
   */
  async createLead(
    body: CreateLeadRequest,
    context: { fbp?: string; sessionId: string | undefined; referralId?: string }
  ): Promise<CreateLeadResponse> {
    const phone = body.phone.replace(/\D/g, "");

    const visitorSession = context.sessionId
      ? await this.prisma.visitorSession.findUnique({
          where: { sessionId: context.sessionId }
        })
      : null;

    // The pixel's browser id rides on a consented visit only (docs/AD_MEASUREMENT.md).
    if (visitorSession?.adConsent === true && isMetaFbp(context.fbp) && visitorSession.fbp !== context.fbp) {
      await this.prisma.visitorSession.update({ data: { fbp: context.fbp }, where: { id: visitorSession.id } });
    }

    const source = visitorSession?.utmSource || visitorSession?.referrer || "Organic";
    const campaign = visitorSession?.utmCampaign ?? null;

    // The Frappe CRM copy is queued with the lead, so a lead is never left uncopied.
    const lead = await this.prisma.$transaction(async (tx) => {
      const created = await tx.lead.create({
        data: {
          studentName: body.studentName,
          parentName: body.parentName,
          studentAge: body.studentAge,
          experienceLevel: body.experienceLevel,
          phone,
          email: body.email || null,
          source,
          campaign,
          visitorSessionId: visitorSession?.id ?? null,
          activities: {
            create: {
              activityType: "LEAD_REGISTERED",
              title: "Lead registered",
              description: "Submitted the demo booking form on the academy site."
            }
          }
        }
      });
      await this.crmPush.enqueue(tx, created.id);
      // Meta's website Lead, only with the visitor's banner consent (checked inside).
      await this.metaCapi.onLeadCreated(tx, created.id, created.createdAt, body.metaEventId);
      return created;
    });

    // Referral attribution (cookie from a `/r/<code>` visit, else the code the
    // page remembered). Never throws.
    if (context.referralId || body.referralCode) {
      await this.referrals.attachLead({
        leadId: lead.id,
        prospectName: lead.studentName,
        referralCode: body.referralCode,
        referralId: context.referralId
      });
    }

    // Fire-and-forget (the notifier never throws): staff hear of the booking — ADMIN_EMAILS by
    // email, the academy's admins by WhatsApp / in-app — and the parent gets a confirmation.
    void this.announceNewLead(lead);
    void this.crmPush.pushLead(lead.id);
    void this.notifier.send(
      "DEMO_BOOKING",
      { email: lead.email, phone: lead.phone },
      { "lead.parentName": lead.parentName, "lead.studentName": lead.studentName }
    );

    return { lead: this.toLeadListItem(lead) };
  }

  /**
   * A free demo booked through the WhatsApp assistant (support bot). Runs
   * inside the bot's transaction. A lead with the same number from the last
   * WHATSAPP_LEAD_REUSE_DAYS days (not lost, not yet a student) gets an
   * activity instead of a twin. Call `announceNewLead` after commit when
   * `created`; the bot itself confirms to the parent, so no DEMO_BOOKING.
   */
  async upsertFromWhatsApp(
    tx: PrismaTransactionClient,
    input: SupportDemoRequest & { phone: string; now: Date }
  ): Promise<{ lead: Lead; created: boolean; detailsFilled: boolean }> {
    const description = [
      supportDemoSummary(input),
      "Booked through the WhatsApp assistant."
    ].join("\n");
    const phoneTail = input.phone.slice(-10);
    const since = new Date(input.now.getTime() - WHATSAPP_LEAD_REUSE_DAYS * 24 * 60 * 60 * 1000);
    const existing = await tx.lead.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        createdAt: { gte: since },
        phone: { endsWith: phoneTail },
        status: { notIn: [...CONVERTING_STATUSES, LeadStatus.LOST] }
      }
    });
    if (existing) {
      // A lead captured from the chat has no child details yet: the booking brings them.
      const filling = !leadChildDetailsGiven(existing);
      await tx.leadActivity.create({
        data: filling
          ? { activityType: "WHATSAPP_DEMO_REQUEST", description, leadId: existing.id, title: "Asked for a demo on WhatsApp" }
          : { activityType: "WHATSAPP_DEMO_REQUEST", description, leadId: existing.id, title: "Asked for a demo again on WhatsApp" }
      });
      const lead = await tx.lead.update({
        data: {
          lastActivityAt: input.now,
          ...(filling
            ? {
                experienceLevel: input.level,
                parentName: existing.parentName.trim() ? existing.parentName : input.parentName,
                studentAge: input.studentAge,
                studentName: input.studentName
              }
            : {})
        },
        where: { id: existing.id }
      });
      // Frappe got this lead without them; the next push adds them (review Part 1 #1).
      if (filling) await this.crmPush.markDetailsChanged(tx, existing.id);
      return { created: false, detailsFilled: filling, lead };
    }
    const lead = await tx.lead.create({
      data: {
        activities: {
          create: { activityType: "LEAD_REGISTERED", description, title: "Lead registered" }
        },
        experienceLevel: input.level,
        lastActivityAt: input.now,
        parentName: input.parentName,
        phone: input.phone,
        source: WHATSAPP_LEAD_SOURCE,
        studentAge: input.studentAge,
        studentName: input.studentName
      }
    });
    return { created: true, detailsFilled: false, lead };
  }

  /** Tells staff about a new lead (NEW_LEAD_ADMIN). Never throws. */
  async announceNewLead(lead: Pick<Lead, "campaign" | "email" | "experienceLevel" | "id" | "parentName" | "phone" | "source" | "studentAge" | "studentName">): Promise<void> {
    try {
      const recipients = await this.notifier.adminAlertRecipients();
      await this.notifier.send("NEW_LEAD_ADMIN", recipients, {
        "lead.campaign": lead.campaign ?? "-",
        "lead.email": lead.email ?? "-",
        "lead.experience": lead.experienceLevel,
        "lead.parentName": lead.parentName,
        "lead.phone": lead.phone,
        "lead.source": lead.source ?? "Unknown",
        "lead.studentAge": String(lead.studentAge),
        "lead.studentName": lead.studentName
      }, { dedupeKey: lead.id });
    } catch {
      // The notifier logs its own failures; a lead is never lost over an alert.
    }
  }

  /**
   * Upserts the visitor's `VisitorSession` by session cookie: first hit of a
   * session captures full attribution, repeat hits just advance
   * `pageViews`/`lastVisit`.
   */
  async trackVisit(input: {
    visitorId: string;
    sessionId: string;
    url: string;
    referrer: string | undefined;
    userAgent: string | undefined;
    ipAddress: string;
  }): Promise<void> {
    const existing = await this.prisma.visitorSession.findUnique({
      where: { sessionId: input.sessionId }
    });

    if (existing) {
      await this.prisma.visitorSession.update({
        where: { id: existing.id },
        data: { pageViews: { increment: 1 } }
      });
      return;
    }

    const attribution = parseVisitAttribution(input.url);
    const { browser, os, deviceType } = parseUserAgent(input.userAgent);

    await this.prisma.visitorSession.create({
      data: {
        sessionId: input.sessionId,
        visitorId: input.visitorId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent ?? null,
        browser,
        os,
        deviceType,
        referrer: input.referrer ?? null,
        landingPage: attribution.landingPage,
        utmSource: attribution.utmSource,
        utmMedium: attribution.utmMedium,
        utmCampaign: attribution.utmCampaign,
        utmContent: attribution.utmContent,
        utmTerm: attribution.utmTerm,
        fbclid: attribution.fbclid,
        gclid: attribution.gclid
      }
    });
  }

  /**
   * The cookie banner's answer (docs/AD_MEASUREMENT.md). Accept marks this visit and keeps the
   * pixel's `_fbp`; Decline marks every visit of this browser, so an event queued for an earlier
   * lead is skipped too. Starts the visit when the tracking call hasn't run yet.
   */
  async recordAdConsent(input: {
    consent: boolean;
    fbp: string | undefined;
    ipAddress: string;
    referrer: string | undefined;
    sessionId: string;
    url: string;
    userAgent: string | undefined;
    visitorId: string;
  }): Promise<void> {
    const now = new Date();
    const answer = { adConsent: input.consent, adConsentAt: now, fbp: input.consent && isMetaFbp(input.fbp) ? input.fbp : null };
    const existing = await this.prisma.visitorSession.findUnique({ select: { id: true }, where: { sessionId: input.sessionId } });
    if (!existing) {
      try {
        await this.trackVisit(input);
      } catch (error) {
        // The page's own tracking call made it a moment earlier: fine, it exists now.
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
      }
    }
    await this.prisma.visitorSession.update({ data: answer, where: { sessionId: input.sessionId } });
    if (!input.consent) {
      await this.prisma.visitorSession.updateMany({
        data: { adConsent: false, adConsentAt: now, fbp: null },
        where: { visitorId: input.visitorId }
      });
    }
  }

  // ── Admin ──

  async list(
    accessToken: string | undefined,
    query?: PaginatedQuery & { status?: string }
  ): Promise<LeadListResponse> {
    await this.getAuthorizedAdmin(accessToken);

    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const where: Prisma.LeadWhereInput = {};
    const status = queryEnum(query?.status, LeadStatus, "status");
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { studentName: { contains: search, mode: "insensitive" } },
        { parentName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } },
        { email: { contains: search, mode: "insensitive" } }
      ];
    }

    const orderBy = resolveOrderBy(
      query,
      ["createdAt", "status", "lastActivityAt"] as const,
      { createdAt: "asc" }
    ) as Prisma.LeadOrderByWithRelationInput;

    const [leads, total] = await Promise.all([
      this.prisma.lead.findMany({ where, orderBy, skip, take }),
      this.prisma.lead.count({ where })
    ]);

    return {
      items: leads.map((lead) => this.toLeadListItem(lead)),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  async getDetails(
    accessToken: string | undefined,
    id: string
  ): Promise<LeadDetailResponse> {
    await this.getAuthorizedAdmin(accessToken);

    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        visitorSession: true,
        adClick: true,
        assignedClass: { include: { coach: true } },
        activities: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
        notes: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
        supportTickets: { orderBy: { createdAt: "desc" }, select: { id: true, reference: true }, take: 1 }
      }
    });

    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    const visitorSession = lead.visitorSession;
    const assignedClass = lead.assignedClass;

    return {
      lead: {
        ...this.toLeadListItem(lead),
        assignedClass: assignedClass
          ? this.toAssignableDemoClass(assignedClass)
          : null,
        adClick: lead.adClick
          ? {
              clicks: lead.adClick.clicks,
              firstAdId: lead.adClick.firstAdId,
              firstHeadline: lead.adClick.firstHeadline,
              firstSeenAt: lead.adClick.firstSeenAt.toISOString(),
              latestAdId: lead.adClick.latestAdId,
              latestHeadline: lead.adClick.latestHeadline,
              latestSeenAt: lead.adClick.latestSeenAt.toISOString()
            }
          : null,
        visitorAttribution: visitorSession
          ? {
              browser: visitorSession.browser,
              os: visitorSession.os,
              deviceType: visitorSession.deviceType,
              referrer: visitorSession.referrer,
              landingPage: visitorSession.landingPage,
              utmSource: visitorSession.utmSource,
              utmMedium: visitorSession.utmMedium,
              utmCampaign: visitorSession.utmCampaign,
              utmContent: visitorSession.utmContent,
              utmTerm: visitorSession.utmTerm,
              fbclid: visitorSession.fbclid,
              gclid: visitorSession.gclid,
              firstVisit: visitorSession.firstVisit.toISOString(),
              lastVisit: visitorSession.lastVisit.toISOString(),
              pageViews: visitorSession.pageViews
            }
          : null,
        activities: lead.activities.map((activity) => ({
          id: activity.id,
          activityType: activity.activityType,
          title: activity.title,
          description: activity.description,
          createdByName: activity.createdBy
            ? `${activity.createdBy.firstName} ${activity.createdBy.lastName || ""}`.trim()
            : null,
          createdAt: activity.createdAt.toISOString()
        })),
        notes: lead.notes.map((note) => ({
          id: note.id,
          note: note.note,
          createdByName: note.createdBy
            ? `${note.createdBy.firstName} ${note.createdBy.lastName || ""}`.trim()
            : null,
          createdAt: note.createdAt.toISOString()
        })),
        whatsappTicket: lead.supportTickets[0] ?? null
      }
    };
  }

  async updateStatus(
    accessToken: string | undefined,
    id: string,
    body: UpdateLeadStatusRequest
  ) {
    const user = await this.getAuthorizedAdmin(accessToken);

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async (tx) => {
      const changed = await tx.lead.update({
        where: { id },
        data: {
          status: body.status,
          lastActivityAt: now,
          convertedAt: CONVERTING_STATUSES.includes(body.status)
            ? lead.convertedAt ?? now
            : lead.convertedAt,
          activities: {
            create: {
              activityType: "STATUS_CHANGED",
              title: `Status changed to ${body.status}`,
              description: body.description ?? null,
              createdById: user.id
            }
          }
        }
      });
      // In the same transaction: Meta hears about a booked demo or a conversion (docs/AD_MEASUREMENT.md),
      // and the Frappe copy is re-queued, so a PENDING row always means a change is on its way and
      // the return path can't undo the admin's change (review Part 1 #6).
      if (lead.status !== body.status) {
        await this.metaCapi.onLeadStatus(tx, id, body.status, now);
        await this.crmPush.markStageChanged(tx, id);
      }
      return changed;
    });

    await this.referrals.onLeadStatus(id, body.status, user.id);
    if (lead.status !== body.status) void this.crmPush.pushLead(id);
    return { lead: this.toLeadListItem(updated) };
  }

  /**
   * Books a lead into a scheduled/live demo class via `DemoInviteService`
   * (shared with the demo-class side's "add from leads"), so the lead gets the
   * same `DemoClassRegistration` — and the same join rights — either way.
   */
  async assignDemoClass(
    accessToken: string | undefined,
    id: string,
    body: AssignLeadDemoClassRequest
  ) {
    const user = await this.getAuthorizedAdmin(accessToken);

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    const demoClass = await this.demoInvites.getInvitableClass(body.classId);
    await this.demoInvites.bookLead(demoClass, lead, user.id);

    const updated = await this.prisma.lead.findUniqueOrThrow({ where: { id } });
    return {
      lead: {
        ...this.toLeadListItem(updated),
        assignedClass: this.toAssignableDemoClass(demoClass)
      }
    };
  }

  async addNote(accessToken: string | undefined, id: string, body: CreateLeadNoteRequest) {
    const user = await this.getAuthorizedAdmin(accessToken);

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    const [note] = await this.prisma.$transaction([
      this.prisma.leadNote.create({
        data: { leadId: id, note: body.note, createdById: user.id }
      }),
      this.prisma.leadActivity.create({
        data: {
          leadId: id,
          activityType: "NOTE_ADDED",
          title: "Note added",
          description: body.note,
          createdById: user.id
        }
      }),
      this.prisma.lead.update({ where: { id }, data: { lastActivityAt: new Date() } })
    ]);

    return {
      note: {
        id: note.id,
        note: note.note,
        createdByName: `${user.firstName} ${user.lastName || ""}`.trim(),
        createdAt: note.createdAt.toISOString()
      }
    };
  }

  async delete(accessToken: string | undefined, id: string) {
    const user = await this.getAuthorizedAdmin(accessToken);

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    await this.prisma.$transaction(async (tx) => {
      await this.trash.softDelete(tx, "Lead", id, user.id);
      // Its queued ad events never leave once the lead is trashed (review Part 1 #3).
      await tx.metaCapiEvent.updateMany({
        data: { claimedAt: null, error: "The lead was deleted.", status: "SKIPPED" },
        where: { leadId: id, status: "PENDING" }
      });
    });
    return { ok: true };
  }

  async getMetrics(accessToken: string | undefined): Promise<LeadMetricsResponse> {
    await this.getAuthorizedAdmin(accessToken);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalLeads,
      todayLeads,
      totalVisitors,
      todayVisitors,
      statusGroups,
      sourceGroups,
      convertedCount
    ] = await Promise.all([
      this.prisma.lead.count(),
      this.prisma.lead.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.visitorSession.count(),
      this.prisma.visitorSession.count({ where: { firstVisit: { gte: todayStart } } }),
      this.prisma.lead.groupBy({ by: ["status"], _count: true }),
      this.prisma.lead.groupBy({ by: ["source"], _count: true }),
      this.prisma.lead.count({ where: { status: { in: CONVERTING_STATUSES } } })
    ]);

    const statusDistribution: Record<string, number> = {};
    for (const group of statusGroups) {
      statusDistribution[group.status] = group._count;
    }

    const sourceDistribution: Record<string, number> = {};
    for (const group of sourceGroups) {
      sourceDistribution[group.source ?? "Unknown"] = group._count;
    }

    return {
      leads: { total: totalLeads, today: todayLeads },
      visitors: { total: totalVisitors, today: todayVisitors },
      conversion: {
        rate: totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 1000) / 10 : 0,
        count: convertedCount
      },
      statusDistribution,
      sourceDistribution
    };
  }

  private toLeadListItem(lead: LeadRow) {
    return {
      id: lead.id,
      studentName: lead.studentName,
      parentName: lead.parentName,
      studentAge: lead.studentAge,
      experienceLevel: lead.experienceLevel,
      phone: lead.phone,
      email: lead.email,
      status: lead.status,
      source: lead.source,
      campaign: lead.campaign,
      lastActivityAt: lead.lastActivityAt?.toISOString() ?? null,
      convertedAt: lead.convertedAt?.toISOString() ?? null,
      assignedClassId: lead.assignedClassId,
      createdAt: lead.createdAt.toISOString()
    };
  }

  private toAssignableDemoClass(demoClass: {
    id: string;
    topic: string | null;
    startsAt: Date;
    endsAt: Date;
    coach: { firstName: string; lastName: string | null };
  }): LeadAssignableDemoClass {
    return {
      id: demoClass.id,
      topic: demoClass.topic ?? "Demo class",
      startsAt: demoClass.startsAt.toISOString(),
      endsAt: demoClass.endsAt.toISOString(),
      coachName: `${demoClass.coach.firstName} ${demoClass.coach.lastName || ""}`.trim()
    };
  }

  private async getAuthorizedAdmin(accessToken: string | undefined) {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageLeads(user);
    return user;
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private assertCanManageLeads(user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage leads.");
    }
  }
}
