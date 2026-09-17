import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminPayrollClient } from "@/features/payroll/components/AdminPayrollClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Coach Payroll - Admin",
};

export default function Page() {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <AdminPayrollClient />;
}
