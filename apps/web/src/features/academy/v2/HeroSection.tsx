import Image from "next/image";
import { ArrowRight, Calendar, ClipboardList, GraduationCap, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CountUp } from "./parts";

const HERO_BG_LIGHT = "/academy/hero_light.webp";
const HERO_BG_DARK = "/academy/hero_dark.webp";

const heroStats = [
  { Icon: Users, label: "Active students", value: "5,000+" },
  { Icon: GraduationCap, label: "Expert coaches", value: "100+" },
  { Icon: ClipboardList, label: "Classes completed", value: "15,000+" },
  { Icon: Trophy, label: "Tournaments played", value: "4,500+" }
];

export function HeroSection() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative flex flex-col overflow-hidden bg-app-surface pt-16 lg:min-h-[min(100dvh,52rem)]"
      id="home"
    >
      {/* Artwork on the right; the text column sits on a solid fade, never on the photo. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Image
          alt=""
          className="object-cover object-[72%_bottom] dark:hidden lg:object-[center_bottom]"
          fill
          priority
          sizes="100vw"
          src={HERO_BG_LIGHT}
        />
        <Image
          alt=""
          className="hidden object-cover object-[72%_bottom] dark:block lg:object-[center_bottom]"
          fetchPriority="high"
          fill
          sizes="100vw"
          src={HERO_BG_DARK}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-app-surface via-app-surface/90 to-app-surface/30 lg:bg-gradient-to-r lg:from-app-surface lg:via-app-surface/80 lg:to-transparent" />
      </div>

      <div className="relative mx-auto flex w-full max-w-7xl flex-1 flex-col justify-between gap-10 px-4 pb-6 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-8">
        <div className="my-auto max-w-xl">
          <p className="text-sm font-semibold text-primary-ink">Learn · compete · grow</p>
          <h1
            className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-app-text sm:text-5xl lg:text-6xl"
            id="hero-heading"
          >
            Nexa Chess with expert coaching
          </h1>
          <p className="mt-4 text-base text-app-muted sm:text-lg">
            Join thousands of students and develop your chess skills with expert coaching, structured
            programs, live classes, and a global community.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="#demo">
                <Calendar aria-hidden="true" className="size-4" strokeWidth={2.25} />
                Book a free class
              </a>
            </Button>
            <Button asChild size="lg" variant="neutral">
              <a href="#programs">
                Explore programs
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
              </a>
            </Button>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {heroStats.map(({ Icon, label, value }, idx) => (
            <li
              className="flex flex-col items-start gap-3 rounded-app border border-app-border bg-app-surface p-4 shadow-card sm:flex-row sm:items-center"
              key={label}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
                <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
              </span>
              <span className="grid min-w-0">
                <span className="text-2xl font-extrabold leading-tight text-app-text">
                  <CountUp delay={idx * 120} value={value} />
                </span>
                <span className="text-sm text-app-muted">{label}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
