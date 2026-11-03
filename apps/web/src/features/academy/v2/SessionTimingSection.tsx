"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, type LucideIcon, MessageSquare, Puzzle, Target, Video } from "lucide-react";
import { Section, SectionHeader } from "./parts";

const sessionElements: { description: string; Icon: LucideIcon; title: string }[] = [
  {
    description: "Two-way live video and interactive digital chessboard with your coach.",
    Icon: Video,
    title: "Interactive live class"
  },
  {
    description: "Tactical drills, rapid puzzle sprints, and practical sparring matches.",
    Icon: Puzzle,
    title: "Solve puzzles and play games"
  },
  {
    description: "Immediate feedback on blunder patterns, positional blunders, and strategic plans.",
    Icon: MessageSquare,
    title: "Discuss with your coach"
  },
  {
    description: "Direct homework challenges, opening repertoire reviews, and tournament readiness.",
    Icon: Target,
    title: "Practise and apply it in real games"
  }
];

const featureChips: { Icon: LucideIcon; label: string }[] = [
  { Icon: Video, label: "Live classes" },
  { Icon: Puzzle, label: "Practice" },
  { Icon: BarChart3, label: "Progress tracking" }
];

const TARGET_MINUTES = 55;
const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Counts 0 → 55 and fills the ring the first time it scrolls into view. */
function useSessionDial() {
  const ref = useRef<HTMLDivElement>(null);
  const [minutes, setMinutes] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMinutes(TARGET_MINUTES);
      return;
    }
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / 2200, 1);
          setMinutes(Math.round((1 - Math.pow(1 - progress, 3)) * TARGET_MINUTES));
          if (progress < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.35 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return { minutes, ref };
}

export function SessionTimingSection() {
  const { minutes, ref } = useSessionDial();

  return (
    <Section id="session-blueprint" labelledBy="session-heading">
      <SectionHeader
        description="Interactive, hands-on, and focused on real game results."
        eyebrow="Session blueprint"
        id="session-heading"
        title="Every session: 45–55 minutes"
      />

      <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
        <div className="flex flex-col items-center gap-6 lg:col-span-5">
          <div className="relative flex size-56 items-center justify-center sm:size-64" ref={ref}>
            <svg aria-hidden="true" className="absolute inset-0 -rotate-90" viewBox="0 0 200 200">
              <circle className="text-app-border" cx="100" cy="100" fill="none" r={RADIUS} stroke="currentColor" strokeWidth="10" />
              <circle
                className="text-primary"
                cx="100"
                cy="100"
                fill="none"
                r={RADIUS}
                stroke="currentColor"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - minutes / 60)}
                strokeLinecap="round"
                strokeWidth="10"
              />
            </svg>
            <p className="grid text-center">
              <span className="text-6xl font-extrabold leading-none tracking-tight text-app-text tabular-nums">
                <span aria-hidden="true">{minutes}</span>
                <span className="sr-only">Up to 55</span>
              </span>
              <span className="mt-2 text-sm font-medium text-app-muted">minutes</span>
            </p>
          </div>
          <ul className="flex flex-wrap justify-center gap-2">
            {featureChips.map(({ Icon, label }) => (
              <li
                className="inline-flex items-center gap-1.5 rounded-full border border-app-border bg-app-surface px-3 py-1 text-sm font-medium text-app-text"
                key={label}
              >
                <Icon aria-hidden="true" className="size-4 text-primary-ink" strokeWidth={2.25} />
                {label}
              </li>
            ))}
          </ul>
        </div>

        <ol className="grid gap-4 lg:col-span-7">
          {sessionElements.map(({ description, Icon, title }, index) => (
            <li
              className="flex items-start gap-4 rounded-app border border-app-border bg-app-surface p-5 shadow-card"
              key={title}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-primary-soft text-primary-ink">
                <Icon aria-hidden="true" className="size-5" strokeWidth={2.25} />
              </span>
              <div className="grid gap-1">
                <h3 className="text-base font-bold text-app-text">
                  <span className="mr-1.5 text-app-muted tabular-nums">{index + 1}.</span>
                  {title}
                </h3>
                <p className="text-sm text-app-muted">{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}
