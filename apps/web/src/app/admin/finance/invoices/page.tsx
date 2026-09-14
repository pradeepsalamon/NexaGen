import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminFinanceClient } from "@/features/invoices/components/AdminFinanceClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Invoices - Admin",
};

export default function Page() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <AdminFinanceClient />;
}
