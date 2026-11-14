import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { AttendanceEventType } from "@prisma/client";
import { LiveKitService } from "../live-class/livekit.service";
import { LiveSessionStatus } from "../live-class/types/live-class.types";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { AttendanceService } from "./attendance.service";

/** Time a fresh token gets to actually connect before its session is judged. */
export const ROOM_JOIN_GRACE_MS = 2 * 60_000;

const OPEN_LOG = {
  eventType: { in: [AttendanceEventType.JOIN, AttendanceEventType.RECONNECT] },
  sessionEnd: null
};

/**
 * Heartbeats only prove a tab is open, and `getToken` opens a session before
 * the client connects — so a script posting heartbeats could be credited a
 * whole class (and a coach, payroll hours) without ever being in the room.
 * This closes every open session whose participant the SFU doesn't have.
 * A LiveKit outage skips the room rather than emptying it.
 */
@Injectable()
export class AttendanceRoomPresenceService {
  private readonly logger = new Logger(AttendanceRoomPresenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobLocks: JobLockService,
    private readonly attendance: AttendanceService,
    @Inject(forwardRef(() => LiveKitService))
    private readonly livekit: LiveKitService
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleSweep() {
    try {
      await this.jobLocks.runExclusive(JOB_LOCKS.attendanceRoomPresenceSweep, () => this.sweep());
    } catch (error) {
      this.logger.error("Error in room presence sweep", error);
    }
  }

  async sweep(now: Date = new Date()) {
    const sessions = await this.prisma.liveSession.findMany({
      where: { status: LiveSessionStatus.LIVE },
      select: { classId: true, roomName: true }
    });
    const joinCutoff = now.getTime() - ROOM_JOIN_GRACE_MS;

    for (const session of sessions) {
      let identities: string[];
      try {
        identities = (await this.livekit.listParticipants(session.roomName)).map((p) => p.identity);
      } catch {
        continue;
      }
      // `<userId>` or `<userId>_<tabId>`; the coach's `_board` tab isn't them in class.
      const present = new Set(
        identities.filter((identity) => !identity.endsWith("_board")).map((identity) => identity.split("_")[0])
      );

      const students = await this.prisma.classAttendance.findMany({
        where: { classId: session.classId, logs: { some: OPEN_LOG } },
        select: { studentId: true, logs: { where: OPEN_LOG, select: { sessionStart: true, timestamp: true } } }
      });
      for (const row of students) {
        if (present.has(row.studentId) || !allOlderThan(row.logs, joinCutoff)) continue;
        // Each call closes one open session; finalize would stretch any left open to class end.
        for (let i = 0; i < row.logs.length; i += 1) {
          await this.attendance.recordDisconnectEvent(session.classId, row.studentId, "not_in_room");
        }
      }

      const coach = await this.prisma.coachAttendance.findUnique({
        where: { classId: session.classId },
        select: { coachId: true, logs: { where: OPEN_LOG, select: { sessionStart: true, timestamp: true } } }
      });
      if (coach && coach.logs.length && !present.has(coach.coachId) && allOlderThan(coach.logs, joinCutoff)) {
        for (let i = 0; i < coach.logs.length; i += 1) {
          await this.attendance.recordCoachDisconnectEvent(session.classId, coach.coachId, "not_in_room");
        }
      }
    }
  }
}

function allOlderThan(logs: { sessionStart: Date | null; timestamp: Date }[], cutoff: number) {
  return logs.every((log) => (log.sessionStart ?? log.timestamp).getTime() < cutoff);
}
