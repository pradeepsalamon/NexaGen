import type { Metadata } from "next";
import { AuthSplitShell } from "@/features/auth/components/AuthSplitShell";
import { LoginCard } from "@/features/auth/login-v2/LoginCard";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
  title: pageTitle("/login")
};

export default function LoginPage() {
  return (
    <AuthSplitShell variant="login">
      <LoginCard />
    </AuthSplitShell>
  );
}
