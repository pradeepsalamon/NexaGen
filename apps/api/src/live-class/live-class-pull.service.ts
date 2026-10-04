import {
  Injectable,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  PRESENCE_ONLINE_WINDOW_MS,
  type PullRosterResponse,
  type PullRosterStudent,
} from "@nexa-chess/types";
import {
  UserRole,
  UserStatus,
  WaitingRoomStatus,
} from "@prisma/client";
import { LiveClassAccessService } from "./live-class-access.service";

/** Coach "pull into class": the roster of absent students and the pull lifecycle. */
@Injectable()
export class LiveClassPullService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LiveClassAccessService
  ) {}

  /**
   * Coach-owner/admin: every student in the class's batch with whether they
   * have the app open (presence heartbeat), are already in the room, and any
   * pull already sent.
   */
  async getPullRoster(
    accessToken: string | undefined,
    classId: string,
    search?: string,
  ): Promise<PullRosterResponse> {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      select: { batchId: true },
    });
    const studentSelect = { id: true, firstName: true, lastName: true, avatarUrl: true, lastSeenAt: true } as const;
    const q = search?.trim() ?? "";

    const [enrolments, pulls, inRoom] = await Promise.all([
      coachClass?.batchId
        ? this.prisma.batchStudent.findMany({
            where: { batchId: coachClass.batchId, student: { status: UserStatus.ACTIVE } },
            include: { student: { select: studentSelect } },
          })
        : Promise.resolve([]),
      this.prisma.liveClassPull.findMany({
        where: { liveSessionId: liveSession.id },
        include: { student: { select: studentSelect } },
      }),
      this.access.connectedUserIds(liveSession.roomName),
    ]);

    const batchIds = new Set(enrolments.map((e) => e.student.id));
    const people = new Map(enrolments.map((e) => [e.student.id, e.student]));
    // Students pulled in from other batches stay listed so the coach sees their status.
    for (const p of pulls) if (!people.has(p.student.id)) people.set(p.student.id, p.student);

    if (q.length >= 2) {
      const words = q.split(/\s+/).slice(0, 3);
      const matches = await this.prisma.user.findMany({
        where: {
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
          id: { notIn: [...people.keys()] },
          AND: words.map((w) => ({
            OR: [
              { firstName: { contains: w, mode: "insensitive" as const } },
              { lastName: { contains: w, mode: "insensitive" as const } },
              { email: { contains: w, mode: "insensitive" as const } },
              { username: { contains: w, mode: "insensitive" as const } },
            ],
          })),
        },
        select: studentSelect,
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        take: 20,
      });
      for (const m of matches) people.set(m.id, m);
    }

    const pullByStudent = new Map(pulls.map((p) => [p.studentId, p]));
    const onlineSince = Date.now() - PRESENCE_ONLINE_WINDOW_MS;

    const students: PullRosterStudent[] = [...people.values()].map((student) => {
      const pull = pullByStudent.get(student.id);
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        avatarUrl: student.avatarUrl,
        online: !!student.lastSeenAt && student.lastSeenAt.getTime() >= onlineSince,
        lastSeenAt: student.lastSeenAt?.toISOString() ?? null,
        inClass: inRoom.has(student.id),
        inBatch: batchIds.has(student.id),
        pull: pull ? { status: pull.status, requestedAt: pull.requestedAt.toISOString() } : null,
      };
    });

    // Who the coach is most likely to act on first: absent + online.
    students.sort(
      (a, b) =>
        Number(a.inClass) - Number(b.inClass) ||
        Number(b.online) - Number(a.online) ||
        a.name.localeCompare(b.name),
    );
    return { students };
  }

  /** Coach-owner/admin: send (or re-send) a pull to any active student, in the batch or not. */
  async pullStudent(
    accessToken: string | undefined,
    classId: string,
    studentId: string,
  ): Promise<{ status: "PENDING" }> {
    const { user, liveSession } = await this.access.resolveClassManager(accessToken, classId, { requireLive: true });

    const student = await this.prisma.user.findFirst({
      where: { id: studentId, role: UserRole.STUDENT, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    if (!student) {
      throw new BadRequestException("That student was not found or is inactive.");
    }

    const now = new Date();
    // Pulling someone back in undoes a kick or a waiting-room denial.
    await this.prisma.liveClassWaitingParticipant.updateMany({
      where: { liveSessionId: liveSession.id, studentId, status: WaitingRoomStatus.DENIED },
      data: { status: WaitingRoomStatus.ADMITTED },
    });
    await this.prisma.liveClassPull.upsert({
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId } },
      update: { status: "PENDING", requestedAt: now, resolvedAt: null, requestedById: user.id },
      create: { liveSessionId: liveSession.id, studentId, requestedById: user.id },
    });
    return { status: "PENDING" };
  }

  /** Coach-owner/admin: withdraw a pull the student has not acted on yet. */
  async cancelPull(
    accessToken: string | undefined,
    classId: string,
    studentId: string,
  ): Promise<{ cancelled: boolean }> {
    const { liveSession } = await this.access.resolveClassManager(accessToken, classId);
    const { count } = await this.prisma.liveClassPull.updateMany({
      where: { liveSessionId: liveSession.id, studentId, status: "PENDING" },
      data: { status: "CANCELLED", resolvedAt: new Date() },
    });
    return { cancelled: count > 0 };
  }
}
