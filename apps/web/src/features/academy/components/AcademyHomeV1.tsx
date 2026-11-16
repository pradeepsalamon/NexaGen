import "@/features/academy/styles/academy.css";
import { declareFontVariables } from "@/app/fonts";
import { ACADEMY_FONT_FACES } from "@/features/academy/fonts.generated";
import { AcademyFloatingElements } from "./AcademyFloatingElements";
import { AcademyFooter } from "./AcademyFooter";
import { AcademyNavbar } from "./AcademyNavbar";
import { ClassTypesSection } from "./ClassTypesSection";
import { ContactSection } from "./ContactSection";
import { DemoBookingSection } from "./DemoBookingSection";
import { FaqSection } from "./FaqSection";
import { HeroSection } from "./HeroSection";
import { ProgramsSection } from "./ProgramsSection";
import { ScrollObserver } from "./ScrollObserver";
import { SessionTimingSection } from "./SessionTimingSection";
import { StatsSection } from "./StatsSection";
import { SundayTrainingSection } from "./SundayTrainingSection";
import { TestimonialsSection } from "./TestimonialsSection";
import { TrackingProvider } from "./TrackingProvider";
import { WhyChooseUsSection } from "./WhyChooseUsSection";

const academyFontVariablesCss = declareFontVariables(".academy-page", ACADEMY_FONT_FACES);

/**
 * The original academy home page, now served at `/academy` (owner, 2026-11-16:
 * the Design System v2 page took over `/`). Kept whole; routes stay thin.
 */
export function AcademyHomeV1() {
  return (
    <div className="academy-page relative font-[family-name:var(--font-inter)]">
      <style dangerouslySetInnerHTML={{ __html: academyFontVariablesCss }} />
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
