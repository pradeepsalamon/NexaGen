import { GraduationCap, Target, Trophy, Laptop, CalendarDays, Handshake } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const features: { Icon: LucideIcon; title: string; description: string }[] = [
  {
    Icon: GraduationCap,
    title: "Expert Chess Coaches",
    description: "FIDE-rated professionals with years of teaching and tournament experience"
  },
  {
    Icon: Target,
    title: "Personalized Guidance",
    description: "Custom learning paths tailored to each student's strengths and goals"
  },
  {
    Icon: Trophy,
    title: "Tournament Preparation",
    description: "Comprehensive preparation for national and international chess tournaments"
  },
  {
    Icon: Laptop,
    title: "Interactive Online Classes",
    description: "Engaging live sessions with real-time interaction and digital tools"
  },
  {
    Icon: CalendarDays,
    title: "Flexible Scheduling",
    description: "Choose class times that work for your schedule, including weekends"
  },
  {
    Icon: Handshake,
    title: "Friendly Environment",
    description: "Supportive and encouraging atmosphere that makes learning enjoyable"
  }
];

export function WhyChooseUsSection() {
  return (
    <section id="why-choose-us" className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 chess-pattern opacity-15" />
      <div className="absolute inset-0 mesh-soft" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-16 reveal reveal-up" style={{ transitionDelay: "0s" }}>
          <span className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            Why Choose Us
          </span>
          <h2 className="section-title font-[family-name:var(--font-playfair)] mb-4">
            Why <span className="gold-text">Nexa Chess</span> Academy?
          </h2>
          <p className="section-sub">
            Discover what makes our academy the preferred choice for chess excellence
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, i) => (
            <div
              key={feature.title}
              className="group relative u-card p-6 sm:p-8 hover:border-gold/20 card-lift reveal reveal-up"
              style={{ transitionDelay: `${0.1 + i * 0.1}s` }}
            >
              <div className="absolute inset-0 rounded-[1.25rem] bg-gradient-to-br from-gold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

              <div className="relative">
                <span className="icon-tile icon-tile-lg mb-5">
                  <feature.Icon className="w-6 h-6" strokeWidth={1.75} />
                </span>
                <br />
                <h3 className="text-lg font-bold font-[family-name:var(--font-playfair)] tracking-[-0.01em] mb-2 text-text-primary group-hover:text-gold transition-colors duration-300">
                  {feature.title}
                </h3>
                <p className="text-sm text-text-secondary leading-relaxed">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
