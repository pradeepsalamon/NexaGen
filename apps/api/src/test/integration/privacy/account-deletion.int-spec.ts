import { API_ROUTES } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { hashSecret } from "../../../auth/auth.utils";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

const PASSWORD = "Test@12345";

describe("account deletion requests (real app, real Postgres)", () => {
  let t: TestApp;
  let admin: User;

  const activeUser = async (role: UserRole) => {
    const user = await createUser(t.prisma, role);
    return t.prisma.user.update({
      data: { password: await hashSecret(PASSWORD), status: UserStatus.ACTIVE },
      where: { id: user.id }
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await activeUser(UserRole.ADMIN);
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("a student asks, an admin completes, the account is soft-deleted and signed out", async () => {
    const student = await activeUser(UserRole.STUDENT);
    const ask = (currentPassword: string) =>
      t.call(student, "POST", API_ROUTES.privacy.deletionRequest, { currentPassword, reason: "Moving away" });

    expect((await ask("wrong-password")).status).toBe(400);
    const created = await ask(PASSWORD);
    expect(created.status).toBe(201);
    const requestId = (created.body as { request: { id: string; status: string } }).request.id;
    // The partial unique index allows one waiting request per user.
    expect((await ask(PASSWORD)).status).toBe(409);

    const mine = await t.call(student, "GET", API_ROUTES.privacy.deletionRequest);
    expect(mine.body).toMatchObject({ request: { id: requestId, status: "PENDING" } });

    const list = await t.call(admin, "GET", API_ROUTES.adminPrivacy.deletionRequests);
    expect(JSON.stringify(list.body)).toContain(requestId);

    const done = await t.call(admin, "POST", API_ROUTES.adminPrivacy.completeDeletionRequest(requestId), {});
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ request: { status: "COMPLETED", userId: student.id } });

    const row = await t.prisma.withDeleted.user.findUniqueOrThrow({ where: { id: student.id } });
    expect(row.isDeleted).toBe(true);
    expect((await t.call(student, "GET", API_ROUTES.auth.me)).status).toBe(401);
    // A second click can't resolve it twice.
    expect((await t.call(admin, "POST", API_ROUTES.adminPrivacy.completeDeletionRequest(requestId), {})).status).toBe(409);
  });

  it("a declined request leaves the account alone and needs a reason", async () => {
    const coach = await activeUser(UserRole.COACH);
    const created = await t.call(coach, "POST", API_ROUTES.privacy.deletionRequest, { currentPassword: PASSWORD });
    const requestId = (created.body as { request: { id: string } }).request.id;

    const reject = (body: unknown) => t.call(admin, "POST", API_ROUTES.adminPrivacy.rejectDeletionRequest(requestId), body);
    expect((await reject({})).status).toBe(400);
    expect((await reject({ note: "Outstanding payroll to settle first" })).body).toMatchObject({
      request: { reviewNote: "Outstanding payroll to settle first", status: "REJECTED" }
    });
    expect((await t.prisma.user.findUnique({ where: { id: coach.id } }))?.isDeleted).toBe(false);
  });

  it("a user can withdraw a waiting request and ask again later", async () => {
    const student = await activeUser(UserRole.STUDENT);
    const ask = () => t.call(student, "POST", API_ROUTES.privacy.deletionRequest, { currentPassword: PASSWORD });

    expect((await ask()).status).toBe(201);
    const withdrawn = await t.call(student, "POST", API_ROUTES.privacy.withdrawDeletionRequest);
    expect(withdrawn.body).toMatchObject({ request: { status: "WITHDRAWN" } });
    expect((await t.call(student, "POST", API_ROUTES.privacy.withdrawDeletionRequest)).status).toBe(404);
    expect((await ask()).status).toBe(201);
  });

  it("an admin can't complete their own request", async () => {
    const otherAdmin = await activeUser(UserRole.ADMIN);
    const created = await t.call(otherAdmin, "POST", API_ROUTES.privacy.deletionRequest, { currentPassword: PASSWORD });
    const requestId = (created.body as { request: { id: string } }).request.id;

    const res = await t.call(otherAdmin, "POST", API_ROUTES.adminPrivacy.completeDeletionRequest(requestId), {});
    expect(res.status).toBe(400);
    const row = await t.prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });
    expect(row.status).toBe("PENDING");
  });
});
