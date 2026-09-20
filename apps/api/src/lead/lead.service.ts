import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
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
  ClassStatus,
  DemoRegistrationContactMethod,
  LeadStatus,
  Prisma,
  User,
  UserRole,
  UserStatus
} from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import {
  paginationMeta,
  resolveOrderBy,
  resolvePagination
} from "../common/pagination";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { parseUserAgent, parseVisitAttribution } from "./lead-tracking.util";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "status">;

const CONVERTING_STATUSES: LeadStatus[] = ["CONVERTED", "ACTIVE_STUDENT"];

type LeadRow = {
  id: string;
  studentName: string;
  parentName: string;
  studentAge: number;
  experienceLevel: string;
  phone: string;
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
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly whatsapp: WhatsAppService
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
    context: { sessionId: string | undefined }
  ): Promise<CreateLeadResponse> {
    const phone = body.phone.replace(/\D/g, "");

    const visitorSession = context.sessionId
      ? await this.prisma.visitorSession.findUnique({
          where: { sessionId: context.sessionId }
        })
      : null;

    const source = visitorSession?.utmSource || visitorSession?.referrer || "Organic";
    const campaign = visitorSession?.utmCampaign ?? null;

    const lead = await this.prisma.lead.create({
      data: {
        studentName: body.studentName,
        parentName: body.parentName,
        studentAge: body.studentAge,
        experienceLevel: body.experienceLevel,
        phone,
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

    // Fire-and-forget — a notification failure must never fail the public
    // form submission. MailService logs its own failures.
    this.mailService
      .sendNewLeadNotification({
        studentName: lead.studentName,
        parentName: lead.parentName,
        studentAge: lead.studentAge,
        experienceLevel: lead.experienceLevel,
        phone: lead.phone,
        source: lead.source,
        campaign: lead.campaign
      })
      .catch(() => undefined);

    return { lead: this.toLeadListItem(lead) };
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

  // ── Admin ──

  async list(
    accessToken: string | undefined,
    query?: PaginatedQuery & { status?: string }
  ): Promise<LeadListResponse> {
    await this.getAuthorizedAdmin(accessToken);

    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const where: Prisma.LeadWhereInput = {};
    if (query?.status && query.status !== "ALL") {
      where.status = query.status as LeadStatus;
    }
    if (search) {
      where.OR = [
        { studentName: { contains: search, mode: "insensitive" } },
        { parentName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search } }
      ];
    }

    const orderBy = resolveOrderBy(
      query,
      ["createdAt", "status", "lastActivityAt"] as const,
      { createdAt: "desc" }
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
        assignedClass: { include: { coach: true } },
        activities: { orderBy: { createdAt: "desc" }, include: { createdBy: true } },
        notes: { orderBy: { createdAt: "desc" }, include: { createdBy: true } }
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
        }))
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
    const updated = await this.prisma.lead.update({
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

    return { lead: this.toLeadListItem(updated) };
  }

  /**
   * Books a lead into an actual scheduled demo class: mirrors the same
   * `DemoClassRegistration` a self-registered guest would get (via
   * `LiveClassService.joinDemoClass`'s `registerDemoGuest`, upsert-style —
   * re-assigning to the same class is a no-op, not a duplicate), so
   * attendance/join work identically either way. Also advances the lead's
   * status unless it's already past this point in the pipeline.
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

    const demoClass = await this.prisma.coachClass.findUnique({
      where: { id: body.classId },
      include: { coach: true }
    });

    if (!demoClass || !demoClass.isDemo) {
      throw new BadRequestException("Demo class not found.");
    }
    if (demoClass.status !== ClassStatus.SCHEDULED) {
      throw new BadRequestException("Only a scheduled demo class can be assigned.");
    }

    const contactValue =
      this.whatsapp.normalizeRecipient(lead.phone) ?? lead.phone.replace(/\D/g, "");

    const existingRegistration = await this.prisma.demoClassRegistration.findUnique({
      where: {
        classId_contactMethod_contactValue: {
          classId: demoClass.id,
          contactMethod: DemoRegistrationContactMethod.PHONE,
          contactValue
        }
      }
    });

    if (!existingRegistration) {
      await this.prisma.demoClassRegistration.create({
        data: {
          classId: demoClass.id,
          name: lead.studentName,
          contactMethod: DemoRegistrationContactMethod.PHONE,
          contactValue,
          phoneNumber: lead.phone
        }
      });
    }

    const demoClassTopic = demoClass.topic ?? "Demo class";
    const now = new Date();
    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        assignedClassId: demoClass.id,
        status: CONVERTING_STATUSES.includes(lead.status) || lead.status === "LOST"
          ? lead.status
          : "DEMO_SCHEDULED",
        lastActivityAt: now,
        activities: {
          create: {
            activityType: "DEMO_CLASS_ASSIGNED",
            title: `Assigned to demo class: ${demoClassTopic}`,
            description: `Scheduled for ${demoClass.startsAt.toISOString()} with ${demoClass.coach.firstName} ${demoClass.coach.lastName || ""}`.trim(),
            createdById: user.id
          }
        }
      }
    });

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
    await this.getAuthorizedAdmin(accessToken);

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) {
      throw new NotFoundException("Lead not found.");
    }

    await this.prisma.lead.delete({ where: { id } });
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

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
      secret: this.env.JWT_ACCESS_SECRET
    });

    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    return user;
  }

  private assertCanManageLeads(user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage leads.");
    }
  }
}
