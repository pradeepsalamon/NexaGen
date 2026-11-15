import { API_ROUTES } from "@nexa-chess/types";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

// Deleting a homework item over HTTP against real Postgres: it goes to Trash, and while it is
// there its deployments and every student's copy are hidden too (soft-delete.extension.ts
// `parentScopedWhere`). Restoring brings all of it back; purging it from Trash removes the
// deployments and student copies with it, as the old hard delete did.

describe("Assignment trash (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;

  const mine = async () => JSON.stringify((await t.call(w.a.student, "GET", API_ROUTES.assignments.mine)).body);

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  it("moves it to Trash and hides the student's copy and the deployment", async () => {
    const title = w.a.assignment.title;
    expect(await mine()).toContain(title);

    const res = await t.call(w.a.coach, "DELETE", API_ROUTES.assignments.delete(w.a.assignment.id));
    expect(res.status).toBe(200);

    expect(await mine()).not.toContain(title);
    expect((await t.call(w.a.student, "GET", API_ROUTES.assignments.mineGet(w.a.studentAssignment.id))).status).toBe(404);
    expect(await t.prisma.assignmentBatch.count({ where: { id: w.a.deployment.id } })).toBe(0);
    // Still in the database, only hidden.
    expect(await t.prisma.withDeleted.studentAssignment.count({ where: { id: w.a.studentAssignment.id } })).toBe(1);

    const trash = JSON.stringify((await t.call(w.superAdmin, "GET", `${API_ROUTES.trash.list}?entity=Assignment`)).body);
    expect(trash).toContain(title);
  });

  it("restoring it from Trash brings the student's copy back", async () => {
    const res = await t.call(w.superAdmin, "POST", API_ROUTES.trash.restoreItem("Assignment", w.a.assignment.id));
    expect(res.status).toBeLessThan(300);
    expect(await mine()).toContain(w.a.assignment.title);
    expect(await t.prisma.assignmentBatch.count({ where: { id: w.a.deployment.id } })).toBe(1);
  });

  it("deleting it permanently from Trash removes the deployments and student copies", async () => {
    expect((await t.call(w.a.coach, "DELETE", API_ROUTES.assignments.delete(w.a.assignment.id))).status).toBe(200);
    const res = await t.call(w.superAdmin, "DELETE", API_ROUTES.trash.deleteItem("Assignment", w.a.assignment.id));
    expect(res.status).toBeLessThan(300);

    expect(await t.prisma.withDeleted.assignment.count({ where: { id: w.a.assignment.id } })).toBe(0);
    expect(await t.prisma.withDeleted.studentAssignment.count({ where: { id: w.a.studentAssignment.id } })).toBe(0);
  });

  it("other students' homework is untouched", async () => {
    expect(JSON.stringify((await t.call(w.b.student, "GET", API_ROUTES.assignments.mine)).body)).toContain(
      w.b.assignment.title
    );
  });
});
