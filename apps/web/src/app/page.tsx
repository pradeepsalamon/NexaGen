import type { Metadata } from "next";
import {
  CalendarCheck,
  GraduationCap,
  ShieldCheck,
  Trophy
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { HeroActions } from "@/components/home/HeroActions";
import { SITE_NAME, SITE_URL } from "@/lib/site";

const HOME_TITLE = `${SITE_NAME} | Build better chess habits`;
const HOME_DESCRIPTION =
  "A focused learning workspace for chess students, families, and coaches, designed around practice, progress, and consistent class routines.";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description: HOME_DESCRIPTION,
  openGraph: {
    description: HOME_DESCRIPTION,
    images: [{ alt: SITE_NAME, url: "/academy/nexa_logo_light1.png" }],
    title: HOME_TITLE,
    url: "/"
  },
  title: { absolute: HOME_TITLE }
};

// Lets Google show "Nexa Chess" as the site name and pick up the logo.
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@id": `${SITE_URL}/#website`,
      "@type": "WebSite",
      alternateName: ["NexaChess", "Nexa Chess Academy", "nexachess.in"],
      name: SITE_NAME,
      publisher: { "@id": `${SITE_URL}/#organization` },
      url: `${SITE_URL}/`
    },
    {
      "@id": `${SITE_URL}/#organization`,
      "@type": "EducationalOrganization",
      email: "nexachessacademy@gmail.com",
      logo: `${SITE_URL}/academy/nexa_logo_light1.png`,
      name: SITE_NAME,
      telephone: "+91-7010854643",
      url: `${SITE_URL}/`
    }
  ]
};

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
      <script dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} type="application/ld+json" />
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
