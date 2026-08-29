import {
  Controller,
  Post,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
  Inject,
  forwardRef,
} from "@nestjs/common";
import type { Request } from "express";
import { Prisma } from "@prisma/client";
import { WebhookReceiver } from "livekit-server-sdk";
import { getApiEnv } from "@nexa-chess/config/api";
import { AttendanceService } from "./attendance.service";
import { LiveClassService } from "../live-class/live-class.service";
import { PrismaService } from "../prisma/prisma.service";
import { API_ROUTES } from "@nexa-chess/types";

/**
 * How long after a session is opened a `participant_joined` webhook is treated
 * as the same join rather than a reconnect. Covers the token-request -> LiveKit
 * connect gap and LiveKit's webhook retries.
 */
const DUPLICATE_JOIN_WINDOW_MS = 2 * 60_000;

@Controller()
export class AttendanceWebhookController {
  private readonly logger = new Logger(AttendanceWebhookController.name);
  private readonly env = getApiEnv();
  private webhookReceiver: WebhookReceiver | null = null;

  constructor(
    private readonly attendanceService: AttendanceService,
    @Inject(forwardRef(() => LiveClassService))
    private readonly liveClassService: LiveClassService,
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
          return { ok: false, error: "Invalid signature" };
        }
      } else {
        // No LiveKit credentials configured. Only accept unverified payloads
        // outside production so local development still works.
        if (this.env.NODE_ENV === "production") {
          this.logger.error(
            "Rejected LiveKit webhook: receiver unavailable in production"
          );
          return { ok: false, error: "Webhook receiver unavailable" };
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
      this.logger.error("Error processing LiveKit webhook", error);
      // Return 200 to prevent retries on processing errors
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

    const isCoach = userId === liveSession.coachId;
    const isBoard = participantIdentity?.endsWith("_board");

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

        // Student logic
        const existing = await this.prisma.classAttendance.findUnique({
          where: { classId_studentId: { classId, studentId: userId } },
          include: { logs: { orderBy: { timestamp: "desc" }, take: 1 } },
        });

        if (!existing) {
          // First time joining
          await this.attendanceService.recordJoinEvent(classId, userId, { source: "LIVEKIT" });
        } else {
          const lastLog = existing.logs[0];

          // LiveClassService.getToken opens the session when the student
          // requests a token, moments before LiveKit emits participant_joined.
          // Treating that as a re-join produced a phantom "Ghost drop" and an
          // inflated reconnectCount on every single join. See AUDIT.md H3.
          if (this.isSameJoin(lastLog)) {
            this.logger.debug(
              `Skipping duplicate join for user=${userId} class=${classId}`
            );
            break;
          }

          const lastEvent = lastLog?.eventType;
          if (lastEvent === "JOIN" || lastEvent === "RECONNECT") {
            // Ghost drop
            await this.attendanceService.recordLeaveEvent(classId, userId, "Ghost drop");
          }
          await this.attendanceService.recordReconnectEvent(classId, userId);
        }
        break;
      }

      case "participant_left": {
        if (isBoard) {
          await this.attendanceService.recordBoardLeaveEvent(classId, liveSession.coachId);
          break;
        }

        // Map LiveKit DisconnectReason enum to human-readable string
        const reasons: Record<string, string> = {
          "0": "Unknown",
          "1": "Left voluntarily",
          "2": "Duplicate identity",
          "3": "Server shutdown",
          "4": "Removed by coach",
          "5": "Room ended",
          "6": "State mismatch",
          "7": "Join failure",
        };
        const reasonCode = event.participant?.disconnectReason?.toString();
        const reasonText = reasonCode ? (reasons[reasonCode] || `Reason ${reasonCode}`) : "Left";

        if (isCoach) {
          await this.attendanceService.recordCoachLeaveEvent(classId, userId, reasonText);
          break;
        }

        // Student logic
        await this.attendanceService.recordLeaveEvent(
          classId,
          userId,
          reasonText
        );
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
    await this.liveClassService.handleEgressEnded({
      egressId: egressInfo.egressId ?? egressInfo.egress_id,
      roomName: egressInfo.roomName ?? egressInfo.room_name,
      status: egressInfo.status,
      file: egressInfo.file,
      fileResults: egressInfo.fileResults ?? egressInfo.file_results,
    });
  }
}
