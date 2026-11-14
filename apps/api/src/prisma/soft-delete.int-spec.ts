import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "./prisma.service";
import { createUser, resetDatabase } from "../test/integration/db";

describe("soft delete (real Postgres)", () => {
  const prisma = new PrismaService();

  beforeEach(() => resetDatabase(prisma));
  afterAll(() => prisma.$disconnect());

  const softDeleteUser = (id: string) =>
    prisma.user.update({ where: { id }, data: { isDeleted: true, deletedAt: new Date() } });

  it("hides a deleted row from filtered reads but not from withDeleted", async () => {
    const kept = await createUser(prisma, UserRole.STUDENT);
    const gone = await createUser(prisma, UserRole.STUDENT);
    await softDeleteUser(gone.id);

    const visible = await prisma.user.findMany({ select: { id: true } });
    expect(visible.map((u) => u.id)).toEqual([kept.id]);
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.user.findUnique({ where: { id: gone.id } })).toBeNull();
    expect(await prisma.user.findFirst({ where: { id: gone.id }, includeDeleted: true } as Prisma.UserFindFirstArgs)).not.toBeNull();
    expect(await prisma.withDeleted.user.count()).toBe(2);
  });

  it("keeps a deleted user's email reserved, so pre-checks must use withDeleted", async () => {
    const gone = await createUser(prisma, UserRole.COACH, { email: "taken@int.test" });
    await softDeleteUser(gone.id);

    // A filtered pre-check misses the conflict...
    expect(await prisma.user.findUnique({ where: { email: "taken@int.test" } })).toBeNull();
    expect(await prisma.withDeleted.user.findUnique({ where: { email: "taken@int.test" } })).not.toBeNull();
    // ...and the write then collides on the index that spans deleted rows.
    await expect(createUser(prisma, UserRole.COACH, { email: "taken@int.test" })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("filters deleted rows out of an included relation", async () => {
    const [a, b] = [await createUser(prisma, UserRole.STUDENT), await createUser(prisma, UserRole.STUDENT)];
    const batch = await prisma.batch.create({
      data: { name: "Int batch", students: { create: [{ studentId: a.id }, { studentId: b.id }] } },
    });
    await prisma.batchStudent.updateMany({
      where: { batchId: batch.id, studentId: b.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    const loaded = await prisma.batch.findUnique({ where: { id: batch.id }, include: { students: true } });
    expect(loaded?.students.map((s) => s.studentId)).toEqual([a.id]);
  });
});
