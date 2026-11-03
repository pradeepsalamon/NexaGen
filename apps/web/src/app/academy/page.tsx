import type { Metadata } from "next";
import "@/features/academy/v2/academy-v2.css";
import { TrackingProvider } from "@/features/academy/components/TrackingProvider";
import { ACADEMY_NAME } from "@/features/academy/content";
import { AcademyFloatingElements } from "@/features/academy/v2/AcademyFloatingElements";
import { AcademyFooter } from "@/features/academy/v2/AcademyFooter";
import { AcademyNavbar } from "@/features/academy/v2/AcademyNavbar";
import { ClassTypesSection } from "@/features/academy/v2/ClassTypesSection";
import { ContactSection } from "@/features/academy/v2/ContactSection";
import { DemoBookingSection } from "@/features/academy/v2/DemoBookingSection";
import { FaqSection } from "@/features/academy/v2/FaqSection";
import { HeroSection } from "@/features/academy/v2/HeroSection";
import { ProgramsSection } from "@/features/academy/v2/ProgramsSection";
import { SessionTimingSection } from "@/features/academy/v2/SessionTimingSection";
import { StatsSection } from "@/features/academy/v2/StatsSection";
import { SundayTrainingSection } from "@/features/academy/v2/SundayTrainingSection";
import { TestimonialsSection } from "@/features/academy/v2/TestimonialsSection";
import { WhyChooseUsSection } from "@/features/academy/v2/WhyChooseUsSection";

/**
 * The Design System v2 rebuild of the home page (`/`), kept beside it for review.
 * Same content and form, so it is not indexed and points search engines at `/`;
 * the JSON-LD stays on `/` only.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description:
    "Live online chess classes with FIDE-rated coaches: beginner to advanced, 1-on-1, buddy or group, plus Sunday tournament training. Book a free demo class.",
  robots: { follow: true, index: false },
  title: { absolute: `Online Chess Classes for Kids & Adults | ${ACADEMY_NAME}` }
};

export default function AcademyPage() {
  return (
    <div className="academy-v2 relative">
      <TrackingProvider />
      <AcademyNavbar />
      <main className="relative">
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
      </main>
      <AcademyFooter />
      <AcademyFloatingElements />
    </div>
  );
}
