import { API_ROUTES } from "@nexa-chess/types";
import type { User } from "@prisma/client";
import { createTestApp, type TestApp } from "../app";
import { resetDatabase } from "../db";
import { createWorld } from "./world";

type World = Awaited<ReturnType<typeof createWorld>>;
type Case = {
  name: string;
  as: (w: World) => User;
  method?: "GET" | "PATCH" | "POST" | "DELETE";
  path: (w: World) => string;
  body?: unknown;
};

// Every row has a twin in OWN_CASES with the same route on the caller's own
// data, so a denial can't pass just because the route itself is broken.
const CROSS_USER: Case[] = [
  // Student A reaching student B
  { name: "student reads another student's progress", as: (w) => w.a.student, path: (w) => API_ROUTES.progress.student(w.b.student.id) },
  { name: "student reads another student's attendance", as: (w) => w.a.student, path: (w) => API_ROUTES.attendance.studentById(w.b.student.id) },
  { name: "student reads another student's invoice", as: (w) => w.a.student, path: (w) => API_ROUTES.invoices.get(w.b.invoice.id) },
  { name: "student reads another student's invoice HTML", as: (w) => w.a.student, path: (w) => API_ROUTES.invoices.html(w.b.invoice.id) },
  { name: "student reads another student's puzzle attempt", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.attempt(w.b.privatePuzzle.id, w.b.attempt.id) },
  { name: "student opens another coach's private puzzle", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.mineGet(w.b.privatePuzzle.id) },
  // Coach A reaching coach B
  { name: "coach reads a student outside their batches (progress)", as: (w) => w.a.coach, path: (w) => API_ROUTES.progress.student(w.b.student.id) },
  { name: "coach reads another coach's class", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.getClass(w.b.class.id) },
  { name: "coach reads another coach's class details", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.classDetails(w.b.class.id) },
  { name: "coach edits another coach's class notes", as: (w) => w.a.coach, method: "PATCH", path: (w) => API_ROUTES.coach.updateClass(w.b.class.id), body: { notes: "hijacked" } },
  { name: "coach reads another coach's class attendance", as: (w) => w.a.coach, path: (w) => API_ROUTES.attendance.class(w.b.class.id) },
  { name: "coach reads another coach's batch", as: (w) => w.a.coach, path: (w) => API_ROUTES.batches.get(w.b.batch.id) },
  { name: "coach opens another coach's private puzzle", as: (w) => w.a.coach, path: (w) => API_ROUTES.puzzles.get(w.b.privatePuzzle.id) },
  { name: "coach edits another coach's private puzzle", as: (w) => w.a.coach, method: "PATCH", path: (w) => API_ROUTES.puzzles.update(w.b.privatePuzzle.id), body: { title: "hijacked" } },
  { name: "coach deletes another coach's private puzzle", as: (w) => w.a.coach, method: "DELETE", path: (w) => API_ROUTES.puzzles.delete(w.b.privatePuzzle.id) },
  { name: "coach reads another coach's payroll record", as: (w) => w.a.coach, path: (w) => API_ROUTES.payroll.record(w.b.payrollRecord.id) }
];

const OWN_CASES: Case[] = [
  { name: "student reads own progress", as: (w) => w.a.student, path: () => API_ROUTES.progress.mine },
  { name: "student reads own invoice", as: (w) => w.a.student, path: (w) => API_ROUTES.invoices.get(w.a.invoice.id) },
  { name: "student opens own coach's private puzzle", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.mineGet(w.a.privatePuzzle.id) },
  { name: "student reads own puzzle attempt", as: (w) => w.a.student, path: (w) => API_ROUTES.puzzles.attempt(w.a.privatePuzzle.id, w.a.attempt.id) },
  { name: "coach reads own batch", as: (w) => w.a.coach, path: (w) => API_ROUTES.batches.get(w.a.batch.id) },
  { name: "coach reads own class details", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.classDetails(w.a.class.id) },
  { name: "coach reads own student's progress", as: (w) => w.a.coach, path: (w) => API_ROUTES.progress.student(w.a.student.id) },
  { name: "coach reads own class", as: (w) => w.a.coach, path: (w) => API_ROUTES.coach.getClass(w.a.class.id) },
  { name: "coach reads own class attendance", as: (w) => w.a.coach, path: (w) => API_ROUTES.attendance.class(w.a.class.id) },
  { name: "coach opens own private puzzle", as: (w) => w.a.coach, path: (w) => API_ROUTES.puzzles.get(w.a.privatePuzzle.id) },
  { name: "coach reads own payroll record", as: (w) => w.a.coach, path: (w) => API_ROUTES.payroll.record(w.a.payrollRecord.id) }
];

// Lists must not mention the other side's rows at all.
const LIST_CASES: Case[] = [
  { name: "student's batch list (scoped, not forbidden)", as: (w) => w.a.student, path: () => API_ROUTES.batches.list },
  { name: "coach's /batches list", as: (w) => w.a.coach, path: () => API_ROUTES.batches.list },
  { name: "student's invoice list", as: (w) => w.a.student, path: () => API_ROUTES.invoices.mine },
  { name: "student's puzzle list", as: (w) => w.a.student, path: () => API_ROUTES.puzzles.mine },
  { name: "coach's student list", as: (w) => w.a.coach, path: () => API_ROUTES.coach.students },
  { name: "coach's batch list", as: (w) => w.a.coach, path: () => API_ROUTES.coach.batches },
  { name: "coach's class list", as: (w) => w.a.coach, path: () => API_ROUTES.coach.classes },
  { name: "coach's puzzle library", as: (w) => w.a.coach, path: () => API_ROUTES.puzzles.list },
  { name: "coach's payroll", as: (w) => w.a.coach, path: () => API_ROUTES.payroll.mine }
];

const WRONG_ROLE: Case[] = [
  { name: "student lists users", as: (w) => w.a.student, path: () => API_ROUTES.users.list },
  { name: "coach lists users", as: (w) => w.a.coach, path: () => API_ROUTES.users.list },
  { name: "student reads admin invoices", as: (w) => w.a.student, path: () => API_ROUTES.adminInvoices.list },
  { name: "coach reads admin payments", as: (w) => w.a.coach, path: () => API_ROUTES.adminPayments.list },
  { name: "coach reads payroll periods", as: (w) => w.a.coach, path: () => API_ROUTES.adminPayroll.periods },
  { name: "student creates a batch", as: (w) => w.a.student, method: "POST", path: () => API_ROUTES.batches.create, body: { name: "x" } },
  { name: "ADMIN opens the trash (super-admin only)", as: (w) => w.admin, path: () => API_ROUTES.trash.list },
  { name: "ADMIN lists demo classes (super-admin only)", as: (w) => w.admin, path: () => API_ROUTES.admin.demoClasses }
];

describe("cross-user access (real app, real Postgres)", () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  const run = (c: Case) => t.call(c.as(w), c.method ?? "GET", c.path(w), c.body);

  it.each(CROSS_USER.map((c) => [c.name, c] as const))("denies: %s", async (_name, c) => {
    const res = await run(c);
    expect(`${res.status} ${c.path(w)}`).toMatch(/^40[34] /);
  });

  it.each(OWN_CASES.map((c) => [c.name, c] as const))("allows: %s", async (_name, c) => {
    const res = await run(c);
    expect({ path: c.path(w), status: res.status }).toEqual({ path: c.path(w), status: 200 });
  });

  it.each(LIST_CASES.map((c) => [c.name, c] as const))("list hides side B: %s", async (_name, c) => {
    const res = await run(c);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    for (const id of [w.b.student.id, w.b.class.id, w.b.batch.id, w.b.invoice.id, w.b.privatePuzzle.id, w.b.payrollRecord.id]) {
      expect(text).not.toContain(id);
    }
  });

  it.each(WRONG_ROLE.map((c) => [c.name, c] as const))("forbids: %s", async (_name, c) => {
    const res = await run(c);
    expect({ path: c.path(w), status: res.status }).toEqual({ path: c.path(w), status: 403 });
  });

  it("the cross-user writes above changed nothing", async () => {
    const klass = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: w.b.class.id } });
    const puzzle = await t.prisma.puzzle.findUnique({ where: { id: w.b.privatePuzzle.id } });
    expect(klass.notes).not.toBe("hijacked");
    expect(puzzle?.title).toBe("Private B");
  });
});
