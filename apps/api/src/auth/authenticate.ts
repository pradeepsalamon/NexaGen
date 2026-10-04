import { UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { setTag, setUser } from "@sentry/nestjs";
import { type Prisma, UserRole, UserStatus } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "./types";

/**
 * The one place an access-token cookie value becomes a user (CLAUDE.md §3.2).
 * Services call this from their own `getAuthenticatedUser` and then apply
 * their role checks. Every token failure is a 401 — never the 500 a raw
 * `TokenExpiredError` turns into — so the web client's refresh-and-retry fires.
 */
export async function verifyAccessToken(
  jwtService: JwtService,
  accessToken: string | undefined
): Promise<AccessTokenPayload> {
  if (!accessToken) throw new UnauthorizedException("Access token is missing.");

  let payload: AccessTokenPayload;
  try {
    payload = await jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
      secret: getApiEnv().JWT_ACCESS_SECRET
    });
  } catch {
    throw new UnauthorizedException("Invalid or expired token.");
  }
  if (payload.type !== "access" || !payload.sub) {
    throw new UnauthorizedException("Invalid token type.");
  }
  return payload;
}

/** Verifies the token and loads the user, who must still be ACTIVE. */
export function authenticateUser(
  jwtService: JwtService,
  prisma: PrismaService,
  accessToken: string | undefined
): Promise<Prisma.UserGetPayload<object>>;
export function authenticateUser<I extends Prisma.UserInclude>(
  jwtService: JwtService,
  prisma: PrismaService,
  accessToken: string | undefined,
  args: { include: I }
): Promise<Prisma.UserGetPayload<{ include: I }>>;
export async function authenticateUser(
  jwtService: JwtService,
  prisma: PrismaService,
  accessToken: string | undefined,
  args?: { include: Prisma.UserInclude }
) {
  const payload = await verifyAccessToken(jwtService, accessToken);
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    ...(args ? { include: args.include } : {})
  });
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException("Invalid session.");
  }
  // Request-scoped; id and role only, never contact details.
  setUser({ id: user.id });
  setTag("role", user.role);
  return user;
}

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}
