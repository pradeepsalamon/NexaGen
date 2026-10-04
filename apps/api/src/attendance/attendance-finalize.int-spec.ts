import type { JwtService } from "@nestjs/jwt";
import { AttendanceEventType, AttendanceStatus, ClassStatus, UserRole } from "@prisma/client";
import { AttendanceService } from "./attendance.service";
import { JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { createUser, resetDatabase } from "../test/integration/db";

const at = (hhmm: string) => new Date(`2026-03-02T${hhmm}:00.000Z`);

describe("AttendanceService.finalizeClassAttendance (real Postgres, IST session zone)", () => {
  const prisma = new PrismaService();
  const service = new AttendanceService(prisma, new JobLockService(prisma), {} as JwtService);

  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  async function seedClass() {
    const coach = await createUser(prisma, UserRole.COACH);
    const present = await createUser(prisma, UserRole.STUDENT);
    const absent = await createUser(prisma, UserRole.STUDENT);
    const unenrolled = await createUser(prisma, UserRole.STUDENT);
    const batch = await prisma.batch.create({
      data: {
        name: "Int batch",
        students: {
          create: [
            { studentId: present.id },
            { studentId: absent.id },
            { studentId: unenrolled.id, isDeleted: true, deletedAt: at("09:00") },
          ],
        },
      },
    });
    // Scheduled 10:00-10:30; actually ran 10:00-10:20.
    const coachClass = await prisma.coachClass.create({
      data: {
        batchId: batch.id,
        coachId: coach.id,
        endsAt: at("10:30"),
        startsAt: at("10:00"),
        status: ClassStatus.COMPLETED,
        title: "Int class",
      },
    });
    await prisma.liveSession.create({
      data: {
        batchId: batch.id,
        classId: coachClass.id,
        coachId: coach.id,
        endedAt: at("10:20"),
        roomName: `room-${coachClass.id}`,
        scheduledAt: at("10:00"),
        startedAt: at("10:00"),
        status: "ENDED",
      },
    });
    // Joined at the start; the participant_left webhook never arrived.
    const attendance = await prisma.classAttendance.create({
      data: { classId: coachClass.id, joinedAt: at("10:00"), studentId: present.id },
    });
    const log = await prisma.attendanceLog.create({
      data: {
        attendanceId: attendance.id,
        eventType: AttendanceEventType.JOIN,
        sessionStart: at("10:00"),
        timestamp: at("10:00"),
        userId: present.id,
      },
    });
    return { absent, coachClass, log, present, unenrolled };
  }

  it("closes the open session at the class end, not shifted by the session time zone", async () => {
    const { coachClass, log, present } = await seedClass();

    await service.finalizeClassAttendance(coachClass.id);

    const closed = await prisma.attendanceLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(closed.sessionEnd?.toISOString()).toBe(at("10:20").toISOString());
    expect(closed.sessionDuration).toBe(20 * 60);

    const row = await prisma.classAttendance.findUniqueOrThrow({
      where: { classId_studentId: { classId: coachClass.id, studentId: present.id } },
    });
    expect(row).toMatchObject({ attendancePercent: 100, status: AttendanceStatus.PRESENT, totalDuration: 20 * 60 });
    expect(row.leftAt?.toISOString()).toBe(at("10:20").toISOString());
  });

  it("marks an enrolled no-show absent and skips a student whose enrolment was deleted", async () => {
    const { absent, coachClass, unenrolled } = await seedClass();

    await service.finalizeClassAttendance(coachClass.id);

    const rows = await prisma.classAttendance.findMany({ where: { classId: coachClass.id } });
    expect(rows.find((r) => r.studentId === absent.id)?.status).toBe(AttendanceStatus.ABSENT);
    expect(rows.some((r) => r.studentId === unenrolled.id)).toBe(false);
  });

  it("is idempotent: a second run changes nothing", async () => {
    const { coachClass } = await seedClass();

    await service.finalizeClassAttendance(coachClass.id);
    const first = await prisma.classAttendance.findMany({ where: { classId: coachClass.id }, orderBy: { studentId: "asc" } });
    await service.finalizeClassAttendance(coachClass.id);
    const second = await prisma.classAttendance.findMany({ where: { classId: coachClass.id }, orderBy: { studentId: "asc" } });

    const strip = (rows: typeof first) => rows.map(({ updatedAt: _u, ...rest }) => rest);
    expect(strip(second)).toEqual(strip(first));
  });
});
