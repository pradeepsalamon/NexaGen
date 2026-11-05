import { NextResponse, type NextRequest } from "next/server";
import { isPlatformHost, usesHostOnlySession } from "./lib/apiBase";
import {
  AUTH_COOKIES,
  canAccessPath,
  HOST_ONLY_AUTH_COOKIES,
  getRoleDashboardHref,
  isProtectedPath,
  readRoleFromJwt
} from "./lib/routeAccess";

// The single page-level auth gate: pages and layouts do not re-check cookies.
// Rules live in lib/routeAccess.ts (shared with the client guard in SessionBootstrap).
export function middleware(request: NextRequest) {
  // An academy's own address reads only its host-only cookies: Nexa's domain-wide ones also
  // reach `<slug>.nexachess.in`, and the API refuses them there (lib/apiBase.ts, §E).
  // Nexa's own hosts with host-only sessions on (lib/apiBase.ts) still read the old
  // domain-wide cookies until the API swaps them at the next refresh.
  const hostname = request.nextUrl.hostname;
  const readsLegacy = isPlatformHost(hostname);
  const names = usesHostOnlySession(hostname) ? HOST_ONLY_AUTH_COOKIES : AUTH_COOKIES;
  const cookie = (key: keyof typeof AUTH_COOKIES) =>
    request.cookies.get(names[key])?.value || (readsLegacy ? request.cookies.get(AUTH_COOKIES[key])?.value : undefined);
  const accessToken = cookie("accessToken");
  const hasSession = Boolean(accessToken) || Boolean(cookie("refreshToken"));
  // An expired access token still names the role; a refresh-only session has none,
  // so it passes here and SessionBootstrap redirects once /auth/me resolves.
  const role = readRoleFromJwt(accessToken);
  const { pathname } = request.nextUrl;

  if (pathname === "/login" || pathname === "/signup") {
    return hasSession
      ? NextResponse.redirect(new URL(getRoleDashboardHref(role ?? "STUDENT"), request.url))
      : NextResponse.next();
  }

  if (isProtectedPath(pathname)) {
    if (!hasSession) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("reason", "unauthorized");
      return NextResponse.redirect(loginUrl);
    }
    if (role && !canAccessPath(pathname, role)) {
      return NextResponse.redirect(new URL(getRoleDashboardHref(role), request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/coach/:path*",
    "/sales/:path*",
    "/student/:path*",
    "/checkout/:path*",
    "/classes/:path*",
    "/chess-board",
    "/games/:path*",
    "/help/:path*",
    "/messages/:path*",
    "/plans",
    "/profile",
    "/login",
    "/signup"
  ]
};
