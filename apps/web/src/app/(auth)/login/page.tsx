import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/frame/AuthFrame";
import { LoginCard } from "@/features/auth/frame/LoginCard";
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
