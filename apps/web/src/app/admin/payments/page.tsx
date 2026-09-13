import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PaymentsAdminClient } from "@/features/payments/components/PaymentsAdminClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Payments - Admin",
};

export default function Page() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <PaymentsAdminClient />;
}
