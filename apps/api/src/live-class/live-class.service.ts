import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { LiveKitService } from "./livekit.service";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { LiveSessionStatus, LiveKitTokenOptions } from "./types/live-class.types";
import { UserRole, UserStatus, ClassStatus } from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import { AttendanceService } from "../attendance/attendance.service";

@Injectable()
export class LiveClassService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(LiveClassService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly livekit: LiveKitService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendanceService: AttendanceService
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

    const originalDurationMs = scheduledClass.endsAt.getTime() - scheduledClass.startsAt.getTime();
    const now = new Date();

    await this.prisma.coachClass.update({
      where: { id: classId },
      data: { 
        status: ClassStatus.LIVE,
        startsAt: now,
        endsAt: new Date(now.getTime() + originalDurationMs)
      }
    });

    return { message: "Class started successfully", liveSession };
  }

  async getToken(accessToken: string | undefined, classId: string, clientId?: string) {
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
    const isStudent = user.role === UserRole.STUDENT && liveSession.batch?.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You are not authorized to join this class.");
    }

    const tokenOptions: LiveKitTokenOptions = {
      roomName: liveSession.roomName,
      participantIdentity: clientId ? `${user.id}_${clientId}` : user.id,
      participantName: `${user.firstName} ${user.lastName || ""}`.trim(),
      isCoach: isCoach || isAdmin
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);
    const topic = liveSession.class?.topic || liveSession.class?.title || "Live Class";

    // Auto-mark attendance for students when they request a token (join class)
    if (isStudent && liveSession.classId) {
      try {
        await this.attendanceService.recordJoinEvent(
          liveSession.classId,
          user.id,
          { source: "TOKEN_REQUEST" }
        );
      } catch (error) {
        this.logger.warn(`Failed to record attendance for student ${user.id}`, error);
      }
    }

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

    await this.internalEndClass(classId, liveSession.id, liveSession.roomName);

    return { message: "Class ended successfully" };
  }

  private async internalEndClass(classId: string, liveSessionId: string, roomName: string) {
    await this.livekit.deleteRoom(roomName);

    await this.prisma.liveSession.update({
      where: { id: liveSessionId },
      data: {
        status: LiveSessionStatus.ENDED,
        endedAt: new Date()
      }
    });

    await this.prisma.coachClass.update({
      where: { id: classId },
      data: { 
        status: ClassStatus.COMPLETED,
        endsAt: new Date()
      }
    });

    // Finalize attendance calculations for all students
    try {
      await this.attendanceService.finalizeClassAttendance(classId);
    } catch (error) {
      this.logger.error(`Failed to finalize attendance for class ${classId}`, error);
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleStaleClasses() {
    try {
      const now = new Date();
      
      // Find all LIVE sessions whose scheduled end time has passed
      const activeSessions = await this.prisma.liveSession.findMany({
        where: {
          status: LiveSessionStatus.LIVE,
          class: {
            endsAt: {
              lte: now
            }
          }
        },
        include: {
          class: true
        }
      });

      for (const session of activeSessions) {
        try {
          const participants = await this.livekit.listParticipants(session.roomName);
          const coachParticipant = participants.find(p => p.identity === session.coachId);
          
          if (!coachParticipant) {
            this.logger.log(`Automatically ending class ${session.classId} because coach left after scheduled end time.`);
            await this.internalEndClass(session.classId, session.id, session.roomName);
          }
        } catch (error) {
          this.logger.error(`Failed to auto-end class ${session.classId}`, error);
        }
      }
    } catch (error) {
      this.logger.error("Error in handleStaleClasses cron job", error);
    }
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
    const isStudent = user.role === UserRole.STUDENT && scheduledClass.batch?.students.some((s: any) => s.studentId === user.id);
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
    const isStudent = user.role === UserRole.STUDENT && liveSession.batch?.students.some((s: any) => s.studentId === user.id);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;

    if (!isCoach && !isStudent && !isAdmin) {
      throw new ForbiddenException("You do not have access to this class's participants.");
    }

    const participants = await this.livekit.listParticipants(liveSession.roomName);
    return { participants };
  }

  async joinDemoClass(classId: string, body: { guestName: string }) {
    if (!body.guestName || body.guestName.trim().length === 0) {
      throw new BadRequestException("Guest name is required");
    }

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
      include: { class: true }
    });

    if (!liveSession) {
      // No live session created yet — class hasn't started
      const coachClass = await this.prisma.coachClass.findUnique({ where: { id: classId } });
      if (coachClass?.status === 'COMPLETED') {
        throw new NotFoundException("This demo class has already ended.");
      }
      if (coachClass?.status === 'CANCELLED') {
        throw new NotFoundException("This demo class has been cancelled.");
      }
      const now = new Date();
      if (coachClass?.startsAt && coachClass.startsAt > now) {
        const formattedTime = coachClass.startsAt.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        throw new NotFoundException(`This demo class has not started yet. It is scheduled for ${formattedTime}. Please wait for the coach to begin the session.`);
      }
      throw new NotFoundException("This demo class has not started yet. Please wait for the coach to begin the session.");
    }

    if (liveSession.status === LiveSessionStatus.ENDED) {
      throw new NotFoundException("This demo class has already ended.");
    }

    if (liveSession.status !== LiveSessionStatus.LIVE) {
      const now = new Date();
      if (liveSession.class?.startsAt && liveSession.class.startsAt > now) {
        const formattedTime = liveSession.class.startsAt.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        throw new NotFoundException(`This demo class has not started yet. It is scheduled for ${formattedTime}. Please wait for the coach to begin the session.`);
      }
      throw new NotFoundException("This demo class has not started yet. Please wait for the coach to begin the session.");
    }

    if (!liveSession.class?.isDemo) {
      throw new ForbiddenException("This class is not a demo class.");
    }

    const participantIdentity = `guest_${Math.random().toString(36).substring(7)}`;

    const tokenOptions: LiveKitTokenOptions = {
      roomName: liveSession.roomName,
      participantIdentity,
      participantName: body.guestName,
      isCoach: false
    };

    const livekitToken = await this.livekit.generateAccessToken(tokenOptions);
    const topic = liveSession.class?.topic || liveSession.class?.title || "Demo Class";

    // Track guest participant in metadata
    const metadata = (liveSession.metadata as Record<string, any>) || {};
    const participants = metadata.participants || [];
    participants.push({
      name: body.guestName,
      joinedAt: new Date().toISOString()
    });
    
    await this.prisma.liveSession.update({
      where: { id: liveSession.id },
      data: { metadata: { ...metadata, participants } }
    });

    return { token: livekitToken, roomName: liveSession.roomName, topic };
  }

  async saveChatMessage(accessToken: string | undefined, classId: string, message: string) {
    const user = await this.getAuthenticatedUser(accessToken);

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });

    if (!liveSession) {
      throw new NotFoundException("Live session not found.");
    }

    const name = user.role === UserRole.COACH 
      ? `${user.firstName} ${user.lastName}` 
      : `${user.firstName}`; // Could use identity logic if needed

    return this.prisma.liveChatMessage.create({
      data: {
        liveSessionId: liveSession.id,
        senderId: user.id,
        senderName: name,
        senderRole: user.role,
        message,
      },
    });
  }

  async getChatHistory(accessToken: string | undefined, classId: string) {
    await this.getAuthenticatedUser(accessToken); // Just to verify access

    const liveSession = await this.prisma.liveSession.findUnique({
      where: { classId },
    });

    if (!liveSession) {
      throw new NotFoundException("Live session not found.");
    }

    return this.prisma.liveChatMessage.findMany({
      where: { liveSessionId: liveSession.id },
      orderBy: { createdAt: "asc" },
      take: 500, // Limit to last 500 messages
    });
  }
}
