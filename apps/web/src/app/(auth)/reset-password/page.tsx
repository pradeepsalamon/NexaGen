import { ResetPasswordForm } from "@/features/auth/components/ResetPasswordForm";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/reset-password") };

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
