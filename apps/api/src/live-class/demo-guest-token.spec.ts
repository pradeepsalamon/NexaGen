/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { DemoGuestApproval } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { readDemoGuestToken, signDemoGuestToken } from "./demo-guest-token";
import { LiveClassAccessService } from "./live-class-access.service";

const CLASS_ID = "class-1";
const jwt = new JwtService({});

describe("demo guest token", () => {
  let prisma: any;
  let access: LiveClassAccessService;

  beforeEach(() => {
    prisma = {
      demoClassRegistration: {
        findUnique: jest.fn().mockResolvedValue({
          approval: DemoGuestApproval.APPROVED,
          class: { isDemo: true },
          classId: CLASS_ID,
          id: "reg-1"
        })
      },
      liveSession: { findUnique: jest.fn().mockResolvedValue({ classId: CLASS_ID, status: "LIVE" }) },
      user: { findUnique: jest.fn() }
    };
    access = new LiveClassAccessService(prisma, {} as any, jwt);
  });

  const token = () => signDemoGuestToken(jwt, { classId: CLASS_ID, registrationId: "reg-1" });

  it("round-trips and resolves the admitted guest of a live demo", async () => {
    await expect(access.resolveDemoGuest(await token(), CLASS_ID)).resolves.toMatchObject({
      registration: { id: "reg-1" }
    });
  });

  it("is never accepted as an access token", async () => {
    await expect(authenticateUser(jwt, prisma, await token())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects a missing, forged, or other-class token", async () => {
    await expect(access.resolveDemoGuest(undefined, CLASS_ID)).rejects.toBeInstanceOf(UnauthorizedException);
    const forged = await jwt.signAsync(
      { classId: CLASS_ID, sub: "reg-1", type: "demo_guest" },
      { secret: "not-the-secret" }
    );
    await expect(access.resolveDemoGuest(forged, CLASS_ID)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(access.resolveDemoGuest(await token(), "class-2")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects an access token posing as a guest token", async () => {
    const accessToken = await jwt.signAsync(
      { classId: CLASS_ID, sub: "reg-1", type: "access" },
      { secret: getApiEnv().JWT_ACCESS_SECRET }
    );
    expect(await readDemoGuestToken(jwt, accessToken)).toBeNull();
  });

  it("refuses a guest the coach removed, and a class that is not live", async () => {
    prisma.demoClassRegistration.findUnique.mockResolvedValueOnce({
      approval: DemoGuestApproval.DENIED,
      class: { isDemo: true },
      classId: CLASS_ID,
      id: "reg-1"
    });
    await expect(access.resolveDemoGuest(await token(), CLASS_ID)).rejects.toBeInstanceOf(ForbiddenException);
    prisma.liveSession.findUnique.mockResolvedValueOnce({ classId: CLASS_ID, status: "ENDED" });
    await expect(access.resolveDemoGuest(await token(), CLASS_ID)).rejects.toBeInstanceOf(BadRequestException);
  });
});
