import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ThrottlerGuard } from "@nestjs/throttler";
import { getApiEnv } from "@nexa-chess/config/api";
import { AUTH_COOKIE_NAMES, type AccessTokenPayload } from "../../auth/types";

const jwt = new JwtService({});

type ThrottledRequest = {
  cookies?: Record<string, unknown>;
  ip?: string;
  originalUrl?: string;
  socket?: { remoteAddress?: string };
  url?: string;
};

/**
 * Signed-in traffic is counted per user, so a classroom behind one NAT IP
 * doesn't share a single 100/min budget. Anonymous requests and /auth routes
 * stay per IP, so login/reset brute-force limits can't be multiplied with accounts.
 */
export function resolveThrottleTracker(req: ThrottledRequest): string {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
  const path = req.originalUrl ?? req.url ?? "";
  if (path.startsWith("/auth/")) return ip;

  const token = req.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  if (typeof token !== "string" || !token) return ip;

  try {
    const payload = jwt.verify<AccessTokenPayload>(token, {
      secret: getApiEnv().JWT_ACCESS_SECRET
    });
    return payload.type === "access" && payload.sub ? `user:${payload.sub}` : ip;
  } catch {
    return ip;
  }
}

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    return resolveThrottleTracker(req as ThrottledRequest);
  }
}
