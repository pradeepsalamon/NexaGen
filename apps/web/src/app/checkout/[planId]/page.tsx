import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CheckoutClient } from "@/features/payments/components/CheckoutClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Checkout - NexaChess",
};

export default function Page({ params }: { params: { planId: string } }) {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <CheckoutClient planId={params.planId} />;
}
