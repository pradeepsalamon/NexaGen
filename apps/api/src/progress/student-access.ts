import { ForbiddenException } from "@nestjs/common";
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
  if (viewer.role === UserRole.ADMIN || viewer.role === UserRole.SUPER_ADMIN) return;
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
