import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { LiveSessionStatus } from "./types/live-class.types";
import {
  liveClassSettingsSchema,
  LIVE_CLASS_WAITING_ROOM_TOPIC,
  type LiveClassSettings,
  type ResolveWaitingRoomRequest,
  type WaitingRoomEntry,
  type WaitingRoomEvent,
  type WaitingRoomListResponse,
} from "@nexa-chess/types";
import {
  DemoGuestApproval,
  WaitingRoomStatus,
} from "@prisma/client";
import { LiveClassAccessService } from "./live-class-access.service";

/** Waiting room: gating students (and demo guests) until the coach admits them. */
@Injectable()
export class LiveClassWaitingRoomService {
  private readonly logger = new Logger(LiveClassWaitingRoomService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly access: LiveClassAccessService
  ) {}

  /** Waiting-room entries for demo guests key on this + the registration id. */
  static readonly GUEST_WAITING_PREFIX = "guest:";

  private static toWaitingRoomEntry(row: {
    id: string;
    status: WaitingRoomStatus;
    requestedAt: Date;
    student: { firstName: string; lastName: string | null; avatarUrl: string | null };
    studentId: string;
  }): WaitingRoomEntry {
    return {
      id: row.id,
      studentId: row.studentId,
      studentName: `${row.student.firstName} ${row.student.lastName || ""}`.trim(),
      avatarUrl: row.student.avatarUrl,
      status: row.status,
      requestedAt: row.requestedAt.toISOString(),
    };
  }

  static toGuestWaitingRoomEntry(row: {
    id: string;
    name: string;
    approval: DemoGuestApproval;
    createdAt: Date;
  }): WaitingRoomEntry {
    return {
      id: row.id,
      studentId: `${LiveClassWaitingRoomService.GUEST_WAITING_PREFIX}${row.id}`,
      studentName: `${row.name} (guest)`,
      avatarUrl: null,
      status: row.approval === DemoGuestApproval.APPROVED ? "ADMITTED" : row.approval,
      requestedAt: row.createdAt.toISOString()
    };
  }

  /** Best-effort nudge to any coach/admin already connected. Never throws. */
  async announceWaitingRoomEvent(
    roomName: string,
    type: WaitingRoomEvent["type"],
    entry: WaitingRoomEntry,
  ): Promise<void> {
    try {
      const event: WaitingRoomEvent = { type, entry };
      await this.livekit.broadcastData(
        roomName,
        new TextEncoder().encode(JSON.stringify(event)),
        LIVE_CLASS_WAITING_ROOM_TOPIC,
      );
    } catch (error) {
      this.logger.warn(`Failed to announce waiting-room event in ${roomName}`, error as Error);
    }
  }

  /**
   * Blocks a student's token request until a coach admits them. Called from
   * `getToken` only when the class's resolved settings enable the waiting
   * room. Returns normally (falls through to token minting) once the
   * student's row is ADMITTED; otherwise throws a structured, client-known
   * error the web app polls or shows a "not admitted" screen for.
   */
  async gateWaitingRoom(
    liveSession: { id: string; roomName: string },
    user: { id: string },
  ): Promise<void> {
    // The coach explicitly pulled this student in — that is the admission.
    const pulled = await this.prisma.liveClassPull.findFirst({
      where: { liveSessionId: liveSession.id, studentId: user.id, status: { in: ["PENDING", "JOINED"] } },
      select: { id: true },
    });
    if (pulled) return;

    const existing = await this.prisma.liveClassWaitingParticipant.findUnique({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
    });

    if (existing?.status === WaitingRoomStatus.ADMITTED) {
      return;
    }

    if (existing?.status === WaitingRoomStatus.DENIED) {
      throw new ForbiddenException({
        message: "The coach has not admitted you to this class.",
        code: "JOIN_DENIED",
      });
    }

    if (!existing) {
      const created = await this.prisma.liveClassWaitingParticipant.create({
        data: { liveSessionId: liveSession.id, studentId: user.id },
        include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
      });
      // Only announce on the transition into PENDING — the client silently
      // re-polls this same gate every few seconds, and re-announcing on every
      // poll would spam the coach with a fresh toast each time.
      await this.announceWaitingRoomEvent(
        liveSession.roomName,
        "JOIN_REQUESTED",
        LiveClassWaitingRoomService.toWaitingRoomEntry(created),
      );
    }

    throw new BadRequestException({
      message: "Waiting for the coach to let you in.",
      code: "WAITING_FOR_ADMIT",
    });
  }

  /** Coach-owner/admin: students currently pending admission, oldest first. */
  // ─── Pull a student into class ───────────────────────────────

  async getWaitingRoomList(
    accessToken: string | undefined,
    classId: string,
  ): Promise<WaitingRoomListResponse> {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);

    const [rows, guests] = await Promise.all([
      this.prisma.liveClassWaitingParticipant.findMany({
        where: { liveSessionId: liveSession.id, status: WaitingRoomStatus.PENDING },
        include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
        orderBy: { requestedAt: "asc" },
      }),
      this.prisma.demoClassRegistration.findMany({
        where: { classId, approval: DemoGuestApproval.PENDING },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    return {
      entries: [
        ...rows.map((row) => LiveClassWaitingRoomService.toWaitingRoomEntry(row)),
        ...guests.map((guest) => LiveClassWaitingRoomService.toGuestWaitingRoomEntry(guest)),
      ],
    };
  }

  /** Coach-owner/admin: admit or deny one pending student. */
  async resolveWaitingRoomEntry(
    accessToken: string | undefined,
    classId: string,
    body: ResolveWaitingRoomRequest,
  ): Promise<WaitingRoomEntry> {
    const { user, liveSession } = await this.access.resolveClassManager(accessToken, classId);

    if (body.studentId.startsWith(LiveClassWaitingRoomService.GUEST_WAITING_PREFIX)) {
      return this.resolveDemoGuest(classId, liveSession.roomName, body);
    }

    const status = body.action === "ADMIT" ? WaitingRoomStatus.ADMITTED : WaitingRoomStatus.DENIED;
    // The `status: PENDING` filter is the idempotency guard against a
    // double-click or two coach tabs resolving the same request at once.
    const { count } = await this.prisma.liveClassWaitingParticipant.updateMany({
      where: { liveSessionId: liveSession.id, studentId: body.studentId, status: WaitingRoomStatus.PENDING },
      data: { status, resolvedAt: new Date(), resolvedById: user.id },
    });

    if (count === 0) {
      throw new NotFoundException("No pending request for that student.");
    }

    const updated = await this.prisma.liveClassWaitingParticipant.findUniqueOrThrow({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: body.studentId } },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    const entry = LiveClassWaitingRoomService.toWaitingRoomEntry(updated);
    await this.announceWaitingRoomEvent(liveSession.roomName, "REQUEST_RESOLVED", entry);
    return entry;
  }

  /** Coach-owner/admin: admit or deny an uninvited demo guest (INVITE_ONLY). */
  private async resolveDemoGuest(
    classId: string,
    roomName: string,
    body: ResolveWaitingRoomRequest,
  ): Promise<WaitingRoomEntry> {
    const registrationId = body.studentId.slice(LiveClassWaitingRoomService.GUEST_WAITING_PREFIX.length);
    // Status-filtered, like the student path: a double-click resolves once.
    const { count } = await this.prisma.demoClassRegistration.updateMany({
      where: { id: registrationId, classId, approval: DemoGuestApproval.PENDING },
      data: {
        approval: body.action === "ADMIT" ? DemoGuestApproval.APPROVED : DemoGuestApproval.DENIED,
        approvalAt: new Date(),
      },
    });
    if (count === 0) {
      throw new NotFoundException("No pending request for that guest.");
    }

    const updated = await this.prisma.demoClassRegistration.findUniqueOrThrow({ where: { id: registrationId } });
    const entry = LiveClassWaitingRoomService.toGuestWaitingRoomEntry(updated);
    await this.announceWaitingRoomEvent(roomName, "REQUEST_RESOLVED", entry);
    return entry;
  }

  /** Student: (re)request admission, most commonly after a denial. */
  async requestWaitingRoomAdmission(
    accessToken: string | undefined,
    classId: string,
  ): Promise<WaitingRoomEntry> {
    const { user, liveSession } = await this.access.resolveParticipant(accessToken, classId);
    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }

    let effectiveSettings: LiveClassSettings | null = null;
    try {
      if (liveSession.effectiveSettings) {
        effectiveSettings = liveClassSettingsSchema.parse(liveSession.effectiveSettings);
      }
    } catch (error) {
      this.logger.warn(`Invalid effectiveSettings for class ${classId}`, error as Error);
    }
    if (effectiveSettings?.waitingRoom !== "ENABLED") {
      throw new BadRequestException("This class does not use a waiting room.");
    }

    const updated = await this.prisma.liveClassWaitingParticipant.upsert({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: user.id } },
      create: { liveSessionId: liveSession.id, studentId: user.id },
      update: { status: WaitingRoomStatus.PENDING, resolvedAt: null, resolvedById: null },
      include: { student: { select: { firstName: true, lastName: true, avatarUrl: true } } },
    });

    const entry = LiveClassWaitingRoomService.toWaitingRoomEntry(updated);
    // Explicit user click, not a silent poll — always announce.
    await this.announceWaitingRoomEvent(liveSession.roomName, "JOIN_REQUESTED", entry);
    return entry;
  }
}
