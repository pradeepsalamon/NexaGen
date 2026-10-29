import type { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";

/**
 * A demo guest is a `DemoClassRegistration`, not a user: it has no session
 * cookie, only the LiveKit token `joinDemoClass` mints. This JWT, issued with
 * it, is the guest's credential for the in-room REST routes a guest may call
 * (sent as `DEMO_GUEST_TOKEN_HEADER`). Its own `type` means `authenticateUser`
 * never accepts it as an access token, the same separation as the MFA challenge.
 */
export type DemoGuestTokenPayload = {
  type: "demo_guest";
  /** The `DemoClassRegistration` id. */
  sub: string;
  classId: string;
};

/** Covers a long demo; a guest who reloads the page re-joins and gets a fresh one. */
export const DEMO_GUEST_TOKEN_TTL = "6h";

export function signDemoGuestToken(
  jwtService: JwtService,
  input: { registrationId: string; classId: string }
): Promise<string> {
  return jwtService.signAsync(
    { classId: input.classId, sub: input.registrationId, type: "demo_guest" } satisfies DemoGuestTokenPayload,
    { expiresIn: DEMO_GUEST_TOKEN_TTL, secret: getApiEnv().JWT_ACCESS_SECRET }
  );
}

/** The payload, or null for a missing / forged / expired / non-guest token. */
export async function readDemoGuestToken(
  jwtService: JwtService,
  token: string | undefined
): Promise<DemoGuestTokenPayload | null> {
  if (!token) return null;
  try {
    const payload = await jwtService.verifyAsync<DemoGuestTokenPayload>(token, {
      secret: getApiEnv().JWT_ACCESS_SECRET
    });
    return payload.type === "demo_guest" && payload.sub && payload.classId ? payload : null;
  } catch {
    return null;
  }
}
