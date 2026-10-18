import { ForbiddenException } from "@nestjs/common";
import { UserRole, type User } from "@prisma/client";
import { isAdminRole } from "../auth/authenticate";

// Token verification is shared (auth/authenticate.ts); this module keeps only its role rules.
export { authenticateUser, isAdminRole } from "../auth/authenticate";

export function assertAdmin(user: User): User {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenException("Only admins can manage payments.");
  }
  return user;
}

/**
 * Manual/offline payment recording is the one payments surface a coach may
 * touch — always scoped to their own batches, never a general payments view.
 */
export function assertAdminOrCoach(user: User): User {
  if (!isAdminRole(user.role) && user.role !== UserRole.COACH) {
    throw new ForbiddenException(
      "Only admins and coaches can record manual payments."
    );
  }
  return user;
}

/**
 * Row-level visibility for a payment record. Admins see everything; everyone
 * else sees only their own. There is no coach view of another student's
 * payments by design — money is between the student and the academy.
 */
export function paymentVisibilityWhere(user: User): { userId?: string } {
  return isAdminRole(user.role) ? {} : { userId: user.id };
}

export function assertOwnerOrAdmin(user: User, ownerId: string | null): void {
  if (isAdminRole(user.role)) return;
  if (ownerId && ownerId === user.id) return;
  throw new ForbiddenException("This payment belongs to another account.");
}

export function fullName(
  user: { firstName: string; lastName: string | null } | null | undefined
): string | null {
  if (!user) return null;
  return `${user.firstName} ${user.lastName ?? ""}`.trim() || null;
}
