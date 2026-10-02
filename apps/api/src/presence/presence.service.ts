import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import { getApiEnv } from "@nexa-chess/config/api";
import type { PresenceHeartbeatResponse, PresenceLiveClass } from "@nexa-chess/types";
import type { AccessTokenPayload } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";

/** Skip the write when the last one is this recent — tabs ping every ~15s. */
const WRITE_THROTTLE_MS = 10_000;

const classTopic = (c: { topic: string | null; title: string | null } | null) =>
  c?.topic || c?.title || "Live Class";

const personName = (u: { firstName: string; lastName: string | null }) =>
  `${u.firstName} ${u.lastName ?? ""}`.trim();

@Injectable()
export class PresenceService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Marks the caller as inside the app and, for a student, hands back the class
   * live for them right now plus any pending coach pull. This one poll is what
   * delivers a pull both to a student already in the app and to one who logs in
   * later (their first heartbeat fires on load).
   */
  async heartbeat(accessToken: string | undefined): Promise<PresenceHeartbeatResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const now = new Date();

    await this.prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [
          { lastSeenAt: null },
          { lastSeenAt: { lt: new Date(now.getTime() - WRITE_THROTTLE_MS) } }
        ]
      },
      data: { lastSeenAt: now }
    });

    if (user.role === UserRole.COACH) {
      const own = await this.prisma.liveSession.findFirst({
        where: { status: "LIVE", coachId: user.id },
        orderBy: { startedAt: "desc" },
        include: {
          class: { select: { id: true, title: true, topic: true } },
          coach: { select: { firstName: true, lastName: true } }
        }
      });
      return { liveClass: own ? this.toLiveClass(own) : null, pull: null };
    }

    if (user.role !== UserRole.STUDENT) {
      return { liveClass: null, pull: null };
    }

    const [live, pull] = await Promise.all([
      this.prisma.liveSession.findFirst({
        where: {
          status: "LIVE",
          class: { batch: { students: { some: { studentId: user.id, isDeleted: false } } } }
        },
        orderBy: { startedAt: "desc" },
        include: {
          class: { select: { id: true, title: true, topic: true } },
          coach: { select: { firstName: true, lastName: true } }
        }
      }),
      // A pull only means something while its class is still live.
      this.prisma.liveClassPull.findFirst({
        where: { studentId: user.id, status: "PENDING", liveSession: { status: "LIVE" } },
        orderBy: { requestedAt: "desc" },
        include: {
          liveSession: {
            include: {
              class: { select: { id: true, title: true, topic: true } },
              coach: { select: { firstName: true, lastName: true } }
            }
          }
        }
      })
    ]);

    return {
      liveClass: live ? this.toLiveClass(live) : null,
      pull: pull
        ? {
            id: pull.id,
            classId: pull.liveSession.classId,
            topic: classTopic(pull.liveSession.class),
            coachName: personName(pull.liveSession.coach),
            requestedAt: pull.requestedAt.toISOString()
          }
        : null
    };
  }

  private toLiveClass(live: {
    classId: string;
    class: { topic: string | null; title: string | null } | null;
    coach: { firstName: string; lastName: string | null };
    startedAt: Date | null;
  }): PresenceLiveClass {
    return {
      classId: live.classId,
      topic: classTopic(live.class),
      coachName: personName(live.coach),
      startedAt: live.startedAt?.toISOString() ?? null
    };
  }

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: this.env.JWT_ACCESS_SECRET
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired token.");
    }

    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, status: true }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session or unauthorized.");
    }

    return user;
  }
}
