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
// 55 minutes on a 60-minute face = 330 degrees.
const TARGET_ANGLE = (TARGET_MINUTES / 60) * 360;

const pieceIconProps = {
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 1.6,
  viewBox: "0 0 24 24"
} as const;

// Outlined pieces at 12, 3, 6 and 9 o'clock.
function KingIcon({ className }: { className?: string }) {
  return (
    <svg {...pieceIconProps} aria-hidden="true" className={className}>
      <path d="M12 2v3M10.5 3.5h3" />
      <path d="M8 9c0-2.2 1.8-4 4-4s4 1.8 4 4l-1 7H9L8 9Z" />
      <path d="M7 16h10v2.5H7zM6 21h12" />
    </svg>
  );
}

function QueenIcon({ className }: { className?: string }) {
  return (
    <svg {...pieceIconProps} aria-hidden="true" className={className}>
      <circle cx="5" cy="6" r="1" />
      <circle cx="9.5" cy="4.5" r="1" />
      <circle cx="14.5" cy="4.5" r="1" />
      <circle cx="19" cy="6" r="1" />
      <path d="M5.5 7 8 15h8l2.5-8-3.5 3.5L12 5.5 9 10.5 5.5 7Z" />
      <path d="M7 15h10v2.5H7zM6 20h12" />
    </svg>
  );
}

function RookIcon({ className }: { className?: string }) {
  return (
    <svg {...pieceIconProps} aria-hidden="true" className={className}>
      <path d="M7 4v3h2V4h2v3h2V4h2v3h2V4" />
      <path d="M7 7h10l-1 9H8L7 7Z" />
      <path d="M6.5 16h11v2.5h-11zM5.5 21h13" />
    </svg>
  );
}

function KnightIcon({ className }: { className?: string }) {
  return (
    <svg {...pieceIconProps} aria-hidden="true" className={className}>
      <path d="M15.5 4.5c-1.5 0-3 .8-4 2L8 10l1.5 2 2.5-1.2c.3 1.8-1 3.7-2.5 5.2H16c.8-3 1.2-6.5-.5-9.5V4.5Z" />
      <path d="M7 16h10v2.5H7zM6 21h12" />
    </svg>
  );
}

/** Counts 0 → 55 and sweeps the needle the first time the dial scrolls into view. */
function useSessionDial() {
  const ref = useRef<HTMLDivElement>(null);
  const [minutes, setMinutes] = useState(0);
  const [angle, setAngle] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMinutes(TARGET_MINUTES);
      setAngle(TARGET_ANGLE);
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
          const eased = 1 - Math.pow(1 - progress, 3);
          setMinutes(Math.round(eased * TARGET_MINUTES));
          setAngle(eased * TARGET_ANGLE);
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

  return { angle, minutes, ref };
}

export function SessionTimingSection() {
  const { angle, minutes, ref } = useSessionDial();

  return (
    <Section
      id="session-blueprint"
      labelledBy="session-heading"
    >
      <SectionHeader
        description="Interactive, hands-on, and focused on real game results."
        eyebrow="Session blueprint"
        id="session-heading"
        title="Every session: 45–55 minutes"
      />

      <div className="mt-12 grid grid-cols-1 items-center gap-10 lg:grid-cols-12">
        <div className="flex flex-col items-center gap-6 lg:col-span-5">
          <div className="relative size-72 sm:size-80" ref={ref}>
            <svg aria-hidden="true" className="absolute inset-0 size-full" viewBox="0 0 200 200">
              <circle className="fill-app-soft stroke-app-border" cx="100" cy="100" r="98" strokeWidth="1.5" />
              {Array.from({ length: 60 }, (_, i) => {
                const major = i % 5 === 0;
                return (
                  <line
                    className={major ? "stroke-app-muted" : "stroke-app-border"}
                    key={i}
                    strokeLinecap="round"
                    strokeWidth={major ? 2 : 1}
                    transform={`rotate(${i * 6} 100 100)`}
                    x1="100"
                    x2="100"
                    y1="4.5"
                    y2={major ? 11 : 8}
                  />
                );
              })}
              <circle className="stroke-app-border" cx="100" cy="100" r="88" fill="none" strokeWidth="5" />
              <circle
                className="stroke-accent"
                cx="100"
                cy="100"
                fill="none"
                pathLength={360}
                r="88"
                strokeDasharray={`${angle} 360`}
                strokeLinecap="round"
                strokeWidth="5"
                transform="rotate(-90 100 100)"
              />
              <g transform={`rotate(${angle} 100 100)`}>
                <circle className="fill-app-surface stroke-accent" cx="100" cy="12" r="6" strokeWidth="3" />
              </g>
            </svg>
            {[
              { Icon: KingIcon, pos: "left-1/2 top-[15%] -translate-x-1/2" },
              { Icon: QueenIcon, pos: "right-[15%] top-1/2 -translate-y-1/2" },
              { Icon: RookIcon, pos: "bottom-[15%] left-1/2 -translate-x-1/2" },
              { Icon: KnightIcon, pos: "left-[15%] top-1/2 -translate-y-1/2" }
            ].map(({ Icon, pos }, i) => (
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute flex size-9 items-center justify-center rounded-full border border-app-border bg-app-surface text-primary-ink shadow-card ${pos}`}
                key={i}
              >
                <Icon className="size-5" />
              </span>
            ))}
            <p className="absolute left-1/2 top-1/2 z-20 grid size-[50%] -translate-x-1/2 -translate-y-1/2 place-content-center rounded-full border border-app-border bg-app-surface text-center shadow-card">
              <span className="text-5xl font-extrabold leading-none tracking-tight text-primary-ink tabular-nums sm:text-6xl">
                <span aria-hidden="true">{minutes}</span>
                <span className="sr-only">Up to 55</span>
              </span>
              <span className="mt-2 text-xs font-semibold uppercase tracking-[0.26em] text-app-muted">minutes</span>
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
