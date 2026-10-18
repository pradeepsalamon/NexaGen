import type { UserRole } from "@nexa-chess/types";

export type AccessTokenPayload = {
  email: string;
  role: UserRole;
  sessionId: string;
  sub: string;
  type: "access";
};

export type RefreshTokenPayload = {
  sessionId: string;
  sub: string;
  type: "refresh";
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
};
