import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { UserRole, UserStatus, type User } from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import type { PrismaService } from "../prisma/prisma.service";

const env = getApiEnv();

/**
 * Token-string auth — the codebase pattern (CLAUDE.md §3.2). No NestJS guards:
 * the controller pulls the raw cookie value and the service verifies it.
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
    throw new ForbiddenException("Only admins can manage payments.");
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
