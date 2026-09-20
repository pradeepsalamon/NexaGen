"use client";

import type { ReactNode } from "react";
import { ArrowRight, Check, User, Users } from "lucide-react";

type IconComponent = (props: { className?: string; strokeWidth?: number }) => ReactNode;

/* Three-person group icon (lucide's set tops out at two) drawn in the same
   stroke style as the rest of the icon set. */
function GroupThreeIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 20.3c.3-2.5 2.1-4.6 4.4-5.4" />
      <circle cx="5.5" cy="8.8" r="2.2" />
      <path d="M21.5 20.3c-.3-2.5-2.1-4.6-4.4-5.4" />
      <circle cx="18.5" cy="8.8" r="2.2" />
      <path d="M7 21v-1.3a5 4.3 0 0 1 10 0V21" />
      <circle cx="12" cy="8" r="3.1" />
    </svg>
  );
}

const classTypes: {
  title: string;
  Icon: IconComponent;
  description: string;
  features: string[];
  accent: string;
  accentBg: string;
}[] = [
  {
    title: "Individual Classes",
    Icon: User,
    description: "Personalized one-on-one coaching tailored to your learning pace",
    features: ["One-on-one coaching", "Personalized attention", "Flexible timing", "Custom curriculum"],
    accent: "from-blue-500 to-cyan-500",
    accentBg: "from-blue-500/10 to-cyan-500/5"
  },
  {
    title: "Buddy Combo Classes",
    Icon: Users,
    description: "Learn together with friends in an interactive and fun environment",
    features: ["Learn with friends", "Interactive training", "Fun & competitive", "Peer motivation"],
    accent: "from-gold to-gold-light",
    accentBg: "from-gold/10 to-gold-light/5"
  },
  {
    title: "Group Classes",
    Icon: GroupThreeIcon,
    description: "Collaborative learning with affordable coaching and team activities",
    features: ["Collaborative learning", "Affordable coaching", "Team activities", "Social development"],
    accent: "from-purple-500 to-pink-500",
    accentBg: "from-purple-500/10 to-pink-500/5"
  }
];

export function ClassTypesSection() {
  return (
    <section id="class-types" className="relative py-24 sm:py-32">
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-16 reveal reveal-up" style={{ transitionDelay: "0s" }}>
          <span className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            Class Types
          </span>
          <h2 className="section-title font-[family-name:var(--font-playfair)] mb-4">
            Flexible <span className="gold-text">Learning</span> Options
          </h2>
          <p className="section-sub">Choose the format that works best for you</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {classTypes.map((cls, i) => (
            <div
              key={cls.title}
              className="group relative reveal reveal-up h-full"
              style={{ transitionDelay: `${0.2 + i * 0.15}s` }}
            >
              <div className="relative u-card hover:border-gold/20 card-lift h-full flex flex-col">
                <div
                  className={`h-1 bg-gradient-to-r ${cls.accent} opacity-50 group-hover:opacity-100 transition-opacity duration-500`}
                />

                <div
                  className={`absolute inset-0 bg-gradient-to-br ${cls.accentBg} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}
                />

                <div className="relative p-6 sm:p-8 flex flex-col flex-grow">
                  <span className="icon-tile icon-tile-lg mb-5">
                    <cls.Icon className="w-6 h-6" strokeWidth={1.75} />
                  </span>

                  <h3 className="text-xl font-bold font-[family-name:var(--font-playfair)] tracking-[-0.01em] mb-2 text-text-primary">
                    {cls.title}
                  </h3>
                  <p className="text-sm text-text-secondary mb-6 leading-relaxed">{cls.description}</p>

                  <ul className="space-y-3 mb-6">
                    {cls.features.map((f) => (
                      <li key={f} className="flex items-center gap-3 text-sm text-text-secondary">
                        <span className="check-dot">
                          <Check className="w-3 h-3" strokeWidth={3} />
                        </span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <a
                    href="#demo"
                    className="mt-auto inline-flex items-center justify-center gap-2 py-3 rounded-xl border border-[#e2e8f0] hover:border-gold/30 text-sm font-semibold text-text-secondary hover:text-gold transition-all duration-300 hover:bg-gold/5 hover:scale-[1.03] active:scale-95"
                  >
                    Learn More
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
