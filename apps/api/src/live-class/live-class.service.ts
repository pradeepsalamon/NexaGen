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
import { LiveSessionStatus, LiveKitTokenOptions } from "./types/live-class.types";
import { UserRole, UserStatus, ClassStatus } from "@prisma/client";
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

  async startClass(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    if (user.role !== UserRole.COACH) {
      throw new ForbiddenException("Only coaches can start a live class.");
    }

    const scheduledClass = await this.prisma.coachClass.findUnique({
      where: { id: classId }
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

    let liveSession = await this.prisma.liveSession.findUnique({
      where: { classId }
    });

    if (liveSession && liveSession.status === LiveSessionStatus.LIVE) {
      throw new ConflictException("Live class is already running.");
    }

    if (!liveSession) {
      const roomName = this.livekit.generateRoomName(classId);
      const room = await this.livekit.createRoom(roomName);

      liveSession = await this.prisma.liveSession.create({
        data: {
          batchId: scheduledClass.batchId,
          coachId: scheduledClass.coachId,
          classId: scheduledClass.id,
          roomName: roomName,
          livekitRoomName: room.sid,
          status: LiveSessionStatus.LIVE,
          scheduledAt: scheduledClass.startsAt,
          startedAt: new Date()
        }
      });
    } else {
      liveSession = await this.prisma.liveSession.update({
        where: { id: liveSession.id },
        data: {
          status: LiveSessionStatus.LIVE,
          startedAt: new Date()
        }
      });
    }

    await this.prisma.coachClass.update({
      where: { id: classId },
      data: { status: ClassStatus.LIVE }
    });

    return { message: "Class started successfully", liveSession };
  }

  async getToken(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    const scheduledClass = await this.prisma.coachClass.findUnique({
      where: { id: classId }
    });

    if (!scheduledClass) {
      throw new NotFoundException("Class not found.");
    }

    if (scheduledClass.status !== ClassStatus.LIVE) {
      throw new ForbiddenException("Class is not currently active.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { 
        batch: { include: { students: { where: { isDeleted: false } } } },
        class: true
      }
    });

    if (!liveSession) {
      throw new NotFoundException("Live class has not been started yet.");
    }

    if (liveSession.status !== LiveSessionStatus.LIVE) {
      throw new BadRequestException(`Live class is currently ${liveSession.status}.`);
    }

    const isCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;
    const isStudent = user.role === UserRole.STUDENT && liveSession.batch.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You are not authorized to join this class.");
    }

    const tokenOptions: LiveKitTokenOptions = {
      roomName: liveSession.roomName,
      participantIdentity: user.id,
      participantName: `${user.firstName} ${user.lastName || ""}`.trim(),
      isCoach: isCoach || isAdmin
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);
    const topic = liveSession.class?.topic || liveSession.class?.title || "Live Class";
    return { token: livekitToken, roomName: liveSession.roomName, topic };
  }

  async endClass(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    if (user.role !== UserRole.COACH && user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("You do not have permission to end this class.");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId }
    });

    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }

    if (user.role === UserRole.COACH && liveSession.coachId !== user.id) {
      throw new ForbiddenException("You can only end your own classes.");
    }

    await this.livekit.deleteRoom(liveSession.roomName);

    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: {
        status: LiveSessionStatus.ENDED,
        endedAt: new Date()
      }
    });

    await this.prisma.coachClass.update({
      where: { id: classId },
      data: { status: ClassStatus.COMPLETED }
    });

    return { message: "Class ended successfully" };
  }

  async getLiveClass(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    const scheduledClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: { 
        liveSession: true,
        batch: { include: { students: { where: { isDeleted: false } } } }
      }
    });

    if (!scheduledClass) {
      throw new NotFoundException("Class not found.");
    }

    const isCoach = user.role === UserRole.COACH && scheduledClass.coachId === user.id;
    const isStudent = user.role === UserRole.STUDENT && scheduledClass.batch.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You do not have access to this class.");
    }

    // Exclude the deeply nested batch details before returning to avoid over-fetching/leaking
    const { batch, ...classWithoutBatch } = scheduledClass;

    return classWithoutBatch;
  }

  async getParticipants(accessToken: string | undefined, classId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } }
    });

    if (!liveSession) {
      throw new NotFoundException("Live class not found.");
    }

    const isCoach = user.role === UserRole.COACH && liveSession.coachId === user.id;
    const isStudent = user.role === UserRole.STUDENT && liveSession.batch.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You do not have access to this class's participants.");
    }

    const participants = await this.livekit.listParticipants(liveSession.roomName);
    return { participants };
  }
}
