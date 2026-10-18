export const AUTH_COOKIE_NAMES = {
  accessToken: "nexa_access_token",
  refreshToken: "nexa_refresh_token"
} as const;

export const AUTH_COOKIE_PATHS = {
  accessToken: "/",
  refreshToken: "/"
} as const;

export type AuthCookieName =
  (typeof AUTH_COOKIE_NAMES)[keyof typeof AUTH_COOKIE_NAMES];

export type AuthCookieOptions = {
  httpOnly: true;
  maxAge: number;
  path: string;
  sameSite: "lax" | "strict" | "none";
  secure: boolean;
};
