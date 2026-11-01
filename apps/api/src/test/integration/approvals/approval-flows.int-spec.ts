import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

const HOUR = 3_600_000;

/**
 * Stage 4 end to end over HTTP (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md
 * §6, "Coach can't bypass an approval through the direct API").
 */
describe("approval flows: class cancellation (V10) and guest students (V4)", () => {
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
});
