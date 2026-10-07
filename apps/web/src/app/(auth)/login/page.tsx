import type { Metadata } from "next";
import { LoginForm } from "@/features/auth/components/LoginForm";

export const metadata: Metadata = {
  alternates: { canonical: "/login" },
  title: "Log in | Nexa Chess"
};

export default function LoginPage() {
  return <LoginForm />;
}
