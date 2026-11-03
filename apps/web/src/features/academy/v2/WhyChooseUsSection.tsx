import { ArrowRight, BookOpen, GraduationCap, type LucideIcon, TrendingUp, Trophy, Users, Video } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Section, SectionHeader } from "./parts";

const features: { description: string; Icon: LucideIcon; title: string }[] = [
  {
    description:
      "Learn from titled Grandmasters and certified FIDE coaches with decades of competitive and mentoring experience.",
    Icon: GraduationCap,
    title: "Expert coaching"
  },
  {
    description:
      "Step-by-step progressive curriculum designed from beginner fundamentals to elite tournament mastery.",
    Icon: BookOpen,
    title: "Structured curriculum"
  },
  {
    description:
      "Regular Sunday tournaments, arena matches, and rated practice sessions to test and sharpen your game.",
    Icon: Trophy,
    title: "Tournaments and competitions"
  },
  {
    description:
      "Engaging, real-time interactive chess training on collaborative boards with live video and instant coach feedback.",
    Icon: Video,
    title: "Interactive live classes"
  },
  {
    description:
      "Comprehensive performance analytics, rating progress reports, and tactical mistake assessments after every session.",
    Icon: TrendingUp,
    title: "Progress tracking"
  },
  {
    description:
      "Join an inspiring global network of students, parents, and coaches driven by a shared passion for chess excellence.",
    Icon: Users,
    title: "Supportive community"
  }
];

export function WhyChooseUsSection() {
  return (
    <Section id="why-choose-us" labelledBy="why-heading">
      <SectionHeader
        description="Discover why thousands of students and parents choose our structured coaching methodology."
        eyebrow="Academy advantages"
        id="why-heading"
        title="Why Nexa Chess Academy?"
      />

      <ul className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ description, Icon, title }) => (
          <li className="grid content-start gap-3 rounded-app border border-app-border bg-app-surface p-6 shadow-card" key={title}>
            <span className="flex size-11 items-center justify-center rounded-control bg-primary-soft text-primary-ink">
              <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
            </span>
            <h3 className="text-lg font-bold text-app-text">{title}</h3>
            <p className="text-sm text-app-muted">{description}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10 flex justify-center">
        <Button asChild size="lg">
          <a href="#demo">
            Book a free class
            <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
          </a>
        </Button>
      </div>
    </Section>
  );
}
