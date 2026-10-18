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

export default function AcademyPage() {
  return (
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
  );
}
