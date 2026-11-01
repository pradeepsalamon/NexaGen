import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { AttendanceService } from "../../../attendance/attendance.service";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

const HOUR = 3_600_000;

/**
 * Stage 4 end to end over HTTP (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
 * §6, "Coach can't bypass an approval through the direct API").
 */
describe("approval flows: class cancellation (V10), guest students (V4), class change requests (Stage 5)", () => {
  let t: TestApp;
  let coach: User;
  let admin: User;
  let ownStudent: User;
  let outsider: User;
  let batchId: string;

  const active = async (role: UserRole) => {
    const user = await createUser(t.prisma, role);
    return t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: user.id } });
  };
  const classIn = (hours: number, status: "SCHEDULED" | "LIVE" = "SCHEDULED") =>
    t.prisma.coachClass.create({
      data: {
        batchId,
        coachId: coach.id,
        endsAt: new Date(Date.now() + (hours + 1) * HOUR),
        startsAt: new Date(Date.now() + hours * HOUR),
        status,
        title: `Class in ${hours}h`
      }
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    coach = await active(UserRole.COACH);
    admin = await active(UserRole.ADMIN);
    ownStudent = await active(UserRole.STUDENT);
    outsider = await active(UserRole.STUDENT);
    const batch = await t.prisma.batch.create({ data: { name: "Flows batch" } });
    batchId = batch.id;
    await t.prisma.batchCoach.create({ data: { batchId, coachId: coach.id } });
    await t.prisma.batchStudent.create({ data: { batchId, studentId: ownStudent.id } });
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("cancels directly more than 24 h ahead", async () => {
    const cls = await classIn(48);
    const res = await t.call(coach, "PATCH", API_ROUTES.coach.cancelClass(cls.id));
    expect(res.status).toBe(200);
    expect((await t.prisma.coachClass.findUniqueOrThrow({ where: { id: cls.id } })).status).toBe("CANCELLED");
  });

  it("refuses the direct route within 24 h; the request → admin approval cancels it", async () => {
    const cls = await classIn(5);
    expect((await t.call(coach, "PATCH", API_ROUTES.coach.cancelClass(cls.id))).status).toBe(403);
    expect((await t.prisma.coachClass.findUniqueOrThrow({ where: { id: cls.id } })).status).toBe("SCHEDULED");

    // The wrong kind of request is refused too.
    const wrong = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "CLASS_CANCEL_EXCEPTIONAL",
      payload: { classId: cls.id },
      reason: "Unwell"
    });
    expect(wrong.status).toBe(409);

    const asked = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "CLASS_CANCEL",
      payload: { classId: cls.id },
      reason: "Unwell"
    });
    expect(asked.status).toBe(201);
    const id = (asked.body as { request: { id: string; urgent: boolean } }).request.id;
    expect((asked.body as { request: { urgent: boolean } }).request.urgent).toBe(true);

    // One pending cancellation per class.
    const again = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "CLASS_CANCEL",
      payload: { classId: cls.id },
      reason: "Still unwell"
    });
    expect(again.status).toBe(409);

    // A coach can't decide it.
    expect((await t.call(coach, "POST", API_ROUTES.adminApprovals.approve(id), {})).status).toBe(403);

    const approved = await t.call(admin, "POST", API_ROUTES.adminApprovals.approve(id), { note: "Get well" });
    expect(approved.status).toBe(201);
    const after = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: cls.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelledById).toBe(admin.id);
    const events = await t.prisma.approvalEvent.findMany({ where: { requestId: id }, orderBy: { createdAt: "asc" } });
    expect(events.map((e) => e.type)).toEqual(["CREATED", "APPROVED"]);
  });

  it("lets a coach pull only their own batch's students, or a guest an admin approved", async () => {
    const cls = await classIn(-0.1, "LIVE");
    const session = await t.prisma.liveSession.create({
      data: {
        batchId,
        classId: cls.id,
        coachId: coach.id,
        roomName: `room-flows-${cls.id}`,
        scheduledAt: cls.startsAt,
        startedAt: cls.startsAt,
        status: "LIVE"
      }
    });

    expect(
      (await t.call(coach, "POST", API_ROUTES.liveClass.pullStudent(cls.id), { studentId: ownStudent.id })).status
    ).toBe(201);
    expect(
      (await t.call(coach, "POST", API_ROUTES.liveClass.pullStudent(cls.id), { studentId: outsider.id })).status
    ).toBe(403);

    const asked = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "LIVE_CLASS_GUEST_STUDENT",
      payload: { classId: cls.id, studentId: outsider.id },
      reason: "Trial student"
    });
    expect(asked.status).toBe(201);
    const id = (asked.body as { request: { id: string } }).request.id;
    expect((await t.call(admin, "POST", API_ROUTES.adminApprovals.approve(id), {})).status).toBe(201);

    // Approved while live: the pull went out on the coach's behalf, and a re-pull is allowed.
    const pull = await t.prisma.liveClassPull.findUnique({
      where: { liveSessionId_studentId: { liveSessionId: session.id, studentId: outsider.id } }
    });
    expect(pull?.status).toBe("PENDING");
    expect(
      (await t.call(coach, "POST", API_ROUTES.liveClass.pullStudent(cls.id), { studentId: outsider.id })).status
    ).toBe(201);
  });

  // ── Stage 5: class change requests through the engine ──

  it("adds an extra class only once an admin approves the coach's CLASS_EXTRA request", async () => {
    const startsAt = new Date(Date.now() + 72 * HOUR);
    const payload = {
      batchId,
      endsAt: new Date(startsAt.getTime() + HOUR).toISOString(),
      startsAt: startsAt.toISOString(),
      topic: "Make-up class"
    };
    const asked = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "CLASS_EXTRA",
      payload,
      reason: "Holiday make-up"
    });
    expect(asked.status).toBe(201);
    const id = (asked.body as { request: { id: string } }).request.id;
    expect(await t.prisma.coachClass.count({ where: { startsAt, topic: "Make-up class" } })).toBe(0);

    // A double-submitted form doesn't queue it twice.
    const again = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "CLASS_EXTRA",
      payload,
      reason: "Holiday make-up"
    });
    expect(again.status).toBe(409);

    // Another batch's coach can't ask for this batch.
    const stranger = await active(UserRole.COACH);
    const foreign = await t.call(stranger, "POST", API_ROUTES.approvals.create, {
      actionType: "CLASS_EXTRA",
      payload,
      reason: "Not mine"
    });
    expect(foreign.status).toBe(403);

    const approved = await t.call(admin, "POST", API_ROUTES.adminApprovals.approve(id), {});
    expect(approved.status).toBe(201);
    const classId = (approved.body as { request: { classId: string | null } }).request.classId;
    expect(classId).toBeTruthy();
    const cls = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: classId! } });
    expect(cls).toMatchObject({ batchId, coachId: coach.id, status: "SCHEDULED", topic: "Make-up class" });
    expect(cls.startsAt.toISOString()).toBe(startsAt.toISOString());
  });

  it("moves a class only on approval, and not once the coach has left the batch", async () => {
    const cls = await classIn(96);
    const target = new Date(Date.now() + 120 * HOUR);
    const ask = () =>
      t.call(coach, "POST", API_ROUTES.approvals.create, {
        actionType: "CLASS_RESCHEDULE",
        payload: {
          classId: cls.id,
          endsAt: new Date(target.getTime() + HOUR).toISOString(),
          startsAt: target.toISOString()
        },
        reason: "Tournament"
      });

    const first = await ask();
    expect(first.status).toBe(201);
    const firstId = (first.body as { request: { id: string } }).request.id;
    expect((await ask()).status).toBe(409);
    expect((await t.call(admin, "POST", API_ROUTES.adminApprovals.approve(firstId), {})).status).toBe(201);
    const moved = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: cls.id } });
    expect(moved.startsAt.toISOString()).toBe(target.toISOString());

    // A second move, then the coach is removed from the batch before the decision.
    const other = await classIn(200);
    const asked = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "CLASS_RESCHEDULE",
      payload: {
        classId: other.id,
        endsAt: new Date(Date.now() + 221 * HOUR).toISOString(),
        startsAt: new Date(Date.now() + 220 * HOUR).toISOString()
      },
      reason: "Clash"
    });
    expect(asked.status).toBe(201);
    const id = (asked.body as { request: { id: string } }).request.id;
    await t.prisma.batchCoach.updateMany({ data: { isDeleted: true }, where: { batchId, coachId: coach.id } });
    try {
      expect((await t.call(admin, "POST", API_ROUTES.adminApprovals.approve(id), {})).status).toBe(409);
      const untouched = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: other.id } });
      expect(untouched.startsAt.toISOString()).toBe(other.startsAt.toISOString());
      const row = await t.prisma.approvalRequest.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("PENDING");
    } finally {
      await t.prisma.batchCoach.updateMany({ data: { isDeleted: false }, where: { batchId, coachId: coach.id } });
    }
  });

  // ── Stage 6: enrolment, attendance, live-setting exceptions, substitutes ──

  const ask = async (user: User, actionType: string, payload: Record<string, unknown>) => {
    const res = await t.call(user, "POST", API_ROUTES.approvals.create, { actionType, payload, reason: "Stage six" });
    return { id: (res.body as { request?: { id: string } }).request?.id ?? "", status: res.status };
  };
  const approve = (id: string) => t.call(admin, "POST", API_ROUTES.adminApprovals.approve(id), {});

  it("changes a batch's roster only through an approved request", async () => {
    const other = await t.prisma.batch.create({ data: { name: "Second batch" } });
    await t.prisma.batchCoach.create({ data: { batchId: other.id, coachId: coach.id } });
    const student = await active(UserRole.STUDENT);
    const inBatch = (id: string) =>
      t.prisma.batchStudent.count({ where: { batchId: id, isDeleted: false, studentId: student.id } });

    // The direct route stays admin-only, and a stranger's batch is refused.
    expect((await t.call(coach, "PATCH", API_ROUTES.batches.update(batchId), { studentIds: [student.id] })).status).toBe(403);
    const stranger = await active(UserRole.COACH);
    expect((await ask(stranger, "BATCH_STUDENT_ENROL", { batchId, studentId: student.id })).status).toBe(403);

    const enrol = await ask(coach, "BATCH_STUDENT_ENROL", { batchId, studentId: student.id });
    expect(enrol.status).toBe(201);
    expect((await ask(coach, "BATCH_STUDENT_ENROL", { batchId, studentId: student.id })).status).toBe(409);
    expect(await inBatch(batchId)).toBe(0);
    expect((await approve(enrol.id)).status).toBe(201);
    expect(await inBatch(batchId)).toBe(1);

    const move = await ask(coach, "BATCH_STUDENT_TRANSFER", {
      fromBatchId: batchId,
      studentId: student.id,
      toBatchId: other.id
    });
    expect(move.status).toBe(201);
    expect((await approve(move.id)).status).toBe(201);
    expect(await inBatch(batchId)).toBe(0);
    expect(await inBatch(other.id)).toBe(1);

    const remove = await ask(coach, "BATCH_STUDENT_REMOVE", { batchId: other.id, studentId: student.id });
    expect((await approve(remove.id)).status).toBe(201);
    expect(await inBatch(other.id)).toBe(0);
    // The removal is in the trash, so it's recoverable, and re-enrolling restores the same row.
    const again = await ask(coach, "BATCH_STUDENT_ENROL", { batchId: other.id, studentId: student.id });
    expect((await approve(again.id)).status).toBe(201);
    expect(await inBatch(other.id)).toBe(1);
  });

  it("corrects attendance through an approved request, and a re-run of finalize keeps it", async () => {
    const cls = await t.prisma.coachClass.create({
      data: {
        batchId,
        coachId: coach.id,
        endsAt: new Date(Date.now() - 2 * HOUR),
        startsAt: new Date(Date.now() - 3 * HOUR),
        status: "COMPLETED",
        title: "Held class"
      }
    });
    await t.prisma.classAttendance.create({
      data: { classId: cls.id, joinedAt: null, status: "ABSENT", studentId: ownStudent.id }
    });
    const route = API_ROUTES.attendance.correctStudent(cls.id, ownStudent.id);
    const payload = { classId: cls.id, status: "PRESENT", studentId: ownStudent.id };

    // A coach can't correct directly, and another coach can't ask.
    expect((await t.call(coach, "PATCH", route, { reason: "Was there", status: "PRESENT" })).status).toBe(403);
    const stranger = await active(UserRole.COACH);
    expect((await ask(stranger, "ATTENDANCE_CORRECTION", payload)).status).toBe(404);

    const asked = await ask(coach, "ATTENDANCE_CORRECTION", payload);
    expect(asked.status).toBe(201);
    expect((await approve(asked.id)).status).toBe(201);

    const row = await t.prisma.classAttendance.findUniqueOrThrow({
      where: { classId_studentId: { classId: cls.id, studentId: ownStudent.id } }
    });
    expect(row.status).toBe("PRESENT");
    expect(row.correctedAt).toBeTruthy();
    const audit = await t.prisma.trashAuditLog.findFirstOrThrow({
      where: { action: "ATTENDANCE_CORRECTION", entityId: row.id }
    });
    expect(audit.userId).toBe(admin.id);
    expect(audit.metadata).toMatchObject({ after: "PRESENT", approvalRequestId: asked.id, before: "ABSENT" });

    // Finalize scores from the logs (none here), which would say ABSENT.
    await t.app.get(AttendanceService).finalizeClassAttendance(cls.id);
    const after = await t.prisma.classAttendance.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("PRESENT");

    // An admin corrects directly; the same audit, no request.
    const direct = await t.call(admin, "PATCH", route, { reason: "Left early", status: "PARTIAL" });
    expect(direct.status).toBe(200);
    expect(
      await t.prisma.trashAuditLog.count({ where: { action: "ATTENDANCE_CORRECTION", entityId: row.id } })
    ).toBe(2);

    // A status changed after the coach asked: nothing executes and the request stays pending.
    const stale = await ask(coach, "ATTENDANCE_CORRECTION", { ...payload, status: "ABSENT" });
    expect((await t.call(admin, "PATCH", route, { reason: "Changed again", status: "LATE" })).status).toBe(200);
    expect((await approve(stale.id)).status).toBe(409);
    expect((await t.prisma.approvalRequest.findUniqueOrThrow({ where: { id: stale.id } })).status).toBe("PENDING");
  });

  it("refuses to correct a class that hasn't ended", async () => {
    const cls = await classIn(300);
    const asked = await ask(coach, "ATTENDANCE_CORRECTION", {
      classId: cls.id,
      status: "PRESENT",
      studentId: ownStudent.id
    });
    expect(asked.status).toBe(409);
    const direct = await t.call(admin, "PATCH", API_ROUTES.attendance.correctStudent(cls.id, ownStudent.id), {
      reason: "Too soon",
      status: "PRESENT"
    });
    expect(direct.status).toBe(409);
  });

  it("lets one class differ from a locked setting only through an approved exception", async () => {
    const policy = await t.call(admin, "GET", API_ROUTES.liveClassSettings.policy);
    const { settings } = policy.body as { settings: unknown };
    const setLocks = (locks: string[]) =>
      t.call(admin, "PUT", API_ROUTES.liveClassSettings.policy, { locks, settings });
    expect((await setLocks(["student.chat", "recording"])).status).toBe(200);

    try {
      const cls = await classIn(400);
      const other = await classIn(420);
      const settingsRoute = API_ROUTES.liveClassSettings.forClass(cls.id);
      const chatOff = { liveClassSettings: { student: { chat: "DISABLED" } } };
      const payload = { classId: cls.id, field: "student.chat", value: "DISABLED" };

      expect((await t.call(coach, "PUT", settingsRoute, chatOff)).status).toBe(403);
      // Consent isn't built, so recording can't be excepted at all.
      expect(
        (await ask(coach, "LIVE_SETTING_EXCEPTION", { classId: cls.id, field: "recording", value: "AUTO_START" })).status
      ).toBe(400);

      const asked = await ask(coach, "LIVE_SETTING_EXCEPTION", payload);
      expect(asked.status).toBe(201);
      expect((await approve(asked.id)).status).toBe(201);

      type Settings = { lockExceptions: string[]; resolved: { student: { chat: string; mic: string } } };
      const read = async (id: string) =>
        (await t.call(coach, "GET", API_ROUTES.liveClassSettings.forClass(id))).body as Settings;
      expect((await read(cls.id)).resolved.student.chat).toBe("DISABLED");
      expect((await read(cls.id)).lockExceptions).toEqual(["student.chat"]);
      // Only this class.
      expect((await read(other.id)).resolved.student.chat).toBe("ENABLED");

      // A later save by the coach changes other fields and keeps the exception.
      const saved = await t.call(coach, "PUT", settingsRoute, {
        liveClassSettings: { student: { mic: "FORCED_OFF" } }
      });
      expect(saved.status).toBe(200);
      const afterSave = await read(cls.id);
      expect(afterSave.resolved.student).toMatchObject({ chat: "DISABLED", mic: "FORCED_OFF" });
      expect(afterSave.lockExceptions).toEqual(["student.chat"]);
      // The exception is one value: the coach still can't pick another.
      expect(
        (await t.call(coach, "PUT", settingsRoute, { liveClassSettings: { student: { chat: "ENABLED" } } })).status
      ).toBe(200);
      expect((await read(cls.id)).resolved.student.chat).toBe("DISABLED");

      // A coach can't grant themselves an exception by writing the key.
      await t.call(coach, "PUT", API_ROUTES.liveClassSettings.forClass(other.id), {
        liveClassSettings: { lockExceptions: ["student.chat"], student: { chat: "DISABLED" } }
      });
      expect((await read(other.id)).lockExceptions).toEqual([]);
      expect((await read(other.id)).resolved.student.chat).toBe("ENABLED");

      // Lifting the lock before a decision means there's nothing to except.
      const third = await classIn(440);
      const moot = await ask(coach, "LIVE_SETTING_EXCEPTION", { ...payload, classId: third.id });
      expect(moot.status).toBe(201);
      expect((await setLocks([])).status).toBe(200);
      expect((await approve(moot.id)).status).toBe(409);
    } finally {
      await setLocks([]);
    }
  });

  it("hands one class to a substitute, who can then reach its students", async () => {
    const substitute = await active(UserRole.COACH);
    const cls = await classIn(500);
    const options = await t.call(coach, "GET", API_ROUTES.approvals.substituteOptions(cls.id));
    expect((options.body as { coaches: { id: string }[] }).coaches.map((c) => c.id)).toContain(substitute.id);

    const asked = await ask(coach, "CLASS_SUBSTITUTE_COACH", { classId: cls.id, substituteCoachId: substitute.id });
    expect(asked.status).toBe(201);
    expect((await t.prisma.coachClass.findUniqueOrThrow({ where: { id: cls.id } })).coachId).toBe(coach.id);
    expect((await approve(asked.id)).status).toBe(201);
    const moved = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: cls.id } });
    expect(moved.coachId).toBe(substitute.id);
    // That class only: they don't join the batch.
    expect(await t.prisma.batchCoach.count({ where: { batchId, coachId: substitute.id } })).toBe(0);

    await t.prisma.coachClass.update({ data: { status: "LIVE" }, where: { id: cls.id } });
    await t.prisma.liveSession.create({
      data: {
        batchId,
        classId: cls.id,
        coachId: substitute.id,
        roomName: `room-substitute-${cls.id}`,
        scheduledAt: cls.startsAt,
        startedAt: new Date(),
        status: "LIVE"
      }
    });
    expect(
      (await t.call(substitute, "POST", API_ROUTES.liveClass.pullStudent(cls.id), { studentId: ownStudent.id })).status
    ).toBe(201);
  });

  it("refuses a substitute who has become busy by the time it's decided", async () => {
    const substitute = await active(UserRole.COACH);
    const cls = await classIn(600);
    const asked = await ask(coach, "CLASS_SUBSTITUTE_COACH", { classId: cls.id, substituteCoachId: substitute.id });
    expect(asked.status).toBe(201);
    await t.prisma.coachClass.create({
      data: { batchId, coachId: substitute.id, endsAt: cls.endsAt, startsAt: cls.startsAt, title: "Their own class" }
    });
    expect((await approve(asked.id)).status).toBe(409);
    expect((await t.prisma.coachClass.findUniqueOrThrow({ where: { id: cls.id } })).coachId).toBe(coach.id);
    expect((await t.prisma.approvalRequest.findUniqueOrThrow({ where: { id: asked.id } })).status).toBe("PENDING");
  });

  it("finds students by name for a coach, and only a coach", async () => {
    const options = API_ROUTES.approvals.studentOptions;
    expect((await t.call(admin, "GET", `${options}?q=ab`)).status).toBe(403);
    const short = await t.call(coach, "GET", `${options}?q=a`);
    expect(short.body).toEqual({ students: [] });
    const found = await t.call(coach, "GET", `${options}?q=${encodeURIComponent(outsider.firstName)}`);
    const student = (found.body as { students: Record<string, unknown>[] }).students.find((s) => s.id === outsider.id);
    expect(student).toBeTruthy();
    expect(Object.keys(student!).sort()).toEqual(["id", "name", "username"]);
  });

  it("lists the other review queues for reviewers only, coach applications for super admins only", async () => {
    const superAdmin = await active(UserRole.SUPER_ADMIN);
    expect((await t.call(coach, "GET", API_ROUTES.adminApprovals.queues)).status).toBe(403);

    const asAdmin = await t.call(admin, "GET", API_ROUTES.adminApprovals.queues);
    expect(asAdmin.status).toBe(200);
    const adminKinds = (asAdmin.body as { queues: { kind: string }[] }).queues.map((q) => q.kind);
    expect(adminKinds).toContain("ACCOUNT_DELETION");
    expect(adminKinds).not.toContain("COACH_APPLICATION");

    const asSuper = await t.call(superAdmin, "GET", API_ROUTES.adminApprovals.queues);
    expect((asSuper.body as { queues: { kind: string }[] }).queues.map((q) => q.kind)).toContain("COACH_APPLICATION");
  });
});
