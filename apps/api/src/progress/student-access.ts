import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Who may look at a student's progress and activity history: the student
 * themselves, an admin, or a coach who coaches a (live) batch the student is
 * enrolled in. The id comes from the URL — the role always comes from the
 * verified session, never from the request.
 */
export async function assertCanViewStudent(
  prisma: PrismaService,
  viewer: { id: string; role: UserRole },
  studentId: string
): Promise<void> {
  if (viewer.role === UserRole.ADMIN || viewer.role === UserRole.SUPER_ADMIN) {
    // An admin sees any student of their own academy; the read is scoped, so a
    // student of another academy (or an unknown id) is a 404, not an empty page.
    const student = await prisma.user.findFirst({ select: { id: true }, where: { id: studentId, role: UserRole.STUDENT } });
    if (!student) throw new NotFoundException("Student not found.");
    return;
  }
  if (viewer.role === UserRole.STUDENT) {
    if (viewer.id !== studentId) throw new ForbiddenException("You can only view your own progress.");
    return;
  }
  if (viewer.role === UserRole.COACH) {
    const shared = await prisma.batchStudent.findFirst({
      where: {
        isDeleted: false,
        studentId,
        batch: { isDeleted: false, coaches: { some: { coachId: viewer.id, isDeleted: false } } }
      },
      select: { id: true }
    });
    if (!shared) throw new ForbiddenException("This student isn't in any of your batches.");
    return;
  }
  throw new ForbiddenException("You can't view student progress.");
}
