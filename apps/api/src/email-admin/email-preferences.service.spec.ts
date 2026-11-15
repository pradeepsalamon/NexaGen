import { BadRequestException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { EMAIL_CATEGORIES } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { EmailPreferencesService, isOptedOut } from "./email-preferences.service";

jest.mock("../auth/authenticate", () => ({
  authenticateUser: jest.fn()
}));
import { authenticateUser } from "../auth/authenticate";

const ALL_ON = { emailOptOutCategories: [], notificationEmailOptOutAt: null };

describe("EmailPreferencesService", () => {
  let prisma: { user: { findUnique: jest.Mock; update: jest.Mock; updateMany: jest.Mock } };
  let service: EmailPreferencesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...ALL_ON, ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      }
    };
    service = new EmailPreferencesService({} as JwtService, prisma as unknown as PrismaService);
    (authenticateUser as jest.Mock).mockResolvedValue({ id: "u1", ...ALL_ON });
  });

  it("reports the signed-in person's own setting", async () => {
    await expect(service.getMine("token")).resolves.toEqual({ disabledCategories: [], notificationEmails: true });
  });

  it("turns notification emails off and back on for the signed-in person", async () => {
    await expect(service.updateMine("token", { notificationEmails: false })).resolves.toMatchObject({
      notificationEmails: false
    });
    expect(prisma.user.update.mock.calls[0][0]).toMatchObject({
      data: { notificationEmailOptOutAt: expect.any(Date) },
      where: { id: "u1" }
    });

    (authenticateUser as jest.Mock).mockResolvedValue({ ...ALL_ON, id: "u1", notificationEmailOptOutAt: new Date() });
    await expect(service.updateMine("token", { notificationEmails: true })).resolves.toMatchObject({
      notificationEmails: true
    });
    expect(prisma.user.update.mock.calls[1][0].data).toEqual({ notificationEmailOptOutAt: null });
  });

  it("saves the kinds turned off, in catalogue order and without repeats", async () => {
    await expect(
      service.updateMine("token", { disabledCategories: ["REFERRALS", "CLASSES", "REFERRALS"] })
    ).resolves.toEqual({ disabledCategories: ["CLASSES", "REFERRALS"], notificationEmails: true });
    expect(prisma.user.update.mock.calls[0][0].data).toEqual({ emailOptOutCategories: ["CLASSES", "REFERRALS"] });
  });

  it("writes nothing when the setting already matches", async () => {
    await service.updateMine("token", { disabledCategories: [], notificationEmails: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  describe("the link in an email", () => {
    it("unsubscribes the account the token belongs to, without a session", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ALL_ON, id: "u2" });

      await expect(
        service.setByLink({ notificationEmails: false, token: "t".repeat(40) })
      ).resolves.toMatchObject({ notificationEmails: false });

      expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ emailUnsubscribeToken: "t".repeat(40) });
      expect(prisma.user.update.mock.calls[0][0].where).toEqual({ id: "u2" });
      expect(authenticateUser).not.toHaveBeenCalled();
    });

    it("with a category stops only that kind", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ALL_ON, emailOptOutCategories: ["REFERRALS"], id: "u2" });

      await expect(
        service.setByLink({ category: "CLASSES", notificationEmails: false, token: "t".repeat(40) })
      ).resolves.toEqual({ disabledCategories: ["CLASSES", "REFERRALS"], notificationEmails: true });
    });

    it("turning one kind back on while everything is off resumes only that kind", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ALL_ON, id: "u2", notificationEmailOptOutAt: new Date() });

      await expect(
        service.setByLink({ category: "HOMEWORK", notificationEmails: true, token: "t".repeat(40) })
      ).resolves.toEqual({
        disabledCategories: EMAIL_CATEGORIES.filter((category) => category !== "HOMEWORK"),
        notificationEmails: true
      });
    });

    it("refuses an unknown token", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.setByLink({ notificationEmails: false, token: "x".repeat(40) })).rejects.toThrow(
        BadRequestException
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe("one-click (RFC 8058)", () => {
    it("turns off the email's own category", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ALL_ON, id: "u2" });
      await expect(service.oneClick({ category: "ANNOUNCEMENTS", token: "t".repeat(40) })).resolves.toEqual({ ok: true });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ emailOptOutCategories: ["ANNOUNCEMENTS"] });
    });

    it("without a category turns everything off, and never back on", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ALL_ON, id: "u2" });
      await service.oneClick({ token: "t".repeat(40) });
      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ notificationEmailOptOutAt: expect.any(Date) });
    });

    it("refuses an unknown token", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.oneClick({ token: "x".repeat(40) })).rejects.toThrow(BadRequestException);
    });
  });

  describe("isOptedOut", () => {
    it("the master switch stops every kind; a kind stops only itself", () => {
      expect(isOptedOut({ emailOptOutCategories: [], notificationEmailOptOutAt: new Date() }, "CLASSES")).toBe(true);
      expect(isOptedOut({ emailOptOutCategories: ["CLASSES"], notificationEmailOptOutAt: null }, "CLASSES")).toBe(true);
      expect(isOptedOut({ emailOptOutCategories: ["CLASSES"], notificationEmailOptOutAt: null }, "HOMEWORK")).toBe(false);
      expect(isOptedOut({ emailOptOutCategories: ["CLASSES"], notificationEmailOptOutAt: null })).toBe(false);
    });
  });

  describe("targetFor", () => {
    it("makes the token on the first send and puts it in both links", async () => {
      prisma.user.findUnique.mockResolvedValue({ ...ALL_ON, email: "a@example.com", emailUnsubscribeToken: null });

      const target = await service.targetFor("u1", "CLASSES");

      const token = prisma.user.updateMany.mock.calls[0][0].data.emailUnsubscribeToken;
      expect(token.length).toBeGreaterThan(40);
      expect(target).toEqual({
        email: "a@example.com",
        oneClickUrl: expect.stringContaining(`/api/email-preferences/one-click?token=${token}&category=CLASSES`),
        optedOut: false,
        unsubscribeUrl: expect.stringContaining(`/unsubscribe?token=${token}&category=CLASSES`)
      });
    });

    it("reuses the saved token and reports an opt-out", async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...ALL_ON,
        email: "a@example.com",
        emailUnsubscribeToken: "saved-token",
        notificationEmailOptOutAt: new Date()
      });

      const target = await service.targetFor("u1");

      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(target).toMatchObject({ optedOut: true });
      expect(target?.unsubscribeUrl).toContain("token=saved-token");
      expect(target?.unsubscribeUrl).not.toContain("category=");
    });

    it("reports an opt-out of just this email's kind", async () => {
      prisma.user.findUnique.mockResolvedValue({
        email: "a@example.com",
        emailOptOutCategories: ["HOMEWORK"],
        emailUnsubscribeToken: "saved-token",
        notificationEmailOptOutAt: null
      });
      await expect(service.targetFor("u1", "HOMEWORK")).resolves.toMatchObject({ optedOut: true });
      await expect(service.targetFor("u1", "CLASSES")).resolves.toMatchObject({ optedOut: false });
    });

    it("mails the token that won when two sends race", async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ ...ALL_ON, email: "a@example.com", emailUnsubscribeToken: null })
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
