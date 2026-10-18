import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
  title: pageTitle("/login")
};

export default function LoginPage() {
  return <LoginForm />;
}
