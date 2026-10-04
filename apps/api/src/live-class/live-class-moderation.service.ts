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
  LIVE_CLASS_MODERATION_TOPIC,
  type ModeratableSource,
  type ModerateAllRequest,
  type ModerateAllResponse,
  type KickParticipantRequest,
  type KickParticipantResponse,
  type ModerateParticipantRequest,
  type ModerateParticipantResponse,
  type ModerationNotice,
} from "@nexa-chess/types";
import {
  UserRole,
  WaitingRoomStatus,
} from "@prisma/client";
import { LiveClassAccessService } from "./live-class-access.service";
import { isCoachParticipant } from "./live-class.util";

/** Coach moderation: force-mute (one or all) and removing a student from the class. */
@Injectable()
export class LiveClassModerationService {
  private readonly logger = new Logger(LiveClassModerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly access: LiveClassAccessService
  ) {}

  /**
   * Switch off one participant's already-published mic, camera or screen share.
   *
   * Mute only -- there is no server-side "unmute": re-opening someone's
   * microphone without them touching it is a privacy hole, and LiveKit would
   * need the client to republish anyway. The participant turns it back on
   * themselves (unless the class policy locks that source off).
   */
  async moderateParticipant(
    accessToken: string | undefined,
    classId: string,
    body: ModerateParticipantRequest
  ): Promise<ModerateParticipantResponse> {
    const { user, liveSession } = await this.resolveModerator(accessToken, classId);
    if (isCoachParticipant(body.identity, liveSession.coachId)) {
      throw new BadRequestException("Use your own controls to mute yourself.");
    }

    const participants = await this.livekit.listParticipants(liveSession.roomName);
    const participant = participants.find((p) => p.identity === body.identity);
    if (!participant) {
      throw new NotFoundException("That participant is no longer in the class.");
    }

    let muted = false;
    for (const track of participant.tracks ?? []) {
      if (track.muted) continue;
      if (LiveKitService.trackSourceLabel(track.source) !== body.source) continue;
      await this.livekit.muteParticipantTrack(liveSession.roomName, participant.identity, track.sid);
      muted = true;
    }

    if (muted) {
      await this.announceForceMute(liveSession.roomName, participant.identity, body.source, user);
    }

    return { muted, identity: participant.identity, source: body.source };
  }

  /**
   * Coach "Mute all" / "All cameras off": switch the given sources off for
   * every student in the room. Off only — like `moderateParticipant`, there is
   * deliberately no way to turn someone's mic or camera on for them.
   */
  async moderateAll(
    accessToken: string | undefined,
    classId: string,
    body: ModerateAllRequest
  ): Promise<ModerateAllResponse> {
    const { user, liveSession } = await this.resolveModerator(accessToken, classId);
    const participants = await this.livekit.listParticipants(liveSession.roomName);

    let mutedCount = 0;
    for (const participant of participants) {
      if (isCoachParticipant(participant.identity, liveSession.coachId)) continue;
      let role: string | undefined;
      try {
        role = participant.metadata ? JSON.parse(participant.metadata).role : undefined;
      } catch {
        role = undefined;
      }
      if (role !== "STUDENT") continue;

      const mutedSources = new Set<ModeratableSource>();
      for (const track of participant.tracks ?? []) {
        if (track.muted) continue;
        const source = LiveKitService.trackSourceLabel(track.source);
        if (source !== "microphone" && source !== "camera") continue;
        if (!body.sources.includes(source)) continue;
        try {
          await this.livekit.muteParticipantTrack(liveSession.roomName, participant.identity, track.sid);
          mutedSources.add(source);
        } catch (error) {
          // One student's stale track must not stop the rest of the room.
          this.logger.warn(`Failed to mute ${participant.identity} in ${liveSession.roomName}`, error as Error);
        }
      }
      if (mutedSources.size === 0) continue;
      mutedCount += 1;
      for (const source of mutedSources) {
        await this.announceForceMute(liveSession.roomName, participant.identity, source, user);
      }
    }

    return { mutedCount };
  }

  /** Coach-owner / admin of a LIVE class — the only people who may switch someone's track off. */
  /**
   * Coach "Remove from class": disconnects every connection of one student and
   * blocks their rejoin for this session (a DENIED waiting-room row, checked in
   * `getToken`). Pulling them back in lifts it.
   */
  async kickParticipant(
    accessToken: string | undefined,
    classId: string,
    body: KickParticipantRequest
  ): Promise<KickParticipantResponse> {
    const { liveSession } = await this.resolveModerator(accessToken, classId);
    const studentId = body.identity.split("_")[0];
    if (isCoachParticipant(body.identity, liveSession.coachId)) {
      throw new BadRequestException("You can't remove yourself from your class.");
    }
    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: UserRole.STUDENT },
      select: { id: true },
    });
    if (!student) {
      throw new BadRequestException("Only students can be removed from a class.");
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.liveClassWaitingParticipant.upsert({
        where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId } },
        update: { status: WaitingRoomStatus.DENIED, resolvedAt: now },
        create: { liveSessionId: liveSession.id, studentId, status: WaitingRoomStatus.DENIED, resolvedAt: now },
      }),
      this.prisma.liveClassPull.updateMany({
        where: { liveSessionId: liveSession.id, studentId, status: { in: ["PENDING", "JOINED"] } },
        data: { status: "CANCELLED", resolvedAt: now },
      }),
    ]);

    const participants = await this.livekit.listParticipants(liveSession.roomName);
    let removed = 0;
    for (const p of participants) {
      if (p.identity.split("_")[0] !== studentId) continue;
      try {
        await this.livekit.removeParticipant(liveSession.roomName, p.identity);
        removed += 1;
      } catch (error) {
        this.logger.warn(`Could not remove ${p.identity} from ${liveSession.roomName}`, error as Error);
      }
    }
    return { removed };
  }

  private async resolveModerator(accessToken: string | undefined, classId: string) {
    const user = await this.access.authenticate(accessToken);

    if (
      user.role !== UserRole.COACH &&
      user.role !== UserRole.ADMIN &&
      user.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException("Only a coach can turn off someone else's microphone or camera.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({ where: { classId } });
    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }
    if (user.role === UserRole.COACH && liveSession.coachId !== user.id) {
      throw new ForbiddenException("You can only moderate your own classes.");
    }
    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException("Class is not currently live.");
    }
    return { user, liveSession };
  }

  /**
   * Best-effort explanation for a track that just went dead. The mute is
   * already enforced at the SFU, so a dropped packet costs a toast only.
   */
  private async announceForceMute(
    roomName: string,
    identity: string,
    source: ModeratableSource,
    by: { firstName: string; lastName: string | null }
  ) {
    try {
      const notice: ModerationNotice = {
        type: "FORCE_MUTE",
        identity,
        source,
        byName: [by.firstName, by.lastName].filter(Boolean).join(" ").trim() || "The coach",
      };
      await this.livekit.broadcastData(
        roomName,
        new TextEncoder().encode(JSON.stringify(notice)),
        LIVE_CLASS_MODERATION_TOPIC
      );
    } catch (error) {
      this.logger.warn(`Failed to announce force-mute in ${roomName}`, error as Error);
    }
  }
}
