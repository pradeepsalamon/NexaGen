"use client";

import { useRef, useState, useEffect } from "react";
import { Users, Award, BookOpen, Trophy } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useIsVisible } from "../hooks/useIsVisible";

const stats: { value: number; suffix: string; label: string; Icon: LucideIcon }[] = [
  { value: 5000, suffix: "+", label: "Active Students", Icon: Users },
  { value: 100, suffix: "+", label: "Expert Coaches", Icon: Award },
  { value: 15000, suffix: "+", label: "Classes Completed", Icon: BookOpen },
  { value: 4500, suffix: "+", label: "Tournaments Played", Icon: Trophy }
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
    const duration = 2000;
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
    <span className="text-[26px] sm:text-4xl lg:text-[44px] font-bold text-[var(--text-primary)] font-[family-name:var(--font-playfair)] tabular-nums leading-none tracking-tight">
      {count >= 1000 ? `${Math.floor(count / 1000)},${String(count % 1000).padStart(3, "0")}` : count}
      <span className="text-[#EAB308] ml-0.5">{suffix}</span>
    </span>
  );
}

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useIsVisible(ref);

  return (
    <section className="relative py-12 sm:py-16 lg:py-24 bg-[var(--surface-secondary)] border-y border-[var(--border)]">
      <div className="relative max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8" ref={ref}>

        {/* Main Container Card */}
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-[20px] sm:rounded-[24px] overflow-hidden shadow-sm">

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`
                  relative flex flex-row md:flex-col items-center md:justify-center 
                  p-5 sm:p-8 lg:p-10
                  ${index !== stats.length - 1 ? 'border-b md:border-b-0 md:border-r border-[var(--border)]' : ''}
                `}
              >
                {/* Mobile-only layout (Horizontal) */}
                <div className="flex items-center w-full md:hidden">
                  <div className="size-12 shrink-0 rounded-[12px] bg-[#FEF9C3] dark:bg-[#1E293B] text-[#CA8A04] dark:text-[#EAB308] flex items-center justify-center">
                    <stat.Icon className="size-6" strokeWidth={1.8} />
                  </div>

                  <div className="w-px h-10 bg-[var(--border)] mx-4"></div>

                  <div className="flex flex-col">
                    <Counter target={stat.value} suffix={stat.suffix} isInView={isInView} />
                    <div className="text-[10px] sm:text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.08em] mt-1.5">
                      {stat.label}
                    </div>
                  </div>
                </div>

                {/* Desktop-only layout (Vertical) */}
                <div className="hidden md:flex flex-col items-center text-center w-full">
                  <div className="size-14 rounded-[14px] bg-[#FEF9C3] dark:bg-[#1E293B] text-[#CA8A04] dark:text-[#EAB308] flex items-center justify-center mb-6">
                    <stat.Icon className="size-7" strokeWidth={1.8} />
                  </div>

                  <div className="flex flex-col items-center">
                    <Counter target={stat.value} suffix={stat.suffix} isInView={isInView} />
                    <div className="text-[11px] lg:text-[12px] font-bold text-[var(--text-secondary)] uppercase tracking-[0.1em] mt-3">
                      {stat.label}
                    </div>
                  </div>
                </div>

              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}