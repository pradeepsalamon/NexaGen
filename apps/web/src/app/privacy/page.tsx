import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/components/LegalPage";
import { LEGAL_DRAFT, PRIVACY_SECTIONS } from "@/features/legal/content";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description: "What Nexa Chess Academy collects about students, parents and coaches, and how it is used and protected.",
  robots: LEGAL_DRAFT ? { follow: true, index: false } : undefined,
  title: "Privacy Policy"
};

export default function PrivacyPage() {
  return (
    <LegalPage
      intro="What we collect about students, parents and coaches, who we share it with, and the choices you have."
      other={{ href: "/terms", label: "Terms of Service" }}
      sections={PRIVACY_SECTIONS}
      title="Privacy Policy"
    />
  );
}
