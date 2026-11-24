import type { ReactNode } from "react";
import "./academy-v2.css";
import { TrackingProvider } from "@/features/academy/components/TrackingProvider";
import { AdMeasurement } from "@/features/ad-consent/components/AdMeasurement";
import { cn } from "@/lib/utils";
import { AcademyFloatingElements } from "./AcademyFloatingElements";
import { AcademyFooter } from "./AcademyFooter";
import { AcademyNavbar } from "./AcademyNavbar";
import { ClassTypesSection } from "./ClassTypesSection";
import { ContactSection } from "./ContactSection";
import { DemoBookingSection } from "./DemoBookingSection";
import { FaqSection } from "./FaqSection";
import { HeroSection } from "./HeroSection";
import { ProgramsSection } from "./ProgramsSection";
import { SessionTimingSection } from "./SessionTimingSection";
import { StatsSection } from "./StatsSection";
import { SundayTrainingSection } from "./SundayTrainingSection";
import { TestimonialsSection } from "./TestimonialsSection";
import { WhyChooseUsSection } from "./WhyChooseUsSection";

/** The Design System v2 academy home page, served at `/`. */
export function AcademyHomeV2({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={cn("academy-v2 relative", className)}>
      {children}
      <TrackingProvider />
      <AdMeasurement />
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
