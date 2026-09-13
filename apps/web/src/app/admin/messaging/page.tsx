import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MessagingClient } from "@/features/messaging/components/MessagingClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Messages - Admin",
};

export default function AdminMessagingPage() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <MessagingClient />;
}
