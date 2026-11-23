import type { Metadata } from "next";
import { AdConsentSettingsButton } from "@/features/ad-consent/components/AdConsentSettingsButton";
import { AdMeasurement } from "@/features/ad-consent/components/AdMeasurement";
import { AcademyLegalText } from "@/features/legal/components/AcademyLegalText";
import { LegalPage } from "@/features/legal/components/LegalPage";
import { LEGAL_DRAFT, PRIVACY_SECTIONS } from "@/features/legal/content";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  alternates: { canonical: "/privacy" },
  description: "What Nexa Chess Academy collects about students, parents and coaches, and how it is used and protected.",
  robots: LEGAL_DRAFT ? { follow: true, index: false } : undefined,
  title: pageTitle("/privacy")
};

export default function PrivacyPage() {
  return (
    <AcademyLegalText kind="privacy">
      <LegalPage
        intro="What we collect about students, parents and coaches, who we share it with, and the choices you have."
        other={{ href: "/terms", label: "Terms of service" }}
        sections={PRIVACY_SECTIONS}
        title="Privacy policy"
      />
      <div className="mx-auto flex max-w-3xl justify-end px-4 pb-10 sm:px-6">
        <AdConsentSettingsButton />
      </div>
      <AdMeasurement />
    </AcademyLegalText>
  );
}
