import { UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { TokenExpiredError } from "@nestjs/jwt";
import type { PrismaService } from "../prisma/prisma.service";
import { authenticateUser, verifyAccessToken } from "./authenticate";

describe("authenticateUser", () => {
  let jwt: { verifyAsync: jest.Mock };
  let prisma: { user: { findUnique: jest.Mock } };

  const run = (token: string | undefined, args?: { include: { coachProfile: true } }) =>
    args
      ? authenticateUser(jwt as unknown as JwtService, prisma as unknown as PrismaService, token, args)
      : authenticateUser(jwt as unknown as JwtService, prisma as unknown as PrismaService, token);

  beforeEach(() => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ type: "access", sub: "user_1" }) };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: "user_1", status: "ACTIVE", role: "COACH" }) }
    };
  });

  it("returns the active user behind a valid access token", async () => {
    await expect(run("token")).resolves.toMatchObject({ id: "user_1" });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "user_1" } });
  });

  it("rejects a missing token", async () => {
    await expect(run(undefined)).rejects.toThrow("Access token is missing.");
  });

  // A raw TokenExpiredError becomes a 500, which the web client never refreshes on.
  it("turns an expired token into a 401, not a 500", async () => {
    jwt.verifyAsync.mockRejectedValue(new TokenExpiredError("jwt expired", new Date()));
    await expect(run("token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects a token that is not an access token", async () => {
    jwt.verifyAsync.mockResolvedValue({ type: "refresh", sub: "user_1" });
    await expect(run("token")).rejects.toThrow("Invalid token type.");
  });

  it("rejects a suspended or deleted account even with a valid token", async () => {
    prisma.user.findUnique.mockResolvedValueOnce({ id: "user_1", status: "SUSPENDED" });
    await expect(run("token")).rejects.toThrow("Invalid session.");
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(run("token")).rejects.toThrow("Invalid session.");
  });

  it("passes an include through to the user lookup", async () => {
    await run("token", { include: { coachProfile: true } });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "user_1" },
      include: { coachProfile: true }
    });
  });

  it("verifyAccessToken never touches the database", async () => {
    await expect(verifyAccessToken(jwt as unknown as JwtService, "token")).resolves.toMatchObject({
      sub: "user_1"
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
