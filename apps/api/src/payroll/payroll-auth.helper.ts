import { ForbiddenException } from "@nestjs/common";
import type { User } from "@prisma/client";
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
