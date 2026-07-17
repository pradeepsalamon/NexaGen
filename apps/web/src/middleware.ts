import { NextResponse, type NextRequest } from "next/server";

const accessTokenCookieName = "nexa_access_token";

export function middleware(request: NextRequest) {
  const hasAccessToken = Boolean(
    request.cookies.get(accessTokenCookieName)?.value
  );

  if (!hasAccessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    loginUrl.searchParams.set("reason", "unauthorized");
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"]
};
