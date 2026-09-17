import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminPayrollPeriodDetailClient } from "@/features/payroll/components/AdminPayrollPeriodDetailClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Payroll Period - Admin",
};

export default function Page({ params }: { params: { id: string } }) {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <AdminPayrollPeriodDetailClient periodId={params.id} />;
}
