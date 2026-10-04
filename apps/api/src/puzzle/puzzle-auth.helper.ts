import { ForbiddenException } from "@nestjs/common";
import { UserRole, type User } from "@prisma/client";
import { isAdminRole } from "../auth/authenticate";

// Token verification is shared (auth/authenticate.ts); this module keeps only its role rules.
export { authenticateUser, isAdminRole } from "../auth/authenticate";

export function assertAdmin(user: User): User {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenException("Only admins can manage this resource.");
  }
  return user;
}

export function assertStaffOrCoach(user: User): User {
  if (user.role !== UserRole.COACH && !isAdminRole(user.role)) {
    throw new ForbiddenException("Only coaches and admins can manage puzzles.");
  }
  return user;
}

export function assertStudent(user: User): User {
  if (user.role !== UserRole.STUDENT) {
    throw new ForbiddenException("Only students can solve puzzles here.");
  }
  return user;
}

export function fullName(
  user: { firstName: string; lastName: string | null } | null | undefined
): string | null {
  if (!user) return null;
  return `${user.firstName} ${user.lastName ?? ""}`.trim() || null;
}
