import {
  Controller,
  Post,
  Req,
  Logger,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  UnauthorizedException,
  forwardRef,
} from "@nestjs/common";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { WebhookReceiver } from "livekit-server-sdk";
import { DisconnectReason } from "@livekit/protocol";
import { getApiEnv } from "@nexa-chess/config/api";
import { AttendanceService } from "./attendance.service";
import { resolveJoinAction } from "./attendance-session.util";
import { LiveClassRecordingService } from "../live-class/live-class-recording.service";
import { LiveClassScreenShareService } from "../live-class/live-class-screen-share.service";
import { PrismaService } from "../prisma/prisma.service";
import { API_ROUTES } from "@nexa-chess/types";

/**
 * How long after a session is opened a `participant_joined` webhook is treated
 * as the same join rather than a reconnect. Covers the token-request -> LiveKit
 * connect gap and LiveKit's webhook retries.
 */
const DUPLICATE_JOIN_WINDOW_MS = 2 * 60_000;

/**
 * Human-readable labels for LiveKit's `DisconnectReason` enum. Keyed by the enum
 * member (not a hardcoded numeric index) so it stays correct if LiveKit renumbers
 * or adds values — an unknown code falls back to its enum name, then `Reason N`.
 */
const DISCONNECT_REASON_LABELS: Partial<Record<DisconnectReason, string>> = {
  [DisconnectReason.UNKNOWN_REASON]: "Unknown",
  [DisconnectReason.CLIENT_INITIATED]: "Left voluntarily",
  [DisconnectReason.DUPLICATE_IDENTITY]: "Duplicate identity",
  [DisconnectReason.SERVER_SHUTDOWN]: "Server shutdown",
  [DisconnectReason.PARTICIPANT_REMOVED]: "Removed by coach",
  [DisconnectReason.ROOM_DELETED]: "Room ended",
  [DisconnectReason.STATE_MISMATCH]: "State mismatch",
  [DisconnectReason.JOIN_FAILURE]: "Join failure",
  [DisconnectReason.MIGRATION]: "Migrating",
  [DisconnectReason.SIGNAL_CLOSE]: "Signal connection closed",
  [DisconnectReason.ROOM_CLOSED]: "Room closed",
  [DisconnectReason.USER_UNAVAILABLE]: "User unavailable",
  [DisconnectReason.USER_REJECTED]: "User rejected",
  [DisconnectReason.SIP_TRUNK_FAILURE]: "SIP trunk failure",
};

function describeDisconnectReason(reason: DisconnectReason | undefined): string {
  if (reason === undefined || reason === null) return "Left";
  return (
    DISCONNECT_REASON_LABELS[reason] ??
    DisconnectReason[reason] ??
    `Reason ${reason}`
  );
}

@Controller()
export class AttendanceWebhookController {
  private readonly logger = new Logger(AttendanceWebhookController.name);
  private readonly env = getApiEnv();
  private webhookReceiver: WebhookReceiver | null = null;

  constructor(
    private readonly attendanceService: AttendanceService,
    @Inject(forwardRef(() => LiveClassScreenShareService))
    private readonly screenShare: LiveClassScreenShareService,
    @Inject(forwardRef(() => LiveClassRecordingService))
    private readonly recording: LiveClassRecordingService,
    private readonly prisma: PrismaService
  ) {
    try {
      const env = this.env;
      if (env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET) {
        this.webhookReceiver = new WebhookReceiver(
          env.LIVEKIT_API_KEY,
          env.LIVEKIT_API_SECRET
        );
        this.logger.log("LiveKit webhook receiver initialized.");
      } else {
        this.logger.warn("LiveKit credentials missing — webhook receiver disabled.");
      }
    } catch (error) {
      this.logger.error("Failed to initialize webhook receiver", error);
    }
  }

  @Post(API_ROUTES.attendance.webhook)
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() request: Request) {
    try {
      const body =
        typeof request.body === "string"
          ? request.body
          : JSON.stringify(request.body);

      let event: any;

      if (this.webhookReceiver) {
        // Verify the signature. A failure here means the payload is forged or
        // the shared secret is wrong — never fall through to processing it,
        // otherwise anyone can POST arbitrary attendance events.
        const authHeader = request.headers.authorization as string;
        try {
          event = await this.webhookReceiver.receive(body, authHeader);
        } catch (verifyError) {
          this.logger.error(
            "Rejected LiveKit webhook: signature verification failed"
          );
          // 401 rather than a 200 `{ ok: false }`: a caller that cannot sign is
          // not LiveKit, and swallowing it as a success hid broken webhooks from
          // our own E2E suite for weeks.
          throw new UnauthorizedException("Invalid webhook signature.");
        }
      } else {
        // No LiveKit credentials configured. Only accept unverified payloads
        // outside production so local development still works.
        if (this.env.NODE_ENV === "production") {
          this.logger.error(
            "Rejected LiveKit webhook: receiver unavailable in production"
          );
          throw new UnauthorizedException("Webhook receiver unavailable.");
        }

        this.logger.warn(
          "Processing unverified LiveKit webhook (development mode)"
        );
        event = typeof request.body === "string"
          ? JSON.parse(request.body)
          : request.body;
      }

      if (!event || !event.event) {
        this.logger.warn("Received webhook with no event type");
        return { ok: true };
      }

      this.logger.log(
        `LiveKit webhook: event=${event.event} room=${event.room?.name}`
      );

      // LiveKit retries webhooks; process each delivery once so a retry can't
      // add duplicate RECONNECT logs or inflate durations (AUDIT M1).
      if (event.id) {
        try {
          await this.prisma.processedWebhookEvent.create({
            data: { id: String(event.id), eventType: String(event.event) },
          });
        } catch (dedupeError) {
          if (
            dedupeError instanceof Prisma.PrismaClientKnownRequestError &&
            dedupeError.code === "P2002"
          ) {
            this.logger.debug(`Skipping already-processed webhook ${event.id}`);
            return { ok: true };
          }
          throw dedupeError;
        }
      }

      if (typeof event.event === "string" && event.event.startsWith("egress_")) {
        // Recording lifecycle — finalize `recordingUrl` only on success
        // (AUDIT M20).
        await this.handleEgressEvent(event);
      } else {
        await this.processEvent(event);
      }

      return { ok: true };
    } catch (error) {
      // Rejections (bad signature) must reach the caller as a 4xx — only
      // genuine processing failures are swallowed as 200 to stop LiveKit
      // retrying a payload we will never manage to handle.
      if (error instanceof HttpException) throw error;
      this.logger.error("Error processing LiveKit webhook", error);
      return { ok: false, error: "Processing error" };
    }
  }

  /**
   * True when the most recent log is an already-open session opened moments ago
   * by the token request, i.e. this webhook is the same join arriving late —
   * not a genuine reconnect. Also absorbs LiveKit's own webhook retries.
   */
  private isSameJoin(
    lastLog?: { eventType: string; sessionEnd: Date | null; timestamp: Date }
  ) {
    if (!lastLog) return false;
    if (lastLog.eventType !== "JOIN" && lastLog.eventType !== "RECONNECT") return false;
    if (lastLog.sessionEnd !== null) return false;

    const ageMs = Date.now() - lastLog.timestamp.getTime();
    return ageMs >= 0 && ageMs < DUPLICATE_JOIN_WINDOW_MS;
  }

  private async processEvent(event: any) {
    const roomName: string | undefined = event.room?.name;
    const participantIdentity: string | undefined =
      event.participant?.identity;

    if (!roomName) return;

    // Resolve classId from roomName (format: class_{classId})
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { roomName },
      select: { classId: true, coachId: true },
    });

    if (!liveSession) {
      this.logger.warn(`No session found for room: ${roomName}`);
      return;
    }

    const classId = liveSession.classId;

    // Extract the real userId from participantIdentity
    // Identity format is either "userId" or "userId_clientId"
    const userId = participantIdentity?.split("_")[0];

    if (!userId) return;

    // Skip guest participants (those with identity starting with "guest_")
    if (participantIdentity?.startsWith("guest_")) return;

    // Skip the recording bot. Egress' headless Chrome joins the room to compose
    // the recording (see LiveKitService.startRecording) with identity
    // `EG_<egressId>`, which the `split("_")[0]` above turns into a "EG" userId
    // — that lands in the student branch below and tries to write attendance for
    // a user that does not exist. It is not an attendee.
    const participantKind = event.participant?.kind;
    if (
      participantIdentity?.startsWith("EG_") ||
      participantKind === 2 || // ParticipantInfo_Kind.EGRESS
      participantKind === "EGRESS"
    ) {
      return;
    }

    const isCoach = userId === liveSession.coachId;
    const isBoard = participantIdentity?.endsWith("_board");

    // Per-tab id (`_<tabId>` LiveKit identity suffix, joinedSession.ts
    // #getTabClientId), used by the student join/leave paths below to tell two
    // concurrent tabs of the same student apart (§2.8 multi-tab misfire).
    const clientId =
      !isBoard && participantIdentity?.includes("_")
        ? participantIdentity.split("_").slice(1).join("_")
        : undefined;

    switch (event.event) {
      case "participant_joined": {
        if (isBoard) {
          await this.attendanceService.recordBoardJoinEvent(classId, liveSession.coachId);
          break;
        }

        if (isCoach) {
          const existing = await this.prisma.coachAttendance.findUnique({
            where: { classId },
            include: { logs: { orderBy: { timestamp: "desc" }, take: 1 } },
          });

          if (!existing) {
            await this.attendanceService.recordCoachJoinEvent(classId, userId, { source: "LIVEKIT" });
          } else {
            const lastLog = existing.logs[0];

            if (this.isSameJoin(lastLog)) {
              this.logger.debug(
                `Skipping duplicate coach join for coach=${userId} class=${classId}`
              );
              break;
            }

            const lastEvent = lastLog?.eventType;
            if (lastEvent === "JOIN" || lastEvent === "RECONNECT") {
              // Ghost drop
              await this.attendanceService.recordCoachLeaveEvent(classId, userId, "Ghost drop");
            }
            await this.attendanceService.recordCoachReconnectEvent(classId, userId);
          }
          break;
        }

        // Student logic. See resolveJoinAction for why this is clientId-scoped
        // rather than "whichever session is most recently open" (§2.8): a
        // second tab joining must not ghost-drop the first tab's still-live
        // session, or that first tab's own later clean leave would go on to
        // close the second tab's session out from under it.
        const existing = await this.prisma.classAttendance.findUnique({
          where: { classId_studentId: { classId, studentId: userId } },
        });
        const openLogs = existing
          ? await this.prisma.attendanceLog.findMany({
              where: {
                attendanceId: existing.id,
                eventType: { in: ["JOIN", "RECONNECT"] },
                sessionEnd: null,
              },
              select: { id: true, clientId: true, timestamp: true },
            })
          : [];

        const action = resolveJoinAction(
          !!existing,
          openLogs,
          clientId,
          new Date(),
          DUPLICATE_JOIN_WINDOW_MS
        );

        switch (action.kind) {
          case "FIRST_JOIN":
            await this.attendanceService.recordJoinEvent(classId, userId, {
              source: "LIVEKIT",
              clientId,
            });
            break;
          case "DUPLICATE_SKIP":
            // LiveClassService.getToken opens the session when the student
            // requests a token, moments before LiveKit emits
            // participant_joined. Treating that as a re-join produced a
            // phantom "Ghost drop" and an inflated reconnectCount on every
            // single join. See AUDIT.md H3.
            if (action.adoptLogId && clientId) {
              await this.prisma.attendanceLog.update({
                where: { id: action.adoptLogId },
                data: { clientId },
              });
            }
            this.logger.debug(
              `Skipping duplicate join for user=${userId} class=${classId}`
            );
            break;
          case "GHOST_DROP_RECONNECT":
            await this.attendanceService.recordLeaveEvent(classId, userId, "Ghost drop", {
              clientId,
            });
            await this.attendanceService.recordReconnectEvent(classId, userId, clientId);
            break;
          case "CONCURRENT_RECONNECT":
            await this.attendanceService.recordReconnectEvent(classId, userId, clientId);
            break;
        }
        break;
      }

      case "participant_left": {
        if (isBoard) {
          await this.attendanceService.recordBoardLeaveEvent(classId, liveSession.coachId);
          break;
        }

        const reasonText = describeDisconnectReason(
          event.participant?.disconnectReason
        );

        if (isCoach) {
          await this.attendanceService.recordCoachLeaveEvent(classId, userId, reasonText);
          break;
        }

        // Student logic. clientId lets this close only the tab that actually
        // left rather than whichever session happens to be open (§2.8).
        await this.attendanceService.recordLeaveEvent(classId, userId, reasonText, {
          clientId,
        });

        // Defense-in-depth: a clean stop-sharing click already calls
        // endScreenShare, but a crash/closed-tab disconnect wouldn't. Never
        // let this disrupt attendance recording above.
        try {
          await this.screenShare.endScreenShareOnDisconnect(classId, userId);
        } catch (error) {
          this.logger.warn(`Failed to clean up screen-share request for ${userId} in ${classId}`, error as Error);
        }
        break;
      }

      case "room_finished":
        await this.attendanceService.finalizeClassAttendance(classId);
        break;

      default:
        this.logger.debug(`Unhandled webhook event: ${event.event}`);
    }
  }

  private async handleEgressEvent(event: any) {
    const egressInfo = event.egressInfo ?? event.egress_info;
    if (!egressInfo) return;
    await this.recording.handleEgressEnded({
      eventType: typeof event.event === "string" ? event.event : undefined,
      egressId: egressInfo.egressId ?? egressInfo.egress_id,
      roomName: egressInfo.roomName ?? egressInfo.room_name,
      status: egressInfo.status,
      file: egressInfo.file,
      fileResults: egressInfo.fileResults ?? egressInfo.file_results,
    });
  }
}
