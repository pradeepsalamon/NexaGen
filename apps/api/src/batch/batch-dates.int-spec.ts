import { API_ROUTES } from "@nexa-chess/types";
import { ClassStatus, UserRole, UserStatus } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

const DAY = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the academy (IST) calendar day `offsetDays` from now. */
const istDay = (offsetDays: number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
    new Date(Date.now() + offsetDays * DAY)
  );

// Narrowing a batch's dates cancels the sessions that have not happened and now
// fall outside them, and leaves everything else alone. Real Postgres because
// the window is a timezone-shifted date-only comparison.
describe("batch dates vs its classes (real app, real Postgres)", () => {
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
    await t.prisma.user.updateMany({ data: { status: UserStatus.ACTIVE } });
    const batch = await t.prisma.batch.create({
      data: { name: "Term 1", startsAt: new Date(`${istDay(-60)}T00:00:00.000Z`) }
    });
    const klass = (startsInDays: number, status: ClassStatus = ClassStatus.SCHEDULED) => {
      const startsAt = new Date(Date.now() + startsInDays * DAY);
      return t.prisma.coachClass.create({
        data: {
          batchId: batch.id,
          coachId: coach.id,
          endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
          startsAt,
          status
        }
      });
    };
    return { admin, batch, klass };
  }

  it("cancels future sessions after a new end date and keeps the rest", async () => {
    const { admin, batch, klass } = await setup();
    const inside = await klass(5);
    const after = await klass(30);
    const alreadyCancelled = await klass(31, ClassStatus.CANCELLED);
    const held = await klass(-10, ClassStatus.COMPLETED);

    const res = await t.call(admin, "PATCH", API_ROUTES.batches.update(batch.id), {
      endsAt: istDay(10)
    });
    expect(res.status).toBe(200);

    const status = async (id: string) =>
      (await t.prisma.coachClass.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(inside.id)).toBe(ClassStatus.SCHEDULED);
    expect(await status(held.id)).toBe(ClassStatus.COMPLETED);
    expect(await status(alreadyCancelled.id)).toBe(ClassStatus.CANCELLED);

    const cut = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: after.id } });
    expect(cut).toMatchObject({
      cancellationReason: "Outside the batch's dates",
      cancelledById: admin.id,
      status: ClassStatus.CANCELLED
    });
  });

  it("never touches history before a later start date", async () => {
    const { admin, batch, klass } = await setup();
    const missed = await klass(-3);
    const upcoming = await klass(3);

    const res = await t.call(admin, "PATCH", API_ROUTES.batches.update(batch.id), {
      startsAt: istDay(1)
    });
    expect(res.status).toBe(200);

    // A past session is history even if it now predates the batch.
    expect((await t.prisma.coachClass.findUniqueOrThrow({ where: { id: missed.id } })).status).toBe(
      ClassStatus.SCHEDULED
    );
    expect((await t.prisma.coachClass.findUniqueOrThrow({ where: { id: upcoming.id } })).status).toBe(
      ClassStatus.SCHEDULED
    );
  });

  it("refuses an end date before the existing start date", async () => {
    const { admin, batch } = await setup();

    const res = await t.call(admin, "PATCH", API_ROUTES.batches.update(batch.id), {
      endsAt: istDay(-90)
    });
    expect(res.status).toBe(400);
  });
});
