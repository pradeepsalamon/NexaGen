import { AuthLayout } from "@/features/auth/components/AuthLayout";
import { AuthFrame } from "@/features/auth/login-v2/AuthFrame";

/** One frame for every auth page: navigating between them swaps only the card. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthFrame>
      <AuthLayout>{children}</AuthLayout>
    </AuthFrame>
  );
}
