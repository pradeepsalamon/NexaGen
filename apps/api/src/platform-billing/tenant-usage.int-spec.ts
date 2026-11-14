import {
  API_ROUTES,
  type PlatformTenantResponse,
  type TenantUsageDayItem,
  type TenantUsageSnapshot
} from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { v2 as cloudinary } from "cloudinary";
import { Writable } from "stream";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { UploadService } from "../upload/upload.service";
import { TenantUsageService, utcDayStart } from "./tenant-usage.service";

const DAY_MS = 24 * 60 * 60 * 1000;

// Usage per academy (docs/SAAS_PLANS.md § "Usage history"): one row per
// academy per day, measured inside that academy only, read by the platform
// console and nobody else.
describe("academy usage counters (real app, real Postgres)", () => {
  let t: TestApp;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let rookId: string;
  let seq = 0;

  const activeUser = (tenantId: string, role: UserRole) =>
    runInTenant(tenantId, "spec", () => {
      seq += 1;
      return t.prisma.user.create({
        data: { email: `usage-${seq}@int.test`, firstName: `U${seq}`, password: "x", role, status: UserStatus.ACTIVE }
      });
    });

  const snapshots = async () =>
    asPlatform("spec", () => t.prisma.tenantUsage.findMany({ orderBy: { tenantId: "asc" } }));

  const dayRows = async (tenantId: string) =>
    (await t.prisma.tenantUsageDay.findMany({ orderBy: { day: "asc" }, where: { tenantId } })).map((row) => ({
      counts: row.counts as Record<string, number>,
      day: row.day.toISOString().slice(0, 10)
    }));

  /**
   * One day of activity and some stored files in an academy. `at` is a moment
   * inside the day; `scale` makes each academy's numbers different, so a row
   * holding another academy's figure can't pass by coincidence.
   */
  const seedActivity = (tenantId: string, at: Date, scale: number) =>
    runInTenant(tenantId, "spec", async () => {
      seq += 1;
      const tag = `${tenantId}-${seq}`;
      const coach = await t.prisma.user.create({
        data: { email: `coach-${tag}@int.test`, firstName: "C", password: "x", role: UserRole.COACH, status: UserStatus.PENDING }
      });
      const student = await t.prisma.user.create({
        data: { email: `student-${tag}@int.test`, firstName: "S", password: "x", role: UserRole.STUDENT, status: UserStatus.PENDING }
      });
      const klass = await t.prisma.coachClass.create({ data: { coachId: coach.id, endsAt: at, startsAt: at } });
      const session = { sessionEnd: at, sessionStart: new Date(at.getTime() - scale * 600_000) };

      // A student for `scale` × 10 minutes, the coach the same, and the coach's
      // board time inside that session (must not be counted again).
      const attendance = await t.prisma.classAttendance.create({ data: { classId: klass.id, studentId: student.id } });
      await t.prisma.attendanceLog.create({
        data: { ...session, attendanceId: attendance.id, eventType: "JOIN", sessionDuration: scale * 600, userId: student.id }
      });
      const coachAttendance = await t.prisma.coachAttendance.create({ data: { classId: klass.id, coachId: coach.id } });
      for (const eventType of ["JOIN", "BOARD_JOIN"] as const) {
        await t.prisma.coachAttendanceLog.create({
          data: { ...session, attendanceId: coachAttendance.id, eventType, sessionDuration: scale * 600, userId: coach.id }
        });
      }

      // `scale` emails from rules + 1 from staff, 2 × `scale` WhatsApp; unsent ones don't count.
      const delivery = { body: "x", event: "CLASS_REMINDER", recipientId: student.id } as const;
      for (let i = 0; i < scale; i += 1) {
        await t.prisma.messageDelivery.create({ data: { ...delivery, channel: "EMAIL", sentAt: at, status: "SENT" } });
        await t.prisma.messageDelivery.create({ data: { ...delivery, channel: "WHATSAPP", sentAt: at, status: "SENT" } });
        await t.prisma.messageDelivery.create({ data: { ...delivery, channel: "WHATSAPP", sentAt: at, status: "SENT" } });
      }
      await t.prisma.messageDelivery.create({ data: { ...delivery, channel: "EMAIL", status: "FAILED" } });
      await t.prisma.messageDelivery.create({ data: { ...delivery, channel: "IN_APP", sentAt: at, status: "SENT" } });
      await t.prisma.directEmail.create({
        data: { body: "x", recipientId: student.id, sentAt: at, status: "SENT", subject: "x", toEmail: student.email }
      });

      // `scale` finished analyses and one still queued.
      for (let i = 0; i <= scale; i += 1) {
        const game = await t.prisma.chessGame.create({
          data: { blackName: "b", pgn: "*", source: "IMPORT", startFen: "startpos", title: "g", whiteName: "w" }
        });
        await t.prisma.gameAnalysis.create({
          data: {
            configJson: {},
            conventionVersion: "1",
            depth: "QUICK",
            gameFingerprint: `${tag}-${i}`,
            gameId: game.id,
            ...(i < scale ? { completedAt: at, status: "COMPLETED" } : {})
          }
        });
      }

      // Stored files: a recording (scale MB), an upload (scale kB).
      await t.prisma.liveSession.create({
        data: {
          classId: klass.id,
          coachId: coach.id,
          recordingBytes: BigInt(scale * 1_000_000),
          recordingUrl: `rec-${tag}.mp4`,
          roomName: `room-${tag}`,
          scheduledAt: at
        }
      });
      await t.prisma.uploadedFile.create({ data: { bytes: scale * 1000, publicId: `files/${tag}`, tenantId } });
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    operator = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.SUPER_ADMIN)).id }
    });
    const created = await t.call(operator, "POST", API_ROUTES.platform.tenants, {
      idempotencyKey: "usage-rook-0001",
      name: "Rook Academy",
      planCode: "GROWTH",
      slug: "rook",
      superAdmin: { email: "owner@rook-usage.int.test", firstName: "Ravi" }
    });
    rookId = (created.body as PlatformTenantResponse).tenant.id;

    await activeUser(rookId, UserRole.STUDENT);
    await activeUser(rookId, UserRole.STUDENT);
    await activeUser(rookId, UserRole.COACH);
    await activeUser("tenant_nexa", UserRole.STUDENT);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("the nightly run snapshots each academy's own counts", async () => {
    await t.app.get(TenantUsageService).snapshotCron();

    const rows = await snapshots();
    const rook = rows.find((row) => row.tenantId === rookId);
    const nexa = rows.find((row) => row.tenantId === "tenant_nexa");
    expect(rook?.counts).toMatchObject({ maxBatches: 0, maxCoaches: 1, maxStudents: 2 });
    expect(nexa?.counts).toMatchObject({ maxCoaches: 0, maxStudents: 1 });
  });

  it("a later run replaces the snapshot instead of adding one", async () => {
    const service = t.app.get(TenantUsageService);
    const before = (await snapshots()).find((row) => row.tenantId === rookId);
    await activeUser(rookId, UserRole.STUDENT);
    await service.snapshotCron();

    const rows = (await snapshots()).filter((row) => row.tenantId === rookId);
    expect(rows).toHaveLength(1);
    expect(rows[0].counts).toMatchObject({ maxStudents: 3 });
    expect(rows[0].measuredAt.getTime()).toBeGreaterThanOrEqual(before!.measuredAt.getTime());
  });

  it("measures storage and a day's activity for each academy on its own", async () => {
    const service = t.app.get(TenantUsageService);
    const now = new Date();
    const yesterdayNoon = new Date(utcDayStart(now).getTime() - DAY_MS / 2);
    const yesterday = yesterdayNoon.toISOString().slice(0, 10);
    await seedActivity(rookId, yesterdayNoon, 3);
    await seedActivity("tenant_nexa", yesterdayNoon, 1);
    // Today's activity belongs to tomorrow's run, not this one.
    await seedActivity(rookId, new Date(utcDayStart(now).getTime() + 1000), 5);

    await service.snapshotCron();

    const rook = (await dayRows(rookId)).find((row) => row.day === yesterday);
    const nexa = (await dayRows("tenant_nexa")).find((row) => row.day === yesterday);
    expect(rook?.counts).toMatchObject({
      analysesCompleted: 3,
      emailsSent: 4,
      // 30 minutes for the student + 30 for the coach; the board session isn't added.
      participantMinutes: 60,
      whatsappSent: 6,
      // Totals are as of now, so they include today's files (3 + 5).
      recordingBytes: 8_000_000,
      storageBytes: 8_008_000,
      uploadBytes: 8000
    });
    expect(nexa?.counts).toMatchObject({
      analysesCompleted: 1,
      emailsSent: 2,
      participantMinutes: 20,
      recordingBytes: 1_000_000,
      storageBytes: 1_001_000,
      uploadBytes: 1000,
      whatsappSent: 2
    });
    // The latest snapshot the console already read carries the same figures.
    expect((await snapshots()).find((row) => row.tenantId === rookId)?.counts).toMatchObject({ participantMinutes: 60 });
  });

  it("keeps one row per day: a rerun replaces the day, the next night adds one", async () => {
    const service = t.app.get(TenantUsageService);
    const before = await dayRows(rookId);
    await service.snapshotCron();
    expect(await dayRows(rookId)).toHaveLength(before.length);

    const tomorrow = new Date(Date.now() + DAY_MS);
    await runInTenant(rookId, "spec", () => service.snapshotOne(rookId, tomorrow));
    const after = await dayRows(rookId);
    expect(after).toHaveLength(before.length + 1);
    // Today, measured "tomorrow night": the scale-5 activity seeded above.
    expect(after[after.length - 1].counts).toMatchObject({ emailsSent: 6, participantMinutes: 100, whatsappSent: 10 });
    // Yesterday's row is history now and didn't change.
    expect(after[after.length - 2]).toEqual(before[before.length - 1]);
  });

  it("fills in the activity of earlier days that have no row, without inventing totals", async () => {
    const service = t.app.get(TenantUsageService);
    const threeDaysAgo = new Date(utcDayStart(new Date()).getTime() - 2.5 * DAY_MS);
    await seedActivity("tenant_nexa", threeDaysAgo, 2);
    await asPlatform("spec", () => t.prisma.tenantUsageDay.deleteMany({ where: { tenantId: "tenant_nexa" } }));
    // Only days the academy existed are filled in; Nexa here is older than Rook (created today).
    await t.prisma.tenant.update({ data: { createdAt: new Date(Date.now() - 10 * DAY_MS) }, where: { id: "tenant_nexa" } });

    await service.snapshotCron();

    const row = (await dayRows("tenant_nexa")).find((item) => item.day === threeDaysAgo.toISOString().slice(0, 10));
    expect(row?.counts).toEqual({ analysesCompleted: 2, emailsSent: 3, participantMinutes: 40, whatsappSent: 4 });
    // Rook didn't exist that day and never picks up Nexa's activity.
    expect((await dayRows(rookId)).some((item) => item.day === row?.day)).toBe(false);
  });

  it("an upload's size is recorded for the academy that made it, and goes with the file", async () => {
    const keys = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] as const;
    const saved = keys.map((key) => process.env[key]);
    for (const key of keys) process.env[key] = "spec";
    // Cloudinary itself is not called: the stream swallows the bytes and answers like the SDK.
    const upload = jest.spyOn(cloudinary.uploader, "upload_stream").mockImplementation(((
      options: { folder: string; public_id: string },
      done: (error: undefined, result: unknown) => void
    ) => {
      const sink = new Writable({ write: (_chunk, _encoding, next) => next() });
      sink.on("finish", () => done(undefined, { bytes: 70_000, public_id: `${options.folder}/${options.public_id}`, secure_url: "x" }));
      return sink;
    }) as never);
    const destroy = jest.spyOn(cloudinary.uploader, "destroy").mockResolvedValue({} as never);
    const uploads = t.app.get(UploadService);
    const usage = t.app.get(TenantUsageService);
    const uploadBytes = async (tenantId: string) =>
      (await runInTenant(tenantId, "spec", () => usage.snapshotOne(tenantId))).counts.uploadBytes;

    try {
      const [rookBefore, nexaBefore] = [await uploadBytes(rookId), await uploadBytes("tenant_nexa")];
      const stored = await runInTenant(rookId, "spec", () => uploads.uploadPgn("1. e4 e5", "game.pgn"));
      expect(stored.public_id.startsWith(`tenants/${rookId}/pgns/`)).toBe(true);

      const rows = await asPlatform("spec", () => t.prisma.uploadedFile.findMany({ where: { publicId: stored.public_id } }));
      expect(rows.map((row) => [row.tenantId, row.bytes])).toEqual([[rookId, 70_000]]);
      expect(await uploadBytes(rookId)).toBe(rookBefore + 70_000);
      expect(await uploadBytes("tenant_nexa")).toBe(nexaBefore);

      // Another academy deleting by that name removes nothing of Rook's; Rook's own delete does.
      const url = `https://res.cloudinary.com/spec/raw/upload/v1/${stored.public_id}.x`;
      await runInTenant("tenant_nexa", "spec", () => uploads.deleteImage(url));
      expect(await uploadBytes(rookId)).toBe(rookBefore + 70_000);
      await runInTenant(rookId, "spec", () => uploads.deleteImage(url));
      expect(await uploadBytes(rookId)).toBe(rookBefore);
    } finally {
      upload.mockRestore();
      destroy.mockRestore();
      keys.forEach((key, index) => {
        if (saved[index] === undefined) delete process.env[key];
        else process.env[key] = saved[index];
      });
    }
  });

  it("serves the history to the platform console only, one academy or all", async () => {
    const all = await t.call(operator, "GET", `${API_ROUTES.platform.usageHistory}?days=30`);
    expect(all.status).toBe(200);
    const days = (all.body as { days: TenantUsageDayItem[] }).days;
    expect(new Set(days.map((row) => row.tenantId))).toEqual(new Set([rookId, "tenant_nexa"]));
    expect(days.map((row) => row.day)).toEqual([...days.map((row) => row.day)].sort());

    const one = await t.call(operator, "GET", `${API_ROUTES.platform.usageHistory}?tenantId=${rookId}`);
    const rookDays = (one.body as { days: TenantUsageDayItem[] }).days;
    expect(rookDays.length).toBeGreaterThan(0);
    expect(rookDays.every((row) => row.tenantId === rookId)).toBe(true);

    expect((await t.call(operator, "GET", `${API_ROUTES.platform.usageHistory}?days=0`)).status).toBe(400);
    expect((await t.call(operator, "GET", `${API_ROUTES.platform.usageHistory}?days=abc`)).status).toBe(400);
    expect((await t.call(operator, "GET", `${API_ROUTES.platform.usageHistory}?days=1&days=2`)).status).toBe(400);

    const nexaAdmin = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.ADMIN)).id }
    });
    expect((await t.call(nexaAdmin, "GET", API_ROUTES.platform.usageHistory)).status).toBe(403);
    const owner = await asPlatform("spec", () => t.prisma.user.findFirstOrThrow({ where: { email: "owner@rook-usage.int.test" } }));
    const asOwner = await t.call(owner, "GET", API_ROUTES.platform.usageHistory, undefined, { origin: "https://rook.nexachess.in" });
    expect(asOwner.status).toBe(403);
  });

  it("only the platform console reads them", async () => {
    const res = await t.call(operator, "GET", API_ROUTES.platform.usage);
    expect(res.status).toBe(200);
    const usage = (res.body as { usage: TenantUsageSnapshot[] }).usage;
    expect(usage.map((row) => row.tenantId)).toEqual(expect.arrayContaining([rookId, "tenant_nexa"]));
    expect(usage.find((row) => row.tenantId === rookId)?.counts).toMatchObject({ maxStudents: 3 });

    const owner = await asPlatform("spec", async () =>
      t.prisma.user.update({
        data: { status: UserStatus.ACTIVE },
        where: { id: (await t.prisma.user.findFirstOrThrow({ where: { email: "owner@rook-usage.int.test" } })).id }
      })
    );
    expect((await t.call(owner, "GET", API_ROUTES.platform.usage, undefined, { origin: "https://rook.nexachess.in" })).status).toBe(403);
    const nexaAdmin = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.ADMIN)).id }
    });
    expect((await t.call(nexaAdmin, "GET", API_ROUTES.platform.usage)).status).toBe(403);
  });
});
