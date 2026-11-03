import { Award, BookOpen, type LucideIcon, Trophy, Users } from "lucide-react";
import { CountUp } from "./parts";

const stats: { Icon: LucideIcon; label: string; value: string }[] = [
  { Icon: Users, label: "Active students", value: "5,000+" },
  { Icon: Award, label: "Expert coaches", value: "100+" },
  { Icon: BookOpen, label: "Classes completed", value: "15,000+" },
  { Icon: Trophy, label: "Tournaments played", value: "4,500+" }
];

/** A navy band of the headline numbers, between the testimonials and the FAQ. */
export function StatsSection() {
  return (
    <section aria-label="Nexa Chess in numbers" className="surface-brand bg-app-background py-14 text-app-text sm:py-16">
      <ul className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
        {stats.map(({ Icon, label, value }, idx) => (
          <li className="grid justify-items-center gap-2 text-center" key={label}>
            <Icon aria-hidden="true" className="size-6 text-accent-ink" strokeWidth={2.25} />
            <span className="text-4xl font-extrabold leading-none tracking-tight sm:text-5xl">
              <CountUp delay={idx * 120} value={value} />
            </span>
            <span className="text-sm text-app-muted">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
