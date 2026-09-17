import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { UserRole, UserStatus, type User } from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import type { PrismaService } from "../prisma/prisma.service";

const env = getApiEnv();

/**
 * Token-string auth — the codebase pattern (CLAUDE.md §3.2). No NestJS
 * guards: the controller pulls the raw cookie value and the service verifies
 * it. Mirrors apps/api/src/payments/payments-auth.helper.ts exactly, kept as
 * its own copy per-module rather than shared, matching how puzzle/payments
 * each own their auth helper.
 */
export async function authenticateUser(
  jwtService: JwtService,
  prisma: PrismaService,
  accessToken: string | undefined
): Promise<User> {
  if (!accessToken) throw new UnauthorizedException("Access token is missing.");

  const payload = await jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
    secret: env.JWT_ACCESS_SECRET
  });
  if (payload.type !== "access") {
    throw new UnauthorizedException("Invalid token type.");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException("Invalid session.");
  }
  return user;
}

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

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
