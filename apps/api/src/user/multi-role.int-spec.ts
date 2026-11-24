import { API_ROUTES, type AuthResponse, type UpdateExtraRolesResponse } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { EntitlementService } from "../platform/entitlement.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// Multi-role accounts end to end (docs/MULTI_ROLE_ACCOUNTS.md §6): a super
// admin lets an admin also teach; the admin's login session switches to coach
// view and back; coach view has a coach's powers only; removing the role
// falls the session back; a coach seat is counted. Cross-user and
// cross-academy refusals for the grant route are rows in test/integration/access.
describe("multi-role accounts (real app, real Postgres)", () => {
  let t: TestApp;
  let superAdmin: User;
  let admin: User;
  let coach: User;
  let classId: string;
  let batchId: string;

  const active = async (role: UserRole) => {
    const user = await createUser(t.prisma, role);
    return t.prisma.user.update({ data: { status: UserStatus.ACTIVE }, where: { id: user.id } });
  };
  const roleOf = async (user: User) => ((await t.call(user, "GET", API_ROUTES.auth.me)).body as AuthResponse).user;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    superAdmin = await active(UserRole.SUPER_ADMIN);
    admin = await active(UserRole.ADMIN);
    coach = await active(UserRole.COACH);
    await t.prisma.coachProfile.create({ data: { approvalStatus: UserStatus.ACTIVE, userId: coach.id } });
    const batch = await t.prisma.batch.create({ data: { name: "Owner's batch" } });
    batchId = batch.id;
    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    const klass = await t.prisma.coachClass.create({
      data: { batchId, coachId: coach.id, endsAt: new Date(startsAt.getTime() + 3_600_000), startsAt, title: "Coach's class" }
    });
    classId = klass.id;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("an admin cannot grant it, a super admin can", async () => {
    const refused = await t.call(admin, "PUT", API_ROUTES.users.extraRoles(admin.id), { extraRoles: ["COACH"] });
    expect(refused.status).toBe(403);

    const usageBefore = (await t.app.get(EntitlementService).getUsage()).maxCoaches;
    const res = await t.call(superAdmin, "PUT", API_ROUTES.users.extraRoles(admin.id), { extraRoles: ["COACH"] });
    expect(res.status).toBe(200);
    expect((res.body as UpdateExtraRolesResponse).user.extraRoles).toEqual(["COACH"]);

    const profile = await t.prisma.coachProfile.findUniqueOrThrow({ where: { userId: admin.id } });
    expect(profile.approvalStatus).toBe(UserStatus.ACTIVE);
    expect(await t.prisma.userRoleChange.count({ where: { action: "GRANTED", role: "COACH", userId: admin.id } })).toBe(1);
    // A teaching admin takes a coach seat.
    expect((await t.app.get(EntitlementService).getUsage()).maxCoaches).toBe(usageBefore + 1);
  });

  it("refuses a student and anything but COACH", async () => {
    const student = await active(UserRole.STUDENT);
    expect((await t.call(superAdmin, "PUT", API_ROUTES.users.extraRoles(student.id), { extraRoles: ["COACH"] })).status).toBe(400);
    expect((await t.call(superAdmin, "PUT", API_ROUTES.users.extraRoles(admin.id), { extraRoles: ["SUPER_ADMIN"] })).status).toBe(400);
  });

  it("the database refuses an extra role the rules don't allow", async () => {
    const student = await active(UserRole.STUDENT);
    await expect(
      t.prisma.user.update({ data: { extraRoles: [UserRole.COACH] }, where: { id: student.id } })
    ).rejects.toThrow(/users_extra_roles_v1_check/);
  });

  it("starts in admin view and switches to coach view with coach powers only", async () => {
    expect(await roleOf(admin)).toMatchObject({ primaryRole: "ADMIN", role: "ADMIN", roles: ["ADMIN", "COACH"] });
    expect((await t.call(admin, "GET", API_ROUTES.users.list)).status).toBe(200);
    expect((await t.call(admin, "GET", API_ROUTES.approvals.substituteOptions(classId))).status).toBe(403);

    const switched = await t.call(admin, "POST", API_ROUTES.auth.switchRole, { role: "COACH" });
    expect(switched.status).toBe(200);
    expect((switched.body as AuthResponse).user.role).toBe("COACH");

    expect((await roleOf(admin)).role).toBe("COACH");
    // An admin route refuses coach view...
    expect((await t.call(admin, "GET", API_ROUTES.users.list)).status).toBe(403);
    // ...and the coach picker counts the teaching admin as a coach.
    const options = await t.call(coach, "GET", API_ROUTES.approvals.substituteOptions(classId));
    expect(options.status).toBe(200);
    expect(JSON.stringify(options.body)).toContain(admin.id);
  });

  it("refuses a role the account does not hold", async () => {
    expect((await t.call(admin, "POST", API_ROUTES.auth.switchRole, { role: "SUPER_ADMIN" })).status).toBe(403);
    expect((await t.call(admin, "POST", API_ROUTES.auth.switchRole, { role: "WIZARD" })).status).toBe(400);
  });

  it("switches back to admin view", async () => {
    expect((await t.call(admin, "POST", API_ROUTES.auth.switchRole, { role: "ADMIN" })).status).toBe(200);
    expect((await roleOf(admin)).role).toBe("ADMIN");
    expect((await t.call(admin, "GET", API_ROUTES.users.list)).status).toBe(200);
  });

  it("removing the role falls a coach-view session back and lists the batches it still coaches", async () => {
    await t.prisma.batchCoach.create({ data: { batchId, coachId: admin.id } });
    expect((await t.call(admin, "POST", API_ROUTES.auth.switchRole, { role: "COACH" })).status).toBe(200);

    const res = await t.call(superAdmin, "PUT", API_ROUTES.users.extraRoles(admin.id), { extraRoles: [] });
    expect(res.status).toBe(200);
    expect((res.body as UpdateExtraRolesResponse).coachedBatches).toEqual([{ id: batchId, name: "Owner's batch" }]);
    expect(await t.prisma.userRoleChange.count({ where: { action: "REMOVED", userId: admin.id } })).toBe(1);

    // Same session, next request: admin again, no logout.
    expect((await roleOf(admin)).role).toBe("ADMIN");
    expect((await t.call(admin, "GET", API_ROUTES.users.list)).status).toBe(200);
  });

  it("a super admin can let their own account teach (a solo academy owner)", async () => {
    const res = await t.call(superAdmin, "PUT", API_ROUTES.users.extraRoles(superAdmin.id), { extraRoles: ["COACH"] });
    expect(res.status).toBe(200);
    expect((await roleOf(superAdmin)).roles).toEqual(["SUPER_ADMIN", "COACH"]);
  });
});
