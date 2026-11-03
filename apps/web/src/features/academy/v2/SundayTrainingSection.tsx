import Image from "next/image";
import { ArrowRight, Award, GraduationCap, type LucideIcon, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CheckItem, Section, SectionHeader } from "./parts";

const COLOSSEUM_BG_LIGHT = "/sunday/01_day_chess_colosseum.webp";
const COLOSSEUM_BG_DARK = "/sunday/02_night_chess_colosseum.webp";

const tournamentStats: { Icon: LucideIcon; label: string; value: string }[] = [
  { Icon: Users, label: "Weekly players", value: "50+" },
  { Icon: Trophy, label: "Tournaments hosted", value: "75+" },
  { Icon: Award, label: "Expert coaches", value: "45+" },
  { Icon: GraduationCap, label: "Students trained", value: "100+" }
];

const highlights = [
  "Tournament simulation",
  "Grandmaster game analysis",
  "Rapid tactics sparring",
  "Competitive rating prep"
];

export function SundayTrainingSection() {
  return (
    <Section id="sunday-training" labelledBy="sunday-heading" tone="surface">
      <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="order-2 grid gap-8 lg:order-1">
          <SectionHeader
            align="left"
            description="Students practice tournament skills, analyze games and prepare for competitive play in live supervised arena battles and master-reviewed matches."
            eyebrow="Weekend special"
            id="sunday-heading"
            title="Sunday tournament training"
          />
          <ul className="grid gap-3 sm:grid-cols-2">
            {highlights.map((item) => (
              <CheckItem key={item}>{item}</CheckItem>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-3">
            {tournamentStats.map(({ Icon, label, value }) => (
              <li className="flex items-center gap-3 rounded-app border border-app-border bg-app-background p-4" key={label}>
                <span className="flex size-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent-ink">
                  <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
                </span>
                <span className="grid min-w-0">
                  <span className="text-2xl font-extrabold leading-tight text-app-text tabular-nums">{value}</span>
                  <span className="text-sm text-app-muted">{label}</span>
                </span>
              </li>
            ))}
          </ul>
          <div>
            <Button asChild size="lg">
              <a href="#demo">
                Join Sunday training
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
              </a>
            </Button>
          </div>
        </div>

        <div
          aria-hidden="true"
          className="relative order-1 aspect-[4/3] overflow-hidden rounded-panel border border-app-border bg-app-soft shadow-card lg:order-2"
        >
          <Image
            alt=""
            className="object-cover object-[85%_center] dark:hidden"
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            src={COLOSSEUM_BG_LIGHT}
          />
          <Image
            alt=""
            className="hidden object-cover object-[85%_center] dark:block"
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            src={COLOSSEUM_BG_DARK}
          />
        </div>
      </div>
    </Section>
  );
}
