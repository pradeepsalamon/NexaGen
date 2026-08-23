import {
  Controller,
  Post,
  Req,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import type { Request } from "express";
import { WebhookReceiver } from "livekit-server-sdk";
import { getApiEnv } from "@nexa-chess/config/api";
import { AttendanceService } from "./attendance.service";
import { PrismaService } from "../prisma/prisma.service";
import { API_ROUTES } from "@nexa-chess/types";

@Controller()
export class AttendanceWebhookController {
  private readonly logger = new Logger(AttendanceWebhookController.name);
  private webhookReceiver: WebhookReceiver | null = null;

  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly prisma: PrismaService
  ) {
    try {
      const env = getApiEnv();
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
        // Verify signature in production
        const authHeader = request.headers.authorization as string;
        try {
          event = await this.webhookReceiver.receive(body, authHeader);
        } catch (verifyError) {
          this.logger.warn("Webhook signature verification failed, processing raw body");
          event = JSON.parse(body);
        }
      } else {
        // Dev mode: parse without verification
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

      await this.processEvent(event);

      return { ok: true };
    } catch (error) {
      this.logger.error("Error processing LiveKit webhook", error);
      // Return 200 to prevent retries on processing errors
      return { ok: false, error: "Processing error" };
    }
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
            const lastEvent = existing.logs[0]?.eventType;
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
          const lastEvent = existing.logs[0]?.eventType;
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
}
