import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  BadRequestException
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-gen/config/api";
import { LiveClassStatus, LiveKitTokenOptions } from "./types/live-class.types";
import { UserRole, UserStatus } from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";

@Injectable()
export class LiveClassService {
  private readonly env = getApiEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly jwtService: JwtService
  ) { }

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }
    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        accessToken,
        { secret: this.env.JWT_ACCESS_SECRET }
      );
      if (payload.type !== "access") {
        throw new UnauthorizedException("Invalid token type.");
      }
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { coachProfile: true, studentProfile: true }
      });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException("Invalid session.");
      }
      return user;
    } catch (error) {
      throw new UnauthorizedException("Invalid or expired token.");
    }
  }

  async startClass(accessToken: string | undefined, scheduleId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    if (user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only coaches can start a live class.");
    }

    const scheduledClass = await this.prisma.coachClass.findUnique({
      where: { id: scheduleId }
    });

    if (!scheduledClass) {
      throw new NotFoundException("Class not found.");
    }

    if (scheduledClass.coachId !== user.id) {
      throw new ForbiddenException("You are not assigned to this class.");
    }

    if (scheduledClass.status === "CANCELLED" || scheduledClass.status === "COMPLETED") {
      throw new BadRequestException("Cannot start a cancelled or completed class.");
    }

    let liveClass = await this.prisma.liveClass.findUnique({
      where: { scheduleId }
    });

    if (liveClass && liveClass.status === LiveClassStatus.LIVE) {
      throw new ConflictException("Live class is already running.");
    }

    if (!liveClass) {
      const roomName = this.livekit.generateRoomName(scheduleId);
      const room = await this.livekit.createRoom(roomName);

      liveClass = await this.prisma.liveClass.create({
        data: {
          batchId: scheduledClass.batchId,
          coachId: scheduledClass.coachId,
          scheduleId: scheduledClass.id,
          roomName: roomName,
          roomSid: room.sid,
          status: LiveClassStatus.LIVE,
          scheduledAt: scheduledClass.startsAt,
          startedAt: new Date()
        }
      });
    } else {
      liveClass = await this.prisma.liveClass.update({
        where: { id: liveClass.id },
        data: {
          status: LiveClassStatus.LIVE,
          startedAt: new Date()
        }
      });
    }

    await this.prisma.coachClass.update({
      where: { id: scheduleId },
      data: { status: "IN_PROGRESS" }
    });

    return { message: "Class started successfully", liveClass };
  }

  async getToken(accessToken: string | undefined, scheduleId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    const liveClass = await this.prisma.liveClass.findUnique({
      where: { scheduleId },
      include: { 
        batch: { include: { students: true } },
        schedule: true
      }
    });

    if (!liveClass) {
      throw new NotFoundException("Live class has not been started yet.");
    }

    if (liveClass.status !== LiveClassStatus.LIVE) {
      throw new BadRequestException(`Live class is currently ${liveClass.status}.`);
    }

    const isCoach = user.role === UserRole.COACH && liveClass.coachId === user.id;
    const isStudent = user.role === UserRole.STUDENT && liveClass.batch.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You are not authorized to join this class.");
    }

    const tokenOptions: LiveKitTokenOptions = {
      roomName: liveClass.roomName,
      participantIdentity: user.id,
      participantName: `${user.firstName} ${user.lastName || ""}`.trim(),
      isCoach: isCoach || isAdmin
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);
    const topic = liveClass.schedule?.topic || liveClass.schedule?.title || "Live Class";
    return { token: livekitToken, roomName: liveClass.roomName, topic };
  }

  async endClass(accessToken: string | undefined, scheduleId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    if (user.role !== UserRole.COACH && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("You do not have permission to end this class.");
    }

    const liveClass = await this.prisma.liveClass.findUnique({
      where: { scheduleId }
    });

    if (!liveClass) {
      throw new NotFoundException("Live class not found.");
    }

    if (user.role === UserRole.COACH && liveClass.coachId !== user.id) {
      throw new ForbiddenException("You can only end your own classes.");
    }

    await this.livekit.deleteRoom(liveClass.roomName);

    await this.prisma.liveClass.update({
      where: { id: liveClass.id },
      data: {
        status: LiveClassStatus.ENDED,
        endedAt: new Date()
      }
    });

    await this.prisma.coachClass.update({
      where: { id: scheduleId },
      data: { status: "COMPLETED" }
    });

    return { message: "Class ended successfully" };
  }

  async getLiveClass(accessToken: string | undefined, scheduleId: string) {
    await this.getAuthenticatedUser(accessToken);
    const liveClass = await this.prisma.liveClass.findUnique({
      where: { scheduleId }
    });

    if (!liveClass) {
      throw new NotFoundException("Live class not found.");
    }

    return liveClass;
  }

  async getParticipants(accessToken: string | undefined, scheduleId: string) {
    await this.getAuthenticatedUser(accessToken);
    const liveClass = await this.prisma.liveClass.findUnique({
      where: { scheduleId }
    });

    if (!liveClass) {
      throw new NotFoundException("Live class not found.");
    }

    const participants = await this.livekit.listParticipants(liveClass.roomName);
    return { participants };
  }
}
