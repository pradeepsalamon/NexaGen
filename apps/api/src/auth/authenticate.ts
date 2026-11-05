import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import { setTag, setUser } from "@sentry/nestjs";
import { type Prisma, UserRole, UserStatus } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { bindAuthenticatedUser } from "../tenancy/bind-authenticated-user";
import { asPlatform } from "../tenancy/tenant-context";
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

/**
 * Options for `authenticateUser`. `allowSales` lets a SALES account through:
 * the role exists only for the referral board, so every other service refuses
 * it here by default (docs/REFERRALS.md § "The SALES role").
 */
export type AuthenticateOptions = { allowSales?: boolean };

/** Verifies the token and loads the user, who must still be ACTIVE. */
export function authenticateUser(
  jwtService: JwtService,
  prisma: PrismaService,
  accessToken: string | undefined,
  args?: AuthenticateOptions
): Promise<Prisma.UserGetPayload<object>>;
export function authenticateUser<I extends Prisma.UserInclude>(
  jwtService: JwtService,
  prisma: PrismaService,
  accessToken: string | undefined,
  args: { include: I } & AuthenticateOptions
): Promise<Prisma.UserGetPayload<{ include: I }>>;
export async function authenticateUser(
  jwtService: JwtService,
  prisma: PrismaService,
  accessToken: string | undefined,
  args?: { include?: Prisma.UserInclude } & AuthenticateOptions
) {
  const payload = await verifyAccessToken(jwtService, accessToken);
  // The signed token names the user, so these two lookups run before (and
  // decide) the academy; bindAuthenticatedUser then checks it against the host.
  const [user, session] = await asPlatform("authenticate: the token names the user", () => Promise.all([
    prisma.user.findUnique({
      where: { id: payload.sub },
      // The overloads above type the result; comparing the default-args include
      // with the soft-delete client's own include type exceeds tsc's depth limit
      // once User has enough relations (TS2321), so it is not compared here.
      ...(args?.include ? { include: args.include as never } : {})
    }),
    // An access token outlives nothing it was minted from: logout, a password
    // reset or refresh-token reuse revokes the session family, and that must
    // end this token now rather than when its 15 minutes run out.
    payload.sessionId
      ? prisma.authSession.findUnique({
          where: { id: payload.sessionId },
          select: { revokedAt: true, tenantId: true, userId: true }
        })
      : null
  ]));
  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedException("Invalid session.");
  }
  if (payload.sessionId && (!session || session.revokedAt || session.userId !== user.id)) {
    throw new UnauthorizedException("Invalid session.");
  }
  // Academy check: a host/user/session mismatch is a 401 in every mode (docs/SAAS_MULTI_TENANCY.md §B step 4).
  bindAuthenticatedUser(user, session);
  if (user.role === UserRole.SALES && !args?.allowSales) {
    throw new ForbiddenException("Sales accounts can only use the referral board.");
  }
  // Request-scoped; id and role only, never contact details.
  setUser({ id: user.id });
  setTag("role", user.role);
  return user;
}

export function isAdminRole(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;
}
