import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CoachFeedbackClient } from "@/features/feedback/components/CoachFeedbackClient";

const accessTokenCookieName = "nexa_access_token";

export default function CoachFeedbackPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <CoachFeedbackClient />;
}
