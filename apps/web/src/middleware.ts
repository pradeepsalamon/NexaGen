import { NextResponse, type NextRequest } from "next/server";

const accessTokenCookieName = "nexa_access_token";
const refreshTokenCookieName = "nexa_refresh_token";

export function middleware(request: NextRequest) {
  const token = request.cookies.get(accessTokenCookieName)?.value;
  const hasAccessToken = Boolean(token);
  const hasRefreshToken = Boolean(
    request.cookies.get(refreshTokenCookieName)?.value
  );

  const { pathname } = request.nextUrl;
  const isAuthRoute = pathname === "/login" || pathname === "/signup";
  const isProtectedRoute = pathname.startsWith("/admin") || pathname.startsWith("/coach") || pathname.startsWith("/student");

  if (isProtectedRoute && !hasAccessToken && !hasRefreshToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("reason", "unauthorized");
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthRoute && (hasAccessToken || hasRefreshToken)) {
    let dashboardPath = "/student";

    if (token) {
      try {
        const base64Url = token.split('.')[1];
        if (base64Url) {
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = atob(base64);
          const payload = JSON.parse(jsonPayload);
          if (payload.role === "SUPER_ADMIN" || payload.role === "ADMIN") {
            dashboardPath = "/admin";
          } else if (payload.role === "COACH") {
            dashboardPath = "/coach";
          }
        }
      } catch (e) {
        // Ignore decoding errors and fallback to /student
      }
    }

    return NextResponse.redirect(new URL(dashboardPath, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/coach/:path*",
    "/student/:path*",
    "/login",
    "/signup"
  ]
};