"use client";

import {
  CalendarCheck,
  LineChart,
  MessageCircle,
  Puzzle,
  Swords,
  Trophy,
  Video,
  Vote,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Video, title: "Live classes on a shared board", text: "Learn in real time as your coach moves pieces on the same board." },
  { icon: Puzzle, title: "Puzzles and assignments", text: "Practice between classes with puzzles set by your coach." },
  { icon: Trophy, title: "Class puzzle leaderboards", text: "Race classmates to solve the puzzle your coach shares mid-class." },
  { icon: Vote, title: "\"What would you play?\"", text: "Answer your coach's move questions privately and compare ideas." },
  { icon: Swords, title: "Simul games with your coach", text: "Play your coach directly while they take on the whole class." },
  { icon: LineChart, title: "Progress you can see", text: "Puzzle rating, streaks and attendance for students and parents." },
  { icon: MessageCircle, title: "Private chat with your coach", text: "Ask a question during class without interrupting everyone." },
  { icon: CalendarCheck, title: "Classes on a clear schedule", text: "Class reminders so nobody misses a lesson." }
];

const INTERVAL_MS = 4000;

export function HeroFeatureCarousel() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setActive((i) => (i + 1) % FEATURES.length), INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused]);

  const { icon: Icon, title, text } = FEATURES[active];

  return (
    <div
      aria-roledescription="carousel"
      aria-label="Platform features"
      className="grid gap-4"
      onBlur={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        aria-roledescription="slide"
        aria-label={`${active + 1} of ${FEATURES.length}`}
        className="flex min-h-[5.5rem] items-start gap-4 rounded-app border border-white/20 bg-white/10 p-4 motion-safe:animate-fade-in"
        key={active}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-white/15">
          <Icon aria-hidden="true" className="size-5" strokeWidth={2.5} />
        </span>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-white/75">{text}</p>
        </div>
      </div>
      <div className="flex items-center justify-center">
        {FEATURES.map((feature, index) => (
          <button
            aria-current={index === active ? "true" : undefined}
            aria-label={`Show feature ${index + 1}: ${feature.title}`}
            className="group flex h-6 min-w-6 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            key={feature.title}
            onClick={() => setActive(index)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-2 rounded-full transition-[width,background-color]",
                index === active ? "w-6 bg-white" : "w-2 bg-white/35 group-hover:bg-white/60"
              )}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
