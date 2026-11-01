import { API_ROUTES } from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus, type User } from "@prisma/client";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

/**
 * What only the database can prove for the approval engine and audit trail
 * (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §2.3, §2.6, V9).
 */
describe("approval engine + append-only audit (real Postgres)", () => {
  let t: TestApp;
  let coach: User;
  let admin: User;
  let student: User;

  const active = async (role: UserRole) => {
    const user = await createUser(t.prisma, role);
    return t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: user.id } });
  };

  const request = (over: Partial<Prisma.ApprovalRequestUncheckedCreateInput> = {}) =>
    t.prisma.approvalRequest.create({
      data: {
        actionType: "CLASS_CANCEL",
        category: "SCHEDULING",
        dedupeKey: "CLASS_CANCEL:class-x",
        expiresAt: new Date(Date.now() + 3_600_000),
        reason: "unwell",
        requestedValue: {},
        requesterId: coach.id,
        requesterRole: UserRole.COACH,
        ...over
      }
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    coach = await active(UserRole.COACH);
    admin = await active(UserRole.ADMIN);
    student = await active(UserRole.STUDENT);
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("allows one PENDING request per dedupe key, and a new one once it's decided", async () => {
    const first = await request();
    await expect(request()).rejects.toMatchObject({ code: "P2002" });

    await t.prisma.approvalRequest.update({ data: { status: "REJECTED" }, where: { id: first.id } });
    await expect(request()).resolves.toBeDefined();
  });

  it("refuses a reviewer who is the requester (CHECK)", async () => {
    const row = await request({ dedupeKey: "self-review" });
    await expect(
      t.prisma.approvalRequest.update({ data: { reviewerId: coach.id, status: "APPROVED" }, where: { id: row.id } })
    ).rejects.toThrow(/approval_requests_no_self_review/);
  });

  it("makes approval_events append-only", async () => {
    const row = await request({ dedupeKey: "events" });
    const event = await t.prisma.approvalEvent.create({
      data: { actorId: coach.id, requestId: row.id, type: "CREATED" }
    });
    await expect(
      t.prisma.approvalEvent.update({ data: { type: "APPROVED" }, where: { id: event.id } })
    ).rejects.toThrow(/append-only/);
    await expect(t.prisma.approvalEvent.delete({ where: { id: event.id } })).rejects.toThrow(/append-only/);
  });

  it("makes trash_audit_logs append-only, but a user purge can still null the actor", async () => {
    const doomed = await active(UserRole.COACH);
    const log = await t.prisma.trashAuditLog.create({
      data: { action: "PARENT_CONTACT_CHANGE", entity: "StudentProfile", entityId: "x", userId: doomed.id }
    });

    await expect(
      t.prisma.trashAuditLog.update({ data: { action: "TAMPERED" }, where: { id: log.id } })
    ).rejects.toThrow(/append-only/);
    await expect(t.prisma.trashAuditLog.delete({ where: { id: log.id } })).rejects.toThrow(/append-only/);
    // Changing the actor to someone else is tampering too.
    await expect(
      t.prisma.trashAuditLog.update({ data: { userId: admin.id }, where: { id: log.id } })
    ).rejects.toThrow(/append-only/);

    // The FK's ON DELETE SET NULL (trash purge hard-deletes users) still works.
    await t.prisma.$executeRaw`DELETE FROM "users" WHERE "id" = ${doomed.id}`;
    const after = await t.prisma.trashAuditLog.findUniqueOrThrow({ where: { id: log.id } });
    expect(after.userId).toBeNull();
    expect(after.action).toBe("PARENT_CONTACT_CHANGE");
  });

  it("serves the reviewer list to admins only, and refuses an action with no handler", async () => {
    expect((await t.call(admin, "GET", API_ROUTES.adminApprovals.list)).status).toBe(200);
    expect((await t.call(coach, "GET", API_ROUTES.adminApprovals.list)).status).toBe(403);
    expect((await t.call(student, "GET", API_ROUTES.adminApprovals.list)).status).toBe(403);
    expect((await t.call(coach, "GET", `${API_ROUTES.adminApprovals.list}?status=NOPE`)).status).toBe(400);
    expect((await t.call(coach, "GET", API_ROUTES.approvals.mine)).status).toBe(200);

    const res = await t.call(coach, "POST", API_ROUTES.approvals.create, {
      actionType: "LIVE_CLASS_GUEST_STUDENT",
      payload: {},
      reason: "test"
    });
    expect(res.status).toBe(400);
  });
});
