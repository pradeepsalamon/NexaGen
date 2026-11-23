import type { Metadata } from "next";
import { AdMeasurement } from "@/features/ad-consent/components/AdMeasurement";
import { AcademyLegalText } from "@/features/legal/components/AcademyLegalText";
import { LegalPage } from "@/features/legal/components/LegalPage";
import { LEGAL_DRAFT, TERMS_SECTIONS } from "@/features/legal/content";
import { pageTitle } from "@/lib/pageTitles";

export const metadata: Metadata = {
  alternates: { canonical: "/terms" },
  description: "The terms for using Nexa Chess Academy's classes and platform.",
  robots: LEGAL_DRAFT ? { follow: true, index: false } : undefined,
  title: pageTitle("/terms")
};

export default function TermsPage() {
  return (
    <AcademyLegalText kind="terms">
      <LegalPage
        intro="The terms for taking classes with Nexa Chess Academy and using its platform."
        other={{ href: "/privacy", label: "Privacy policy" }}
        sections={TERMS_SECTIONS}
        title="Terms of service"
      />
      <AdMeasurement />
    </AcademyLegalText>
  );
}
