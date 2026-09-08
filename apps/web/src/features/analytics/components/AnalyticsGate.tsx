import { cookies } from "next/headers";
import { redirect } from "next/navigation";

/**
 * Server-side cookie presence check for an admin analytics page. Real
 * authorization is enforced by the API (admin-only); this just avoids rendering
 * a shell for a signed-out visitor. Call at the top of every analytics page.
 */
export function assertAnalyticsCookie() {
  const hasAccessToken = Boolean(cookies().get("nexa_access_token")?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);
  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }
}
