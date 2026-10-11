import { ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ClassStatus, UserRole } from "@prisma/client";
import {
  LIVE_CLASS_SPECTATOR_IDENTITY_PREFIX,
  isSpectatorIdentity,
  liveBoardStateSchema,
  type LiveClassMonitorItem,
  type LiveClassMonitorResponse,
  type SpectateLiveClassResponse,
} from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassAccessService } from "./live-class-access.service";
import { LiveKitService } from "./livekit.service";
import { isCoachParticipant } from "./live-class.util";
import { LiveSessionStatus } from "./types/live-class.types";

const BOARD_SYNC_TOPIC = "board_sync";

/** Delays (ms) at which a fresh spectator's board is re-requested from the coach. */
const BOARD_SYNC_REQUEST_DELAYS = [1500, 5000];

type RoomParticipant = Awaited<ReturnType<LiveKitService["listParticipants"]>>[number];

const liveSessionInclude = {
  batch: { select: { id: true, name: true, _count: { select: { students: { where: { isDeleted: false } } } } } },
  class: { select: { id: true, title: true, topic: true, isDemo: true, startsAt: true, endsAt: true } },
  coach: { select: { id: true, firstName: true, lastName: true } },
} as const;

/**
 * Admin "Live now": lists every LIVE class and hands out a hidden, receive-only
 * LiveKit seat in any of them. Being ADMIN / SUPER_ADMIN is the whole check —
 * no enrolment, invite, waiting room or coach approval — and the seat can watch
 * and listen but never publish media or data, so it cannot disturb the class.
 */
@Injectable()
export class LiveClassSpectateService {
  private readonly logger = new Logger(LiveClassSpectateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly access: LiveClassAccessService
  ) {}

  private async getAdmin(accessToken: string | undefined) {
    const user = await this.access.authenticate(accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only admins can watch live classes.");
    }
    return user;
  }

  async listLiveClasses(accessToken: string | undefined): Promise<LiveClassMonitorResponse> {
    await this.getAdmin(accessToken);

    const sessions = await this.prisma.liveSession.findMany({
      where: { status: LiveSessionStatus.LIVE, class: { status: ClassStatus.LIVE } },
      include: liveSessionInclude,
      orderBy: { startedAt: "desc" },
    });

    const classes = await Promise.all(
      sessions.map(async (session) => this.toMonitorItem(session, await this.tryListParticipants(session.roomName)))
    );
    return { classes, generatedAt: new Date().toISOString() };
  }

  async spectate(
    accessToken: string | undefined,
    classId: string,
    clientId?: string
  ): Promise<SpectateLiveClassResponse> {
    const user = await this.getAdmin(accessToken);

    const session = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: liveSessionInclude,
    });
    if (!session) {
      throw new NotFoundException("Live class not found.");
    }
    if (session.status !== LiveSessionStatus.LIVE) {
      throw new NotFoundException("This class is not live any more.");
    }

    const tabId = clientId || Math.random().toString(36).slice(2, 10);
    const token = await this.livekit.generateSpectatorToken({
      roomName: session.roomName,
      participantIdentity: `${LIVE_CLASS_SPECTATOR_IDENTITY_PREFIX}${user.id}_${tabId}`,
      participantName: `${user.firstName} ${user.lastName || ""}`.trim(),
    });

    // A spectator holds no data grant, so it cannot ask for the board itself —
    // the same server-side REQUEST_SYNC the recorder relies on makes the
    // coach's client broadcast a FORCE_SYNC once the seat has connected.
    this.requestBoardSync(session.roomName);

    const parsedBoard = liveBoardStateSchema.safeParse(session.boardState);
    return {
      token,
      roomName: session.roomName,
      class: this.toMonitorItem(session, await this.tryListParticipants(session.roomName)),
      boardState: parsedBoard.success ? parsedBoard.data : null,
    };
  }

  private requestBoardSync(roomName: string) {
    const payload = new TextEncoder().encode(JSON.stringify({ type: "REQUEST_SYNC" }));
    for (const delayMs of BOARD_SYNC_REQUEST_DELAYS) {
      setTimeout(() => {
        this.livekit.broadcastData(roomName, payload, BOARD_SYNC_TOPIC).catch((error) =>
          this.logger.warn(
            `Failed to request a board sync for a spectator in ${roomName}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }, delayMs).unref?.();
    }
  }

  /** null when LiveKit could not be asked — never mistaken for an empty room. */
  private async tryListParticipants(roomName: string): Promise<RoomParticipant[] | null> {
    try {
      return await this.livekit.listParticipants(roomName);
    } catch (error) {
      this.logger.warn(`Could not list participants for ${roomName}`, error as Error);
      return null;
    }
  }

  private toMonitorItem(
    session: {
      classId: string;
      coachId: string;
      startedAt: Date | null;
      recordingStatus: string | null;
      batch: { id: string; name: string; _count: { students: number } } | null;
      class: { title: string | null; topic: string | null; isDemo: boolean; startsAt: Date; endsAt: Date };
      coach: { firstName: string; lastName: string | null };
    },
    participants: RoomParticipant[] | null
  ): LiveClassMonitorItem {
    return {
      classId: session.classId,
      title: session.class.title || session.class.topic || session.batch?.name || "Live class",
      topic: session.class.topic,
      isDemo: session.class.isDemo,
      batchId: session.batch?.id ?? null,
      batchName: session.batch?.name ?? null,
      coachId: session.coachId,
      coachName: `${session.coach.firstName} ${session.coach.lastName || ""}`.trim(),
      startsAt: session.class.startsAt.toISOString(),
      endsAt: session.class.endsAt.toISOString(),
      startedAt: session.startedAt?.toISOString() ?? null,
      enrolledCount: session.batch?._count.students ?? 0,
      studentsInRoom: participants ? LiveClassSpectateService.countStudents(participants) : null,
      coachInRoom: participants ? participants.some((p) => isCoachParticipant(p.identity, session.coachId)) : null,
      isRecording: session.recordingStatus === "RECORDING",
    };
  }

  /** Distinct students (and demo guests) connected; several tabs of one person count once. */
  static countStudents(participants: Pick<RoomParticipant, "identity" | "metadata">[]): number {
    const people = new Set<string>();
    for (const p of participants) {
      if (isSpectatorIdentity(p.identity)) continue;
      let role: string | undefined;
      try {
        role = p.metadata ? (JSON.parse(p.metadata) as { role?: string }).role : undefined;
      } catch {
        role = undefined;
      }
      if (role !== "STUDENT") continue;
      people.add(p.identity.startsWith("guest_") ? p.identity : p.identity.split("_")[0]);
    }
    return people.size;
  }
}
