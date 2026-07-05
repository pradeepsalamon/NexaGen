import { NextResponse, type NextRequest } from "next/server";

const accessTokenCookieName = "nexagen_access_token";

export function middleware(request: NextRequest) {
  const hasAccessToken = Boolean(
    request.cookies.get(accessTokenCookieName)?.value
  );

  if (!hasAccessToken) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/super-admin/:path*", "/admin/trash/:path*"]
};
