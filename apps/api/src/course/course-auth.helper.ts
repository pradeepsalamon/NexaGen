import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { UserRole, UserStatus, type User } from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import type { PrismaService } from "../prisma/prisma.service";

const env = getApiEnv();

/**
 * Token-string auth (the codebase pattern — no NestJS guards). Verifies the raw
 * access-token cookie value, loads the user, checks it is ACTIVE.
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
  if (payload.type !== "access") throw new UnauthorizedException("Invalid token type.");

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException("Invalid session.");
  }
  return user;
}

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}

/** Course authoring is admin-only — Course has no coach/visibility scoping. */
export function assertAdmin(user: User): User {
  if (!isAdminRole(user.role)) {
    throw new ForbiddenException("Only admins can manage courses.");
  }
  return user;
}

export function assertStudent(user: User): User {
  if (user.role !== UserRole.STUDENT) {
    throw new ForbiddenException("Only students can view their courses here.");
  }
  return user;
}

export function fullName(
  user: { firstName: string; lastName: string | null } | null | undefined
): string | null {
  if (!user) return null;
  return `${user.firstName} ${user.lastName ?? ""}`.trim() || null;
}
