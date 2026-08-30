import { UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, UserStatus } from "@prisma/client";
import { NotificationService } from "./notification.service";
import { PrismaService } from "../prisma/prisma.service";

const TOKEN = "t";
const USER_ID = "user-1";

describe("NotificationService", () => {
  let service: NotificationService;
  let prisma: {
    user: { findUnique: jest.Mock };
    notification: {
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      createMany: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: USER_ID, type: "access" }) };
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: USER_ID, status: UserStatus.ACTIVE })
      },
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      }
    };
    service = new NotificationService(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService
    );
  });

  it("rejects an unauthenticated list request", async () => {
    await expect(service.list(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns items with an unread count", async () => {
    prisma.notification.findMany.mockResolvedValue([
      {
        id: "n1",
        type: "ASSIGNMENT_GRADED",
        title: "t",
        body: "b",
        linkPath: "/coach/assignments",
        readAt: null,
        createdAt: new Date()
      }
    ]);
    prisma.notification.count.mockResolvedValue(1);

    const res = await service.list(TOKEN);
    expect(res.unreadCount).toBe(1);
    expect(res.notifications[0]).toMatchObject({ id: "n1", linkPath: "/coach/assignments" });
  });

  it("marks all unread read when no ids are given", async () => {
    await service.markRead(TOKEN, {});
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: USER_ID, readAt: null } })
    );
  });

  it("swallows a duplicate dedupeKey on notify", async () => {
    prisma.notification.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dupe", { code: "P2002", clientVersion: "6" })
    );
    await expect(
      service.notify({ userId: USER_ID, type: "ASSIGNMENT_DUE_SOON", title: "t", body: "b" })
    ).resolves.toBeUndefined();
  });

  it("notifyMany skips duplicates and reports the inserted count", async () => {
    prisma.notification.createMany.mockResolvedValue({ count: 2 });
    const inserted = await service.notifyMany([
      { userId: "a", type: "ASSIGNMENT_DUE_SOON", title: "t", body: "b", dedupeKey: "k1" },
      { userId: "b", type: "ASSIGNMENT_DUE_SOON", title: "t", body: "b", dedupeKey: "k2" }
    ]);
    expect(inserted).toBe(2);
    expect(prisma.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true })
    );
  });
});
