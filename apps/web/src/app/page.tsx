import {
  CalendarCheck,
  GraduationCap,
  ShieldCheck,
  Trophy
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { HeroActions } from "@/components/home/HeroActions";

const highlights = [
  {
    icon: GraduationCap,
    label: "Structured learning",
    value: "Guided paths for students from first tactics to tournament prep."
  },
  {
    icon: CalendarCheck,
    label: "Class planning",
    value: "Keep coaching sessions, practice tasks, and parent follow-ups aligned."
  },
  {
    icon: ShieldCheck,
    label: "Role-ready platform",
    value: "Built for students, coaches, admins, and super admins."
  }
];

export default function Home() {
  return (
    <main className="min-h-[calc(100vh-4rem)] overflow-hidden">
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-6xl animate-fade-in content-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(360px,0.7fr)] lg:items-center lg:px-8">
        <div className="grid gap-8">
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-extrabold uppercase text-primary-ink">
              Nexa Chess Academy
            </p>
            <h1 className="max-w-[12ch] text-[clamp(3rem,9vw,5.8rem)] font-extrabold leading-[0.92] text-app-text">
              Build better chess habits.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-app-muted sm:text-lg">
              A focused learning workspace for chess students, families, and
              coaches, designed around practice, progress, and consistent class
              routines.
            </p>
            <HeroActions />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {highlights.map((item) => {
              const Icon = item.icon;

              return (
                <article
                  className="rounded-app border border-app-border bg-app-surface/85 p-4 shadow-card"
                  key={item.label}
                >
                  <Icon
                    aria-hidden="true"
                    className="mb-4 size-5 text-primary-ink"
                    strokeWidth={2.5}
                  />
                  <h2 className="text-sm font-extrabold text-app-text">
                    {item.label}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-app-muted">
                    {item.value}
                  </p>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="rounded-panel border border-app-border bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-primary)_18%,var(--color-surface)),color-mix(in_srgb,var(--color-accent)_22%,var(--color-surface)))] p-5 shadow-soft">
          <div className="rounded-app border border-app-border bg-app-surface/90 p-5">
            <Logo size={80} stacked />
            <div className="mt-8 grid gap-4">
              <div className="flex items-center justify-between rounded-app bg-app-soft p-4">
                <span className="text-sm font-bold text-app-muted">
                  Weekly classes
                </span>
                <span className="text-2xl font-extrabold text-app-text">
                  24
                </span>
              </div>
              <div className="flex items-center justify-between rounded-app bg-app-soft p-4">
                <span className="text-sm font-bold text-app-muted">
                  Practice goals
                </span>
                <span className="text-2xl font-extrabold text-app-text">
                  128
                </span>
              </div>
              <div className="rounded-app bg-primary p-4 text-white">
                <div className="flex items-center gap-3">
                  <Trophy aria-hidden="true" className="size-5" />
                  <span className="text-sm font-extrabold">
                    Progress dashboard ready
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/80">
                  Track learning activity, student profiles, and class outcomes
                  from one workspace.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}
