import { ForgotPasswordForm } from "@/features/auth/components/ForgotPasswordForm";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/forgot-password") };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
