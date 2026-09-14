import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminInvoiceDetailClient } from "@/features/invoices/components/AdminInvoiceDetailClient";

const accessTokenCookieName = "nexa_access_token";

export const metadata = {
  title: "Invoice - Admin",
};

export default function Page({ params }: { params: { id: string } }) {
  const hasAccessToken = Boolean(cookies().get(accessTokenCookieName)?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

  return <AdminInvoiceDetailClient invoiceId={params.id} />;
}
