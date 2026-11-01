import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createLeadRequestSchema } from "@nexa-chess/types";
import { ClassStatus, UserRole, UserStatus } from "@prisma/client";
import { LeadService } from "./lead.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailService } from "../mail/mail.service";
import { SystemMessageRenderer } from "../mail/system-message-renderer.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { DemoInviteService } from "../demo-class/demo-invite.service";

const ACCESS_TOKEN = "access-token";
const ADMIN_ID = "admin-1";

describe("LeadService", () => {
  let service: LeadService;
  let jwtService: { verifyAsync: jest.Mock };
  let sendNewLeadNotification: jest.Mock;
  let normalizeRecipient: jest.Mock;
  let prisma: {
    visitorSession: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock; count: jest.Mock };
    lead: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    leadNote: { create: jest.Mock };
    leadActivity: { create: jest.Mock };
    coachClass: { findUnique: jest.Mock };
    demoClassRegistration: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(async () => {
    jwtService = { verifyAsync: jest.fn().mockResolvedValue({ sub: ADMIN_ID, type: "access" }) };
    sendNewLeadNotification = jest.fn().mockResolvedValue(undefined);
    normalizeRecipient = jest.fn((phone: string) => phone);

    prisma = {
      visitorSession: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0)
      },
      lead: {
        create: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: "lead-1",
          studentName: "Kid",
          parentName: "Parent",
          studentAge: 10,
          experienceLevel: "beginner",
          phone: "9876543210",
          status: "DEMO_SCHEDULED",
          source: "Organic",
          campaign: null,
          lastActivityAt: new Date(),
          convertedAt: null,
          assignedClassId: "class-1",
          createdAt: new Date()
        }),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        groupBy: jest.fn().mockResolvedValue([])
      },
      leadNote: { create: jest.fn() },
      leadActivity: { create: jest.fn() },
      coachClass: { findUnique: jest.fn() },
      demoClassRegistration: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: ADMIN_ID,
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
          firstName: "Ada",
          lastName: "Min"
        })
      },
      $transaction: jest.fn()
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadService,
        DemoInviteService,
        { provide: JwtService, useValue: jwtService },
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: { sendNewLeadNotification } },
        { provide: SystemMessageRenderer, useValue: {} },
        { provide: WhatsAppService, useValue: { normalizeRecipient } }
      ]
    }).compile();

    service = module.get<LeadService>(LeadService);
  });

  describe("createLead", () => {
    const requestBody = {
      studentName: "Kid Name",
      parentName: "Parent Name",
      studentAge: 10,
      experienceLevel: "beginner" as const,
      phone: "98765 43210"
    };

    it("falls back to Organic when there is no linked visitor session", async () => {
      prisma.lead.create.mockImplementation(({ data }) => ({
        id: "lead-1",
        ...data,
        studentAge: data.studentAge,
        lastActivityAt: null,
        convertedAt: null,
        createdAt: new Date()
      }));

      const result = await service.createLead(requestBody, { sessionId: undefined });

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: "Organic",
            campaign: null,
            phone: "9876543210",
            visitorSessionId: null
          })
        })
      );
      expect(result.lead.source).toBe("Organic");
      expect(sendNewLeadNotification).toHaveBeenCalled();
    });

    it("derives source/campaign from the linked visitor session's UTM data", async () => {
      prisma.visitorSession.findUnique.mockResolvedValue({
        id: "session-row-1",
        utmSource: "google",
        utmCampaign: "spring-promo",
        referrer: "https://google.com"
      });
      prisma.lead.create.mockImplementation(({ data }) => ({
        id: "lead-2",
        ...data,
        lastActivityAt: null,
        convertedAt: null,
        createdAt: new Date()
      }));

      await service.createLead(requestBody, { sessionId: "session-cookie-1" });

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            source: "google",
            campaign: "spring-promo",
            visitorSessionId: "session-row-1"
          })
        })
      );
    });

    it("stores the optional email and passes it to the admin notification", async () => {
      prisma.lead.create.mockImplementation(({ data }) => ({
        id: "lead-4",
        ...data,
        lastActivityAt: null,
        convertedAt: null,
        createdAt: new Date()
      }));

      const result = await service.createLead(
        { ...requestBody, email: "parent@example.com" },
        { sessionId: undefined }
      );

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: "parent@example.com" }) })
      );
      expect(result.lead.email).toBe("parent@example.com");
      expect(sendNewLeadNotification).toHaveBeenCalledWith(
        expect.objectContaining({ email: "parent@example.com" })
      );
    });

    it("stores no email when the field is left blank", async () => {
      prisma.lead.create.mockImplementation(({ data }) => ({
        id: "lead-5",
        ...data,
        lastActivityAt: null,
        convertedAt: null,
        createdAt: new Date()
      }));

      await service.createLead({ ...requestBody, email: "" }, { sessionId: undefined });

      expect(prisma.lead.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: null }) })
      );
    });

    it("lower-cases the email and rejects one that is not an address", () => {
      const base = { ...requestBody, phone: "9876543210" };
      expect(createLeadRequestSchema.parse({ ...base, email: " Parent@Example.COM " }).email).toBe(
        "parent@example.com"
      );
      expect(createLeadRequestSchema.safeParse({ ...base, email: "not-an-email" }).success).toBe(false);
      expect(createLeadRequestSchema.parse(base).email).toBeUndefined();
    });

    it("never fails the public request when the notification email rejects", async () => {
      prisma.lead.create.mockResolvedValue({
        id: "lead-3",
        ...requestBody,
        phone: "9876543210",
        source: "Organic",
        campaign: null,
        lastActivityAt: null,
        convertedAt: null,
        createdAt: new Date()
      });
      sendNewLeadNotification.mockRejectedValue(new Error("SMTP is not configured."));

      await expect(service.createLead(requestBody, { sessionId: undefined })).resolves.toBeDefined();
    });
  });

  describe("trackVisit", () => {
    it("creates a new VisitorSession with parsed attribution on the first hit of a session", async () => {
      prisma.visitorSession.findUnique.mockResolvedValue(null);

      await service.trackVisit({
        visitorId: "visitor-1",
        sessionId: "session-1",
        url: "https://academy.nexa.test/academy?utm_source=facebook&utm_campaign=launch&fbclid=abc",
        referrer: "https://facebook.com",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        ipAddress: "203.0.113.5"
      });

      expect(prisma.visitorSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sessionId: "session-1",
            visitorId: "visitor-1",
            utmSource: "facebook",
            utmCampaign: "launch",
            fbclid: "abc",
            deviceType: "Mobile",
            os: "iOS"
          })
        })
      );
      expect(prisma.visitorSession.update).not.toHaveBeenCalled();
    });

    it("only increments pageViews on a repeat hit of the same session", async () => {
      prisma.visitorSession.findUnique.mockResolvedValue({ id: "existing-session-row" });

      await service.trackVisit({
        visitorId: "visitor-1",
        sessionId: "session-1",
        url: "https://academy.nexa.test/academy",
        referrer: undefined,
        userAgent: undefined,
        ipAddress: "203.0.113.5"
      });

      expect(prisma.visitorSession.update).toHaveBeenCalledWith({
        where: { id: "existing-session-row" },
        data: { pageViews: { increment: 1 } }
      });
      expect(prisma.visitorSession.create).not.toHaveBeenCalled();
    });
  });

  describe("admin authorization", () => {
    it("rejects a missing access token", async () => {
      await expect(service.list(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it("rejects a non-admin caller", async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: "student-1",
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE
      });

      await expect(service.list(ACCESS_TOKEN)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("updateStatus", () => {
    it("sets convertedAt once when moving into a converting status", async () => {
      const existing = { id: "lead-1", status: "NEW", convertedAt: null };
      prisma.lead.findUnique.mockResolvedValue(existing);
      prisma.lead.update.mockImplementation(({ data }) => ({
        id: "lead-1",
        studentName: "Kid",
        parentName: "Parent",
        studentAge: 10,
        experienceLevel: "beginner",
        phone: "9876543210",
        source: "Organic",
        campaign: null,
        createdAt: new Date(),
        ...data
      }));

      const result = await service.updateStatus(ACCESS_TOKEN, "lead-1", { status: "CONVERTED" });

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CONVERTED",
            convertedAt: expect.any(Date)
          })
        })
      );
      expect(result.lead.status).toBe("CONVERTED");
    });

    it("throws when the lead does not exist", async () => {
      prisma.lead.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(ACCESS_TOKEN, "missing-lead", { status: "CONTACTED" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("assignDemoClass", () => {
    const scheduledClass = {
      id: "class-1",
      topic: "board",
      isDemo: true,
      status: ClassStatus.SCHEDULED,
      startsAt: new Date("2026-10-01T10:00:00Z"),
      endsAt: new Date("2026-10-01T11:00:00Z"),
      coach: { firstName: "Test", lastName: "Coach" }
    };

    it("creates a DemoClassRegistration and advances the lead's status", async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: "lead-1", phone: "9876543210", status: "NEW" });
      prisma.coachClass.findUnique.mockResolvedValue(scheduledClass);
      prisma.demoClassRegistration.findUnique.mockResolvedValue(null);
      prisma.lead.update.mockImplementation(({ data }) => ({
        id: "lead-1",
        studentName: "Kid",
        parentName: "Parent",
        studentAge: 10,
        experienceLevel: "beginner",
        phone: "9876543210",
        source: "Organic",
        campaign: null,
        createdAt: new Date(),
        ...data
      }));

      const result = await service.assignDemoClass(ACCESS_TOKEN, "lead-1", { classId: "class-1" });

      expect(prisma.demoClassRegistration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            classId: "class-1",
            contactValue: "9876543210",
            source: "LEAD",
            leadId: "lead-1",
            inviteToken: expect.any(String)
          })
        })
      );
      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ assignedClassId: "class-1", status: "DEMO_SCHEDULED" })
        })
      );
      expect(result.lead.assignedClass?.topic).toBe("board");
    });

    it("does not duplicate the registration when one already exists for this contact", async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: "lead-1", phone: "9876543210", status: "NEW" });
      prisma.coachClass.findUnique.mockResolvedValue(scheduledClass);
      prisma.demoClassRegistration.findUnique.mockResolvedValue({
        id: "existing-reg",
        source: "SELF",
        leadId: null,
        inviteToken: null,
        invitedById: null
      });
      prisma.lead.update.mockResolvedValue({
        id: "lead-1",
        studentName: "Kid",
        parentName: "Parent",
        studentAge: 10,
        experienceLevel: "beginner",
        phone: "9876543210",
        status: "DEMO_SCHEDULED",
        source: "Organic",
        campaign: null,
        lastActivityAt: new Date(),
        convertedAt: null,
        assignedClassId: "class-1",
        createdAt: new Date()
      });

      await service.assignDemoClass(ACCESS_TOKEN, "lead-1", { classId: "class-1" });

      expect(prisma.demoClassRegistration.create).not.toHaveBeenCalled();
      // A self-registered guest becomes this lead's approved, linked invite.
      expect(prisma.demoClassRegistration.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "existing-reg" },
          data: expect.objectContaining({ source: "LEAD", leadId: "lead-1", approval: "APPROVED" })
        })
      );
    });

    it("never downgrades a converted lead's status", async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: "lead-1", phone: "9876543210", status: "CONVERTED" });
      prisma.coachClass.findUnique.mockResolvedValue(scheduledClass);
      prisma.demoClassRegistration.findUnique.mockResolvedValue(null);
      prisma.lead.update.mockImplementation(({ data }) => ({
        id: "lead-1",
        studentName: "Kid",
        parentName: "Parent",
        studentAge: 10,
        experienceLevel: "beginner",
        phone: "9876543210",
        source: "Organic",
        campaign: null,
        createdAt: new Date(),
        ...data
      }));

      await service.assignDemoClass(ACCESS_TOKEN, "lead-1", { classId: "class-1" });

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "CONVERTED" }) })
      );
    });

    it("rejects a class that isn't a demo class", async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: "lead-1", phone: "9876543210", status: "NEW" });
      prisma.coachClass.findUnique.mockResolvedValue({ ...scheduledClass, isDemo: false });

      await expect(
        service.assignDemoClass(ACCESS_TOKEN, "lead-1", { classId: "class-1" })
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("rejects a demo class that is cancelled or over", async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: "lead-1", phone: "9876543210", status: "NEW" });
      prisma.coachClass.findUnique.mockResolvedValue({ ...scheduledClass, status: ClassStatus.CANCELLED });

      await expect(
        service.assignDemoClass(ACCESS_TOKEN, "lead-1", { classId: "class-1" })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("addNote", () => {
    it("writes the note and a mirrored activity in one transaction", async () => {
      prisma.lead.findUnique.mockResolvedValue({ id: "lead-1" });
      prisma.$transaction.mockResolvedValue([
        { id: "note-1", note: "Called, will call back tomorrow.", createdAt: new Date() }
      ]);

      const result = await service.addNote(ACCESS_TOKEN, "lead-1", {
        note: "Called, will call back tomorrow."
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(result.note.createdByName).toBe("Ada Min");
    });
  });

  describe("getMetrics", () => {
    it("computes the conversion rate from converted vs total leads", async () => {
      prisma.lead.count
        .mockResolvedValueOnce(10) // total leads
        .mockResolvedValueOnce(2) // today leads
        .mockResolvedValueOnce(3); // converted count
      prisma.visitorSession.count.mockResolvedValueOnce(50).mockResolvedValueOnce(5);
      prisma.lead.groupBy
        .mockResolvedValueOnce([{ status: "NEW", _count: 7 }, { status: "CONVERTED", _count: 3 }])
        .mockResolvedValueOnce([{ source: "Organic", _count: 6 }, { source: null, _count: 4 }]);

      const result = await service.getMetrics(ACCESS_TOKEN);

      expect(result.leads).toEqual({ total: 10, today: 2 });
      expect(result.conversion).toEqual({ rate: 30, count: 3 });
      expect(result.statusDistribution).toEqual({ NEW: 7, CONVERTED: 3 });
      expect(result.sourceDistribution).toEqual({ Organic: 6, Unknown: 4 });
    });
  });
});
