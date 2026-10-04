import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { JwtService } from "@nestjs/jwt";
import { LiveSessionStatus } from "./types/live-class.types";
import {
  UserRole,
} from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";

/** Who may enter a live class: authentication plus participant / manager checks shared by every in-room feature. */
@Injectable()
export class LiveClassAccessService {
  private readonly logger = new Logger(LiveClassAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly jwtService: JwtService
  ) {}

  authenticate(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken, {
      include: { coachProfile: true, studentProfile: true }
    });
  }

  /**
   * Loads the live session for a class and asserts the caller may participate in
   * it: the owning coach, a student enrolled in the batch, or an admin.
   */
  async getAccessibleLiveSession(
    user: { id: string; role: UserRole },
    classId: string,
    notFoundMessage = "Live session not found."
  ) {
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } }
    });

    if (!liveSession) {
      throw new NotFoundException(notFoundMessage);
    }

    const isCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;
    const isStudent =
      user.role === UserRole.STUDENT &&
      (!!liveSession.batch?.students.some((s) => s.studentId === user.id) ||
        // A coach may pull in a student from outside the batch.
        !!(await this.prisma.liveClassPull.findFirst({
          where: { liveSessionId: liveSession.id, studentId: user.id, status: { in: ["PENDING", "JOINED"] } },
          select: { id: true },
        })));
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You do not have access to this class.");
    }

    return liveSession;
  }

  /**
   * Public: authenticate the caller and assert they may participate in the class
   * (owning coach, enrolled student, or admin). For sibling modules that layer
   * their own in-room features on top of a live class.
   */
  async resolveParticipant(accessToken: string | undefined, classId: string) {
    const user = await this.authenticate(accessToken);
    const liveSession = await this.getAccessibleLiveSession(user, classId);
    return { user, liveSession };
  }

  /**
   * Public: authenticate the caller and assert they own the class (coach) or are
   * an admin. `requireLive` additionally asserts the session is LIVE.
   */
  async resolveClassManager(
    accessToken: string | undefined,
    classId: string,
    opts: { requireLive?: boolean } = {},
  ) {
    const user = await this.authenticate(accessToken);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    if (user.role !== UserRole.COACH && !isAdmin) {
      throw new ForbiddenException("You do not have permission to manage this class.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }
    if (user.role === UserRole.COACH && liveSession.coachId !== user.id) {
      throw new ForbiddenException("You can only manage your own classes.");
    }
    if (opts.requireLive && liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }

    return { user, liveSession };
  }

  /** Public: user ids connected to the room right now (empty when LiveKit is unreachable). */
  async connectedUserIds(roomName: string): Promise<Set<string>> {
    try {
      const participants = await this.livekit.listParticipants(roomName);
      return new Set(participants.map((p) => p.identity.split("_")[0]));
    } catch (error) {
      this.logger.warn(`Could not list participants for ${roomName}`, error as Error);
      return new Set();
    }
  }
}
