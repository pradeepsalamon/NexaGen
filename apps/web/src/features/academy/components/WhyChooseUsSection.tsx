import Image from "next/image";
import {
  GraduationCap,
  BookOpen,
  Trophy,
  Video,
  TrendingUp,
  Users,
  ArrowRight,
  type LucideIcon
} from "lucide-react";

const BG_LIGHT = "/academy_advantage/01_cinematic_chess_light.webp";
const BG_DARK = "/academy_advantage/02_cinematic_chess_shadow.webp";

interface AdvantageItem {
  number: string;
  Icon: LucideIcon;
  title: string;
  description: string;
  featured?: boolean;
}

const features: AdvantageItem[] = [
  {
    number: "01",
    Icon: GraduationCap,
    title: "Expert Coaching",
    description:
      "Learn from titled Grandmasters and certified FIDE coaches with decades of competitive and mentoring experience.",
    featured: false
  },
  {
    number: "02",
    Icon: BookOpen,
    title: "Structured Curriculum",
    description:
      "Step-by-step progressive curriculum designed from beginner fundamentals to elite tournament mastery.",
    featured: true
  },
  {
    number: "03",
    Icon: Trophy,
    title: "Tournaments & Competitions",
    description:
      "Regular Sunday tournaments, arena matches, and rated practice sessions to test and sharpen your game.",
    featured: false
  },
  {
    number: "04",
    Icon: Video,
    title: "Interactive Live Classes",
    description:
      "Engaging, real-time interactive chess training on collaborative boards with live video and instant coach feedback.",
    featured: false
  },
  {
    number: "05",
    Icon: TrendingUp,
    title: "Progress Tracking",
    description:
      "Comprehensive performance analytics, rating progress reports, and tactical mistake assessments after every session.",
    featured: false
  },
  {
    number: "06",
    Icon: Users,
    title: "Supportive Community",
    description:
      "Join an inspiring global network of students, parents, and coaches driven by a shared passion for chess excellence.",
    featured: false
  }
];

export function WhyChooseUsSection() {

  return (
    <section
      id="why-choose-us"
      className="relative py-16 sm:py-24 overflow-hidden select-none transition-colors duration-300 bg-app-background text-app-text"
    >
      {/* ================= FULL-BLEED BACKGROUND ARTWORK ================= */}
      <div
        className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        aria-hidden="true"
      >
        {/* Light Mode Background (01_cinematic_chess_light.jpg) */}
        <Image
          src={BG_LIGHT}
          alt="Why Nexa Chess Academy Light Background"
          fill
          sizes="100vw"
          className="object-cover object-center dark:hidden"
        />

        {/* Dark Mode Background (02_cinematic_chess_shadow.jpg) */}
        <Image
          src={BG_DARK}
          alt="Why Nexa Chess Academy Dark Background"
          fill
          sizes="100vw"
          className="object-cover object-center hidden dark:block"
        />

        {/* Subtle Top & Bottom Section Edge Blends */}
        <div
          className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-app-surface/85 to-transparent"
        />
        <div
          className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-app-surface/85 to-transparent"
        />
      </div>

      {/* ================= FOREGROUND CONTENT ================= */}
      {/* Max-width 1080px keeps the 6 cards framed between the Left Knight & Right King */}
      <div className="relative z-10 max-w-[1080px] mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          {/* Pill Eyebrow: [• ACADEMY ADVANTAGES] */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[11px] sm:text-xs font-bold uppercase tracking-[0.18em] mb-4 shadow-2xs backdrop-blur-md bg-app-surface/90 border-app-border text-app-text"
          >
            <span className="size-2 rounded-full bg-accent" />
            <span>ACADEMY ADVANTAGES</span>
          </div>

          {/* Two-Tone Serif Heading */}
          <h2 className="font-[family-name:var(--font-playfair)] font-bold text-3xl sm:text-4xl lg:text-[46px] leading-[1.14] tracking-[-0.02em] mb-3.5">
            <span className="text-app-text">
              Why{" "}
            </span>
            <span className="text-accent-ink">
              Nexa Chess{" "}
            </span>
            <span
              className="block sm:inline text-app-text"
            >
              Academy?
            </span>
          </h2>

          {/* Subtitle */}
          <p
            className="text-xs sm:text-base lg:text-[16px] leading-relaxed max-w-[500px] mx-auto text-app-muted"
          >
            Discover why thousands of students and parents choose our structured
            coaching methodology.
          </p>
        </div>

        {/* ================= 6 ADVANTAGE CARDS GRID (3x2 on Desktop) ================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 items-stretch">
          {features.map((item) => {
            const Icon = item.Icon;
            const isFeatured = Boolean(item.featured);

            const cardSurfaceClass = isFeatured
              ? "bg-accent-soft/95 border-accent ring-1 ring-accent/35 shadow-[0_16px_40px_-10px_rgb(var(--rgb-accent)/0.2)]"
              : "bg-app-surface/95 border-app-border hover:border-accent/60 shadow-[0_12px_34px_-10px_rgb(var(--rgb-brand-800)/0.08)]";

            const numberBadgeClass = isFeatured
              ? "bg-accent-soft text-accent-ink border-accent/45"
              : "bg-app-soft text-app-subtle border-app-border";

            const iconBadgeClass = isFeatured
              ? "bg-accent-soft text-app-text border-accent/45"
              : "bg-app-background text-app-text border-app-border";

            return (
              <div
                key={item.title}
                className={`group relative rounded-[22px] border backdrop-blur-xl p-5 sm:p-6 lg:px-6 lg:py-7 transition-all duration-300 hover:-translate-y-1 flex flex-row lg:flex-col items-start lg:items-center text-left lg:text-center gap-4 lg:gap-0 ${cardSurfaceClass}`}
              >
                {/* Left (Mobile) / Top Centered (Desktop): Number Badge (01–06) + Icon Badge */}
                <div className="flex items-center gap-2.5 lg:gap-3.5 shrink-0 lg:mb-5 mt-0.5 lg:mt-0">
                  <span
                    className={`size-9 sm:size-11 rounded-full border flex items-center justify-center font-[family-name:var(--font-playfair)] font-bold text-xs sm:text-sm ${numberBadgeClass}`}
                  >
                    {item.number}
                  </span>

                  <span
                    className={`size-10 sm:size-12 rounded-2xl border flex items-center justify-center transition-transform duration-200 group-hover:scale-105 ${iconBadgeClass}`}
                  >
                    <Icon className="size-5 sm:size-6" strokeWidth={1.9} />
                  </span>
                </div>

                {/* Right (Mobile) / Bottom Centered (Desktop): Title, Description & Learn More */}
                <div className="flex flex-col flex-1 lg:items-center min-w-0">
                  <h3
                    className="font-[family-name:var(--font-playfair)] font-bold text-lg sm:text-xl leading-snug mb-1.5 sm:mb-2 text-app-text"
                  >
                    {item.title}
                  </h3>

                  <p
                    className="text-xs sm:text-[13.5px] leading-relaxed mb-4 lg:mb-5 flex-1 text-app-muted"
                  >
                    {item.description}
                  </p>

                  {/* Learn More Link */}
                  <a
                    href="#demo"
                    className={`inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-bold transition-colors mt-auto ${isFeatured
                        ? "text-accent-ink hover:text-accent-ink"
                        : "text-app-text hover:text-accent-ink"
                      }`}
                  >
                    <span>Learn More</span>
                    <ArrowRight className="size-3.5 stroke-[2.4] transition-transform duration-200 group-hover:translate-x-1" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}