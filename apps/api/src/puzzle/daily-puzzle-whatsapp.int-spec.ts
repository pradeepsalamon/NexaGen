import { API_ROUTES, type DailyPuzzleScheduleResponse, type DailyPuzzleTodayResponse } from "@nexa-chess/types";
import { UserRole, UserStatus, type User } from "@prisma/client";
import { runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { DailyPuzzleWhatsAppService } from "./daily-puzzle-whatsapp.service";

// Puzzle of the Day on WhatsApp (docs/PUZZLE_OF_THE_DAY.md step 2) on real
// Postgres: the admin's rule and days, the student's own switch, keyword
// numbers, one message per number per academy day, and turning it off.

// Monday 23 Nov 2026, 06:30 in Kolkata (the academy's zone).
const MONDAY_0630 = new Date("2026-11-23T01:00:00.000Z");
const TUESDAY_0630 = new Date("2026-11-24T01:00:00.000Z");

describe("Puzzle of the Day on WhatsApp (real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let sam: User;
  let rik: User;
  let lone: User;

  const sweep = (now: Date) =>
    runInTenant("tenant_nexa", "spec", () => t.app.get(DailyPuzzleWhatsAppService).queueForAcademy(now));
  const todayFor = async (user: User) => {
    const res = await t.call(user, "GET", API_ROUTES.dailyPuzzle.today);
    expect(res.status).toBe(200);
    return (res.body as DailyPuzzleTodayResponse).whatsapp;
  };
  async function student(firstName: string, phoneNumber: string | null) {
    const user = await createUser(t.prisma, UserRole.STUDENT);
    await t.prisma.studentProfile.create({ data: { parentName: "Parent", userId: user.id } });
    return t.prisma.user.update({ data: { firstName, phoneNumber, status: UserStatus.ACTIVE }, where: { id: user.id } });
  }

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    jest.spyOn(t.app.get(WhatsAppService), "isConfigured").mockReturnValue(true);
    admin = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.ADMIN)).id }
    });
    sam = await student("Sam", "+91 98765 43210");
    rik = await student("Rik", null);
    // Not in a batch with Puzzle of the Day: never sent to, even when switched on.
    lone = await student("Lone", "+919000000001");
    const batch = await t.prisma.batch.create({ data: { name: "A" } });
    await t.prisma.batchStudent.createMany({
      data: [
        { batchId: batch.id, studentId: sam.id },
        { batchId: batch.id, studentId: rik.id }
      ]
    });
  });
  afterAll(async () => {
    jest.restoreAllMocks();
    await t?.close();
  });

  it("offers nothing until an admin turns the rule on", async () => {
    expect(await todayFor(sam)).toMatchObject({ available: false, on: false, schedule: null });
    expect((await t.call(sam, "PUT", API_ROUTES.dailyPuzzle.whatsapp, { on: true })).status).toBe(400);
    expect(await sweep(MONDAY_0630)).toBe(0);
  });

  it("an admin turns it on for chosen days; WhatsApp only", async () => {
    const res = await t.call(admin, "PUT", API_ROUTES.messaging.rule("DAILY_PUZZLE"), {
      enabled: true,
      scheduleDays: [3, 1],
      scheduleHour: 7,
      scheduleMinute: 0,
      scheduleMode: "DAILY"
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ scheduleDays: [1, 3], whatsappEnabled: true });
    expect((await t.call(admin, "PUT", API_ROUTES.messaging.rule("DAILY_PUZZLE"), { inAppEnabled: true })).status).toBe(400);
  });

  it("a student turns it on for their own phone; no phone, no switch", async () => {
    expect(await todayFor(sam)).toMatchObject({ available: true, on: false, phoneMasked: "••••3210", schedule: "Mon, Wed at 7:00 am" });
    const on = await t.call(sam, "PUT", API_ROUTES.dailyPuzzle.whatsapp, { on: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ on: true });
    expect((await t.call(rik, "PUT", API_ROUTES.dailyPuzzle.whatsapp, { on: true })).status).toBe(400);
    expect((await t.call(lone, "PUT", API_ROUTES.dailyPuzzle.whatsapp, { on: true })).status).toBe(200);
    // Students only.
    expect((await t.call(admin, "PUT", API_ROUTES.dailyPuzzle.whatsapp, { on: true })).status).toBe(403);
  });

  it("queues one message per number on a chosen day, near the send time, once", async () => {
    await t.prisma.whatsAppContact.createMany({
      data: [
        { dailyPuzzleAt: new Date(), waId: "919111111111" },
        // Sent STOP: STOP wins.
        { dailyPuzzleAt: new Date(), optedOutAt: new Date(), waId: "919222222222" },
        // Sam's own number also sent PUZZLE: still one message.
        { dailyPuzzleAt: new Date(), waId: "919876543210" },
        // Wrote to the academy, never asked for the puzzle.
        { waId: "919333333333" }
      ]
    });

    expect(await sweep(MONDAY_0630)).toBe(2);
    const rows = await t.prisma.messageDelivery.findMany({ orderBy: { recipientPhone: "asc" }, where: { event: "DAILY_PUZZLE" } });
    expect(rows.map((r) => [r.recipientPhone, r.recipientId, r.channel, r.status, r.dedupeKey])).toEqual([
      ["919111111111", null, "WHATSAPP", "PENDING", "DAILY_PUZZLE:919111111111:2026-11-23"],
      ["919876543210", sam.id, "WHATSAPP", "PENDING", "DAILY_PUZZLE:919876543210:2026-11-23"]
    ]);
    expect(rows[0].body).toContain("/student/daily-puzzle");
    expect(rows[0].body).not.toContain("Sam");

    // The next hourly run finds the same messages already queued.
    expect(await sweep(MONDAY_0630)).toBe(0);
    // Tuesday is not a chosen day: Wednesday's send is a day away.
    expect(await sweep(TUESDAY_0630)).toBe(0);
  });

  it("the admin sees how many numbers it reaches", async () => {
    const res = await t.call(admin, "GET", API_ROUTES.dailyPuzzle.schedule);
    expect((res.body as DailyPuzzleScheduleResponse).whatsapp).toEqual({
      appStudents: 1,
      keywordNumbers: 2,
      schedule: "Mon, Wed at 7:00 am",
      sending: true
    });
  });

  it("turning it off drops what is still queued", async () => {
    const off = await t.call(sam, "PUT", API_ROUTES.dailyPuzzle.whatsapp, { on: false });
    expect(off.body).toMatchObject({ on: false });
    const row = await t.prisma.messageDelivery.findFirstOrThrow({ where: { event: "DAILY_PUZZLE", recipientId: sam.id } });
    expect(row).toMatchObject({ error: "Turned off before it was sent.", status: "SKIPPED" });
    const other = await t.prisma.messageDelivery.findFirstOrThrow({ where: { event: "DAILY_PUZZLE", recipientPhone: "919111111111" } });
    expect(other.status).toBe("PENDING");
  });
});
