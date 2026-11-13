import { BadRequestException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { PrismaService } from "../prisma/prisma.service";
import { EmailPreferencesService } from "./email-preferences.service";

jest.mock("../auth/authenticate", () => ({
  authenticateUser: jest.fn()
}));
import { authenticateUser } from "../auth/authenticate";

describe("EmailPreferencesService", () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock } };
  let service: EmailPreferencesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    };
    service = new EmailPreferencesService({} as JwtService, prisma as unknown as PrismaService);
    (authenticateUser as jest.Mock).mockResolvedValue({ id: "u1", notificationEmailOptOutAt: null });
  });

  it("reports the signed-in person's own setting", async () => {
    await expect(service.getMine("token")).resolves.toEqual({ notificationEmails: true });
  });

  it("turns notification emails off and back on for the signed-in person", async () => {
    await expect(service.updateMine("token", { notificationEmails: false })).resolves.toEqual({
      notificationEmails: false
    });
    expect(prisma.user.update.mock.calls[0][0]).toMatchObject({
      data: { notificationEmailOptOutAt: expect.any(Date) },
      where: { id: "u1" }
    });

    (authenticateUser as jest.Mock).mockResolvedValue({ id: "u1", notificationEmailOptOutAt: new Date() });
    await expect(service.updateMine("token", { notificationEmails: true })).resolves.toEqual({
      notificationEmails: true
    });
    expect(prisma.user.update.mock.calls[1][0].data).toEqual({ notificationEmailOptOutAt: null });
  });

  it("writes nothing when the setting already matches", async () => {
    await service.updateMine("token", { notificationEmails: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  describe("the link in an email", () => {
    it("unsubscribes the account the token belongs to, without a session", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "u2", notificationEmailOptOutAt: null });

      await expect(
        service.setByLink({ notificationEmails: false, token: "t".repeat(40) })
      ).resolves.toEqual({ notificationEmails: false });

      expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ emailUnsubscribeToken: "t".repeat(40) });
      expect(prisma.user.update.mock.calls[0][0].where).toEqual({ id: "u2" });
      expect(authenticateUser).not.toHaveBeenCalled();
    });

    it("refuses an unknown token", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setByLink({ notificationEmails: false, token: "x".repeat(40) })).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("targetFor", () => {
    it("makes the token on the first send and puts it in the link", async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: "a@example.com",
        emailUnsubscribeToken: null,
        notificationEmailOptOutAt: null
      });

      const target = await service.targetFor("u1");

      const token = prisma.user.updateMany.mock.calls[0][0].data.emailUnsubscribeToken;
      expect(token.length).toBeGreaterThan(40);
      expect(target).toEqual({
        email: "a@example.com",
        optedOut: false,
        unsubscribeUrl: expect.stringContaining(`/unsubscribe?token=${token}`)
      });
    });

    it("reuses the saved token and reports an opt-out", async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: "a@example.com",
        emailUnsubscribeToken: "saved-token",
        notificationEmailOptOutAt: new Date()
      });

      const target = await service.targetFor("u1");

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(target).toMatchObject({ optedOut: true });
      expect(target?.unsubscribeUrl).toContain("token=saved-token");
    });

    it("mails the token that won when two sends race", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ email: "a@example.com", emailUnsubscribeToken: null, notificationEmailOptOutAt: null })
        .mockResolvedValueOnce({ emailUnsubscribeToken: "winner" });
      prisma.user.updateMany.mockResolvedValue({ count: 0 });

      expect((await service.targetFor("u1"))?.unsubscribeUrl).toContain("token=winner");
    });

    it("is null for an account that is gone", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.targetFor("gone")).resolves.toBeNull();
    });
  });
});
