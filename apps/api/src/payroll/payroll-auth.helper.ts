import { ForbiddenException } from "@nestjs/common";
import { UserRole, UserStatus, type Prisma, type User } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { isAdminRole } from "../auth/authenticate";

// Token verification is shared (auth/authenticate.ts); this module keeps only its role rules.
export { authenticateUser, isAdminRole } from "../auth/authenticate";

export function assertAdmin(user: User): User {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenException("Only admins can manage payroll.");
  }
  return user;
}

/**
 * Row-level visibility for a coach's own payroll record. Admins see every
 * coach; a coach sees only their own — there is no coach-sees-coach case.
 */
export function payrollVisibilityWhere(user: User): { coachId?: string } {
  return isAdminRole(user.role) ? {} : { coachId: user.id };
}

export function assertOwnerOrAdmin(user: User, coachId: string | null): void {
  if (isAdminRole(user.role)) return;
  if (coachId && coachId === user.id) return;
  throw new ForbiddenException("This payroll record belongs to another coach.");
}

/**
 * An admin who also teaches doesn't sign off pay that includes their own
 * (review R8, owner 2026-11-24 option b): approving, finalizing or marking paid
 * is refused when their own record in scope has money on it and another active
 * admin could do it instead. An academy with one admin is never locked out.
 */
export async function assertNotSigningOffOwnPay(
  prisma: PrismaService,
  actorId: string,
  ownRecordWhere: Prisma.CoachPayrollRecordWhereInput
): Promise<void> {
  const ownRecord = await prisma.coachPayrollRecord.findFirst({
    where: {
      ...ownRecordWhere,
      coachId: actorId,
      OR: [{ grossEarningsMinor: { not: 0 } }, { netPayableMinor: { not: 0 } }]
    },
    select: { id: true }
  });
  if (!ownRecord) return;
  const otherAdmin = await prisma.user.findFirst({
    where: {
      id: { not: actorId },
      role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
      status: UserStatus.ACTIVE
    },
    select: { id: true }
  });
  if (otherAdmin) {
    throw new ForbiddenException("This includes your own pay. Ask another admin to do this step.");
  }
}
