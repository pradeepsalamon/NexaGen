import type { Metadata } from "next";
import { EmailAdminClient } from "@/features/email-admin/components/EmailAdminClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  description: "Control email verification and write to people directly.",
  title: pageTitle("/admin/email")
};

export default function AdminEmailPage() {
  return <EmailAdminClient />;
}
