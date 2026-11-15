import { API_ROUTES, type Batch } from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// Students are minors: a student reading their batch sees their own email
// and nobody else's. Staff keep every email.
describe("batch member emails (real app, real Postgres)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  async function setup() {
    const admin = await createUser(t.prisma, UserRole.SUPER_ADMIN);
    const coach = await createUser(t.prisma, UserRole.COACH);
    const me = await createUser(t.prisma, UserRole.STUDENT);
    const classmate = await createUser(t.prisma, UserRole.STUDENT);
    await t.prisma.user.updateMany({ data: { status: UserStatus.ACTIVE } });
    const batch = await t.prisma.batch.create({
      data: {
        coaches: { create: [{ coachId: coach.id }] },
        name: "Term 1",
        students: { create: [{ studentId: me.id }, { studentId: classmate.id }] }
      }
    });
    return { admin, batch, classmate, coach, me };
  }

  const emails = (batch: Batch) =>
    Object.fromEntries([...batch.coaches, ...batch.students].map((u) => [u.id, u.email]));

  it("hides classmates' and coaches' emails from a student, in the list and the detail", async () => {
    const { batch, classmate, coach, me } = await setup();

    const list = await t.call(me, "GET", API_ROUTES.batches.list);
    expect(list.status).toBe(200);
    const listed = (list.body as { batches: Batch[] }).batches.find((b) => b.id === batch.id);
    expect(listed).toBeDefined();
    expect(emails(listed!)).toEqual({ [classmate.id]: null, [coach.id]: null, [me.id]: me.email });

    const detail = await t.call(me, "GET", API_ROUTES.batches.get(batch.id));
    expect(detail.status).toBe(200);
    expect(emails((detail.body as { batch: Batch }).batch)).toEqual({
      [classmate.id]: null,
      [coach.id]: null,
      [me.id]: me.email
    });
  });

  it("keeps every email for the coach and the admin", async () => {
    const { admin, batch, classmate, coach, me } = await setup();
    const all = { [classmate.id]: classmate.email, [coach.id]: coach.email, [me.id]: me.email };

    for (const viewer of [coach, admin]) {
      const res = await t.call(viewer, "GET", API_ROUTES.batches.get(batch.id));
      expect(res.status).toBe(200);
      expect(emails((res.body as { batch: Batch }).batch)).toEqual(all);
    }
  });
});
