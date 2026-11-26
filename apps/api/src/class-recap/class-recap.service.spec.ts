import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { CLASS_RECAP_AI_LABEL, CLASS_RECAP_MAX_REGENERATIONS } from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { runInTenant } from "../tenancy/tenant-context";
import { ClassRecapService } from "./class-recap.service";

jest.mock("../auth/authenticate", () => ({ authenticateUser: jest.fn() }));
const authenticate = authenticateUser as jest.MockedFunction<typeof authenticateUser>;

const coach = { id: "coach1", role: "COACH" };
const otherCoach = { id: "coach2", role: "COACH" };
const admin = { id: "admin1", role: "ADMIN" };
const student = { id: "stu1", role: "STUDENT" };

const CONTENT = { keyPoints: ["Develop pieces"], practice: [], recap: "Today you learned about development." };

function recapRow(overrides: Record<string, unknown> = {}) {
  return {
    attempts: 1,
    class: {
      batch: { name: "Morning batch" },
      coach: { firstName: "Meena", lastName: "Raj" },
      coachId: "coach1",
      id: "class1",
      startsAt: new Date("2026-11-25T10:00:00Z"),
      title: null,
      topic: "Openings"
    },
    classId: "class1",
    contentJson: CONTENT,
    createdAt: new Date("2026-11-25T11:00:00Z"),
    draftJson: CONTENT,
    editedAt: null,
    failureCode: null,
    generatedAt: new Date("2026-11-25T11:05:00Z"),
    id: "recap1",
    model: "qwen2.5:3b",
    provider: "LOCAL",
    providerName: "Our server",
    publishedAt: null,
    publishedById: null,
    rating: null,
    regenerations: 0,
    status: "READY",
    updatedAt: new Date("2026-11-25T11:05:00Z"),
    ...overrides
  };
}

function setup(options: { row?: Record<string, unknown> | null; studentOfClass?: boolean; updated?: number } = {}) {
  const row = options.row === null ? null : recapRow(options.row);
  const prisma = {
    classRecap: {
      count: jest.fn(async () => 2),
      findMany: jest.fn(async () => (row ? [row] : [])),
      findUnique: jest.fn(async () => row),
      updateMany: jest.fn(async () => ({ count: options.updated ?? 1 }))
    },
    classRecapSettings: { findUnique: jest.fn(async () => null), upsert: jest.fn() },
    coachClass: {
      count: jest.fn(async () => (options.studentOfClass === false ? 0 : 1)),
      findUnique: jest.fn(async () => ({ coachId: "coach1", id: "class1" }))
    },
    user: { findUnique: jest.fn(async () => ({ firstName: "Meena", lastName: "Raj" })) }
  };
  const entitlements = { hasFeature: jest.fn(async () => true) };
  const models = { complete: jest.fn(), local: { model: "qwen2.5:3b" }, outsideRoute: () => [] };
  const service = new ClassRecapService({} as never, prisma as never, entitlements as never, models as never);
  const inAcademy = <T>(fn: () => Promise<T>) => runInTenant("tenant_nexa", "spec", fn);
  return { inAcademy, prisma, service };
}

describe("ClassRecapService", () => {
  afterEach(() => authenticate.mockReset());

  describe("reading one class's recap", () => {
    it("the class's coach gets the staff view with the draft", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { service } = setup();
      const result = await service.getForClass("t", "class1");
      expect(result.viewer).toBe("STAFF");
      expect(result.recap).toMatchObject({ draft: CONTENT, status: "READY", regenerationsLeft: CLASS_RECAP_MAX_REGENERATIONS });
    });

    it("an admin gets the staff view too", async () => {
      authenticate.mockResolvedValue(admin as never);
      const { service } = setup();
      expect((await service.getForClass("t", "class1")).viewer).toBe("STAFF");
    });

    it("another coach gets a 404, not a 403", async () => {
      authenticate.mockResolvedValue(otherCoach as never);
      const { service } = setup();
      await expect(service.getForClass("t", "class1")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("a student of the class sees nothing before publish", async () => {
      authenticate.mockResolvedValue(student as never);
      const { service } = setup();
      expect(await service.getForClass("t", "class1")).toEqual({ recap: null, viewer: "STUDENT" });
    });

    it("a student of the class sees the published recap with the AI label, never the draft", async () => {
      authenticate.mockResolvedValue(student as never);
      const { service } = setup({ row: { publishedAt: new Date("2026-11-25T12:00:00Z"), status: "PUBLISHED" } });
      const result = await service.getForClass("t", "class1");
      expect(result).toMatchObject({ recap: { aiLabel: CLASS_RECAP_AI_LABEL, content: CONTENT }, viewer: "STUDENT" });
      expect(result.recap).not.toHaveProperty("draft");
    });

    it("a student outside the class gets a 404", async () => {
      authenticate.mockResolvedValue(student as never);
      const { service } = setup({ studentOfClass: false });
      await expect(service.getForClass("t", "class1")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("lists", () => {
    it("a coach's list is limited to their own classes; an admin's isn't", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { prisma, service } = setup();
      await service.list("t", { status: "READY" });
      expect(prisma.classRecap.findMany.mock.calls[0]).toMatchObject([{ where: { class: { coachId: "coach1" }, status: "READY" } }]);

      authenticate.mockResolvedValue(admin as never);
      await service.list("t", {});
      expect((prisma.classRecap.findMany.mock.calls[1] as unknown as [{ where: { class: object } }])[0].where.class).toEqual({});
    });

    it("a student can't list recaps for review", async () => {
      authenticate.mockResolvedValue(student as never);
      const { service } = setup();
      await expect(service.list("t", {})).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("a bad status filter is a 400", async () => {
      authenticate.mockResolvedValue(admin as never);
      const { service } = setup();
      await expect(service.list("t", { status: "NOPE" })).rejects.toBeInstanceOf(BadRequestException);
    });

    it("the student feed shows only published recaps of their classes", async () => {
      authenticate.mockResolvedValue(student as never);
      const { prisma, service } = setup({ row: { publishedAt: new Date(), status: "PUBLISHED" } });
      const feed = await service.feedMine("t", {});
      expect(feed.items).toHaveLength(1);
      const where = (prisma.classRecap.findMany.mock.calls[0] as unknown as [{ where: { AND: object[] } }])[0].where;
      expect(where.AND[0]).toEqual({ status: "PUBLISHED" });
    });

    it("the review count is the coach's own READY drafts; a student gets 0", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { prisma, service } = setup();
      expect(await service.reviewCount("t")).toEqual({ ready: 2 });
      expect(prisma.classRecap.count).toHaveBeenCalledWith({ where: { class: { coachId: "coach1" }, status: "READY" } });
      authenticate.mockResolvedValue(student as never);
      expect(await service.reviewCount("t")).toEqual({ ready: 0 });
    });
  });

  describe("reviewer actions", () => {
    it("publishing with an edit stores it and who published, from READY only", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { prisma, service } = setup();
      const edited = { ...CONTENT, recap: "Edited by the coach." };
      await service.publish("t", "class1", { content: edited });
      expect(prisma.classRecap.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ contentJson: edited, editedById: "coach1", publishedById: "coach1", status: "PUBLISHED" }),
        where: { classId: "class1", status: { in: ["READY"] } }
      });
    });

    it("refuses to publish a student code (400)", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { prisma, service } = setup();
      await expect(service.publish("t", "class1", { content: { ...CONTENT, recap: "Well done S2." } })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(prisma.classRecap.updateMany).not.toHaveBeenCalled();
    });

    it("a lost race or a wrong state is a 409", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { service } = setup({ updated: 0 });
      await expect(service.discard("t", "class1")).rejects.toBeInstanceOf(ConflictException);
    });

    it("another coach can't act on the class (404)", async () => {
      authenticate.mockResolvedValue(otherCoach as never);
      const { prisma, service } = setup();
      await expect(service.publish("t", "class1", {})).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.classRecap.updateMany).not.toHaveBeenCalled();
    });

    it("regenerate clears the draft and queues it, but not while published", async () => {
      authenticate.mockResolvedValue(admin as never);
      const { prisma, service } = setup();
      await service.regenerate("t", "class1");
      expect(prisma.classRecap.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ attempts: 0, regenerations: { increment: 1 }, status: "QUEUED" }),
        where: expect.objectContaining({ classId: "class1", status: { in: ["READY", "DISCARDED", "FAILED", "SKIPPED"] } })
      });

      const published = setup({ row: { status: "PUBLISHED" }, updated: 0 });
      await expect(published.service.regenerate("t", "class1")).rejects.toThrow(/Unpublish/);
    });

    it("regenerate stops at the limit", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { prisma, service } = setup({ row: { regenerations: CLASS_RECAP_MAX_REGENERATIONS } });
      await expect(service.regenerate("t", "class1")).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.classRecap.updateMany).not.toHaveBeenCalled();
    });

    it("restore needs a draft", async () => {
      authenticate.mockResolvedValue(coach as never);
      const { service } = setup({ row: { contentJson: null, status: "DISCARDED" } });
      await expect(service.restore("t", "class1")).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("settings", () => {
    it("defaults to on, our own server; admins only", async () => {
      authenticate.mockResolvedValue(admin as never);
      const { inAcademy, service } = setup();
      expect(await inAcademy(() => service.getSettings("t"))).toMatchObject({
        enabled: true,
        local: { configured: true, model: "qwen2.5:3b" },
        outside: { configured: false },
        planIncludes: true,
        provider: "LOCAL"
      });
      authenticate.mockResolvedValue(coach as never);
      await expect(inAcademy(() => service.getSettings("t"))).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("an admin switches to the outside AI", async () => {
      authenticate.mockResolvedValue(admin as never);
      const { inAcademy, prisma, service } = setup();
      await inAcademy(() => service.updateSettings("t", { provider: "OUTSIDE" }));
      expect(prisma.classRecapSettings.upsert).toHaveBeenCalledWith({
        create: { provider: "OUTSIDE", tenantId: "tenant_nexa", updatedById: "admin1" },
        update: { provider: "OUTSIDE", updatedById: "admin1" },
        where: { tenantId: "tenant_nexa" }
      });
    });
  });
});
