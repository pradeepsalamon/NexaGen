import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/login-v2/AuthFrame";
import { LoginCard } from "@/features/auth/login-v2/LoginCard";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
  title: pageTitle("/login")
};

export default function LoginPage() {
  return (
    <AuthCard>
      <LoginCard />
    </AuthCard>
  );
}
