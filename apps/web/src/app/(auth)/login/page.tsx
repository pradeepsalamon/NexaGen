import type { Metadata } from "next";
import { LoginPageV2 } from "@/features/auth/login-v2/LoginPageV2";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
  title: pageTitle("/login")
};

export default function LoginPage() {
  return <LoginPageV2 />;
}
