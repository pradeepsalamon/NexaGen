import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  PRESENCE_ONLINE_WINDOW_MS,
  type PullRosterResponse,
  type PullRosterStudent,
} from "@nexa-chess/types";
import {
  ApprovalStatus,
  BatchStatus,
  UserRole,
  UserStatus,
  WaitingRoomStatus,
} from "@prisma/client";
import { LiveClassAccessService } from "./live-class-access.service";

/** Who a coach may pull directly, and whose guest request is waiting (V4). */
type CoachReach = { allowed: Set<string>; pending: Set<string> };

/** Coach "pull into class": the roster of absent students and the pull lifecycle. */
@Injectable()
export class LiveClassPullService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: LiveClassAccessService
  ) {}

  /**
   * V4 (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §1.3): a coach pulls
   * directly only students of a live batch they actively coach, plus anyone an
   * admin approved as a guest for THIS class (`LIVE_CLASS_GUEST_STUDENT`).
   * `null` = no limit (admins).
   */
  private async coachReach(user: { id: string; role: UserRole }, classId: string): Promise<CoachReach | null> {
    if (user.role !== UserRole.COACH) return null;
    const [enrolments, guestRequests] = await Promise.all([
      this.prisma.batchStudent.findMany({
        where: {
          isDeleted: false,
          batch: {
            isDeleted: false,
            status: { not: BatchStatus.ARCHIVED },
            coaches: { some: { coachId: user.id, isDeleted: false } },
          },
        },
        select: { studentId: true },
      }),
      this.prisma.approvalRequest.findMany({
        where: {
          actionType: "LIVE_CLASS_GUEST_STUDENT",
          classId,
          status: { in: [ApprovalStatus.APPROVED, ApprovalStatus.PENDING] },
        },
        select: { status: true, subjectUserId: true },
      }),
    ]);
    const allowed = new Set(enrolments.map((e) => e.studentId));
    const pending = new Set<string>();
    for (const r of guestRequests) {
      if (!r.subjectUserId) continue;
      if (r.status === ApprovalStatus.APPROVED) allowed.add(r.subjectUserId);
      else pending.add(r.subjectUserId);
    }
    return { allowed, pending };
  }

  /**
   * Coach-owner/admin: every student in the class's batch with whether they
   * have the app open (presence heartbeat), are already in the room, and any
   * pull already sent. A student from outside the batch is listed only while
   * their pull is pending (so it can be cancelled) — anyone else in the
   * academy is reached through `search` (name, username or email), never
   * listed up front.
   */
  async getPullRoster(
    accessToken: string | undefined,
    classId: string,
    search?: string,
  ): Promise<PullRosterResponse> {
    const { user, liveSession } = await this.access.resolveClassManager(accessToken, classId);
    const reach = await this.coachReach(user, classId);

    const coachClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      select: { batchId: true },
    });
    const studentSelect = {
      id: true,
      firstName: true,
      lastName: true,
      username: true,
      avatarUrl: true,
      lastSeenAt: true,
    } as const;
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
    // A pending pull from another batch stays listed so the coach can cancel it.
    for (const p of pulls) {
      if (p.status === "PENDING" && !people.has(p.student.id)) people.set(p.student.id, p.student);
    }

    const term = q.replace(/^@/, "");
    if (term.length >= 2) {
      // Searches every active student — batch included, so a batch student
      // can be found by username too. A leading "@" is ignored, so "@ravi_k" works.
      const words = term.split(/\s+/).filter(Boolean).slice(0, 3);
      const [exactMatch, matches] = await Promise.all([
        // The exact username, even when 20+ others contain it.
        this.prisma.user.findFirst({
          where: {
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
            username: { equals: term, mode: "insensitive" },
          },
          select: studentSelect,
        }),
        this.prisma.user.findMany({
          where: {
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE,
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
        }),
      ]);
      // A search answers with its matches only — the roster query already has the batch.
      people.clear();
      if (exactMatch) people.set(exactMatch.id, exactMatch);
      for (const m of matches) people.set(m.id, m);
    }

    const pullByStudent = new Map(pulls.map((p) => [p.studentId, p]));
    const onlineSince = Date.now() - PRESENCE_ONLINE_WINDOW_MS;

    const students: PullRosterStudent[] = [...people.values()].map((student) => {
      const pull = pullByStudent.get(student.id);
      // Outside the coach's reach: findable (to ask an admin), but no presence.
      const needsApproval = !!reach && !reach.allowed.has(student.id);
      return {
        studentId: student.id,
        name: `${student.firstName} ${student.lastName ?? ""}`.trim(),
        username: student.username,
        avatarUrl: student.avatarUrl,
        online: !needsApproval && !!student.lastSeenAt && student.lastSeenAt.getTime() >= onlineSince,
        lastSeenAt: needsApproval ? null : student.lastSeenAt?.toISOString() ?? null,
        inClass: inRoom.has(student.id),
        inBatch: batchIds.has(student.id),
        pull: pull ? { status: pull.status, requestedAt: pull.requestedAt.toISOString() } : null,
        needsApproval,
        approvalPending: !!reach?.pending.has(student.id),
      };
    });

    // An exact username first (that is who the coach typed), then who the
    // coach is most likely to act on: absent + online.
    const exact = term.toLowerCase();
    const isExact = (s: PullRosterStudent) => !!exact && s.username?.toLowerCase() === exact;
    students.sort(
      (a, b) =>
        Number(isExact(b)) - Number(isExact(a)) ||
        Number(a.inClass) - Number(b.inClass) ||
        Number(b.online) - Number(a.online) ||
        a.name.localeCompare(b.name),
    );
    return { students };
  }

  /**
   * Admin: send (or re-send) a pull to any active student. Coach-owner: only a
   * student of their own batches or an approved guest for this class (V4).
   */
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
    const reach = await this.coachReach(user, classId);
    if (reach && !reach.allowed.has(studentId)) {
      throw new ForbiddenException(
        "This student isn't in any of your batches. Ask an admin to let them join this class.",
      );
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
