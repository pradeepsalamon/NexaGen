"use client";

import { useRef, useState, useEffect } from "react";
import { GraduationCap, Trophy, Clock, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsVisible } from "../hooks/useIsVisible";

const stats: { value: number; suffix: string; label: string; Icon: LucideIcon }[] = [
  { value: 5000, suffix: "+", label: "Students Trained", Icon: GraduationCap },
  { value: 100, suffix: "+", label: "Tournament Winners", Icon: Trophy },
  { value: 15000, suffix: "+", label: "Coaching Hours", Icon: Clock },
  { value: 4500, suffix: "+", label: "Positive Reviews", Icon: Star }
];

function Counter({ target, suffix, isInView }: { target: number; suffix: string; isInView: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isInView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(target);
      return;
    }
    let start = 0;
    const duration = 2500;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [isInView, target]);

  return (
    <span className="text-4xl sm:text-5xl font-bold gold-text-bright font-[family-name:var(--font-playfair)] tabular-nums">
      {count >= 1000 ? `${Math.floor(count / 1000)},${String(count % 1000).padStart(3, "0")}` : count}
      {suffix}
    </span>
  );
}

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useIsVisible(ref);

  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-r from-white via-[#f8fafc] to-white" />
      <div className="absolute inset-0 chess-pattern opacity-10" />
      <div className="absolute top-0 left-0 right-0 hairline" />
      <div className="absolute bottom-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-y-10 gap-x-6 sm:gap-8">
          {stats.map((stat, i) => (
            <div key={stat.label} className="text-center group reveal reveal-up" style={{ transitionDelay: `${i * 0.15}s` }}>
              <div className="flex justify-center mb-4">
                <span className="icon-tile icon-tile-lg">
                  <stat.Icon className="w-6 h-6" strokeWidth={1.75} />
                </span>
              </div>
              <Counter target={stat.value} suffix={stat.suffix} isInView={isInView} />
              <div className="text-[0.6875rem] sm:text-xs text-text-muted mt-2.5 uppercase tracking-[0.14em] font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
