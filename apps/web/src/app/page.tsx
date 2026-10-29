import type { Metadata } from "next";
import "@/features/academy/styles/academy.css";
import { ScrollObserver } from "@/features/academy/components/ScrollObserver";
import { TrackingProvider } from "@/features/academy/components/TrackingProvider";
import { ACADEMY_NAME } from "@/features/academy/content";
import { academyJsonLd, jsonLdScript } from "@/lib/structuredData";
import { declareFontVariables } from "./fonts";
import { ACADEMY_FONT_FACES } from "@/features/academy/fonts.generated";
import { AcademyNavbar } from "@/features/academy/components/AcademyNavbar";
import { HeroSection } from "@/features/academy/components/HeroSection";
import { ProgramsSection } from "@/features/academy/components/ProgramsSection";
import { ClassTypesSection } from "@/features/academy/components/ClassTypesSection";
import { SessionTimingSection } from "@/features/academy/components/SessionTimingSection";
import { SundayTrainingSection } from "@/features/academy/components/SundayTrainingSection";
import { WhyChooseUsSection } from "@/features/academy/components/WhyChooseUsSection";
import { DemoBookingSection } from "@/features/academy/components/DemoBookingSection";
import { TestimonialsSection } from "@/features/academy/components/TestimonialsSection";
import { StatsSection } from "@/features/academy/components/StatsSection";
import { ContactSection } from "@/features/academy/components/ContactSection";
import { FaqSection } from "@/features/academy/components/FaqSection";
import { AcademyFooter } from "@/features/academy/components/AcademyFooter";
import { AcademyFloatingElements } from "@/features/academy/components/AcademyFloatingElements";

const academyFontVariablesCss = declareFontVariables(".academy-page", ACADEMY_FONT_FACES);

const TITLE = `Online Chess Classes for Kids & Adults | ${ACADEMY_NAME}`;
const DESCRIPTION =
  "Live online chess classes with FIDE-rated coaches: beginner to advanced, 1-on-1, buddy or group, plus Sunday tournament training. Book a free demo class.";

export const metadata: Metadata = {
  title: { absolute: TITLE, template: `%s | ${ACADEMY_NAME}` },
  description: DESCRIPTION,
  applicationName: ACADEMY_NAME,
  keywords: [
    "online chess classes",
    "chess academy",
    "chess coaching online",
    "chess classes for kids",
    "learn chess online",
    "chess coach India",
    "FIDE rated chess coach",
    "chess tournament preparation",
    "free chess demo class",
    "Nexa Chess",
    "Nexa Chess Academy"
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: ACADEMY_NAME,
    type: "website",
    locale: "en_IN",
    url: "/"
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION
  },
  alternates: { canonical: "/" },
  category: "education"
};

export default function Home() {
  return (
    <div className="academy-page relative font-[family-name:var(--font-inter)]">
      <style dangerouslySetInnerHTML={{ __html: academyFontVariablesCss }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(academyJsonLd()) }}
      />
      <TrackingProvider />
      <ScrollObserver />
      <main className="relative">
        <AcademyNavbar />
        <HeroSection />
        <div className="cv-auto">
          <ProgramsSection />
        </div>
        <div className="cv-auto">
          <ClassTypesSection />
        </div>
        <div className="cv-auto">
          <SessionTimingSection />
        </div>
        <div className="cv-auto">
          <SundayTrainingSection />
        </div>
        <div className="cv-auto">
          <WhyChooseUsSection />
        </div>
        <div className="cv-auto">
          <DemoBookingSection />
        </div>
        <div className="cv-auto">
          <TestimonialsSection />
        </div>
        <div className="cv-auto">
          <StatsSection />
        </div>
        <div className="cv-auto">
          <FaqSection />
        </div>
        <div className="cv-auto">
          <ContactSection />
        </div>
        <AcademyFooter />
        <AcademyFloatingElements />
      </main>
    </div>
  );
}
