import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import type { PresenceHeartbeatResponse, PresenceLiveClass } from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { authenticateUser } from "../auth/authenticate";

/** Skip the write when the last one is this recent — tabs ping every ~15s. */
const WRITE_THROTTLE_MS = 10_000;

const classTopic = (c: { topic: string | null; title: string | null } | null) =>
  c?.topic || c?.title || "Live Class";

const personName = (u: { firstName: string; lastName: string | null }) =>
  `${u.firstName} ${u.lastName ?? ""}`.trim();

@Injectable()
export class PresenceService {

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
          class: {
            batch: { isDeleted: false, students: { some: { studentId: user.id, isDeleted: false } } }
          }
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

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}
