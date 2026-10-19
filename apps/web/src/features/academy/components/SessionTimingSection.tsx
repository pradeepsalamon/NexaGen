"use client";

import { useEffect, useState, useRef } from "react";
import { Brain, BookOpen, Puzzle, Trophy, CalendarDays, Zap, Repeat } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const timelineItems: { time: string; label: string; Icon: LucideIcon }[] = [
  { time: "0-10 min", label: "Warm-up & Review", Icon: Brain },
  { time: "10-25 min", label: "Core Lesson & Theory", Icon: BookOpen },
  { time: "25-40 min", label: "Practice & Puzzles", Icon: Puzzle },
  { time: "40-55 min", label: "Game Play & Analysis", Icon: Trophy }
];

const extraInfo: { label: string; Icon: LucideIcon; tint: string; hoverBorder: string; hoverWash: string }[] = [
  {
    label: "Weekly Learning",
    Icon: CalendarDays,
    tint: "text-blue-600 bg-blue-500/10 border-blue-500/25",
    hoverBorder: "hover:border-blue-500/30",
    hoverWash: "from-blue-500/10 to-cyan-500/5"
  },
  {
    label: "Interactive",
    Icon: Zap,
    tint: "text-amber-600 bg-amber-500/10 border-amber-500/25",
    hoverBorder: "hover:border-amber-500/30",
    hoverWash: "from-amber-500/10 to-gold/5"
  },
  {
    label: "Regular Practice",
    Icon: Repeat,
    tint: "text-emerald-600 bg-emerald-500/10 border-emerald-500/25",
    hoverBorder: "hover:border-emerald-500/30",
    hoverWash: "from-emerald-500/10 to-emerald-600/5"
  }
];

export function SessionTimingSection() {
  const [count, setCount] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.6 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const end = 55;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(end);
      return;
    }
    let startTime: number;
    const duration = 2000;
    let req: number;

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp;
      const progress = timestamp - startTime;

      const easeOut = 1 - Math.pow(1 - Math.min(progress / duration, 1), 4);
      const current = Math.min(Math.floor(easeOut * end), end);

      setCount(current);

      if (progress < duration) {
        req = requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    req = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(req);
  }, [isVisible]);

  return (
    <section ref={sectionRef} className="relative py-24 sm:py-32 overflow-hidden">
      <div className="absolute inset-0 chess-pattern opacity-15" />
      <div className="absolute inset-0 mesh-soft" />
      <div className="absolute top-0 left-0 right-0 hairline" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="section-head mb-16 reveal reveal-up" style={{ transitionDelay: "0s" }}>
          <span className="eyebrow mb-5">
            <span className="eyebrow-dot" />
            Session Structure
          </span>
          <h2 className="section-title font-[family-name:var(--font-playfair)] mb-4">
            Every Session:{" "}
            <span className="gold-text font-[family-name:var(--font-inter)] tabular-nums">45 - 55 Minutes</span>
          </h2>
          <p className="section-sub">Structured, focused, and interactive — every minute counts</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex justify-center reveal reveal-scale" style={{ transitionDelay: "0.2s" }}>
            <div className="relative w-64 h-64 sm:w-80 sm:h-80">
              <div className="absolute -inset-8 rounded-full bg-[#1a3a52]/[0.05] blur-3xl" />

              <div className="absolute inset-0 rounded-full border-2 border-[#1a3a52]/20" />
              <div className="absolute inset-2 rounded-full border border-[#e2e8f0]" />

              <div
                className="absolute inset-0 rounded-full animate-rotate-slow"
                style={{
                  background: "conic-gradient(from 0deg, transparent 0%, rgba(26,58,82,0.22) 75%, transparent 100%)"
                }}
              />

              <div className="absolute inset-0">
                {Array.from({ length: 12 }).map((_, i) => {
                  const isQuarter = i % 3 === 0;
                  const pieces = ["♔", "♕", "♖", "♘"];
                  return (
                    <div
                      key={i}
                      className="absolute inset-0 flex justify-center items-start"
                      style={{ transform: `rotate(${i * 30}deg)` }}
                    >
                      {isQuarter ? (
                        <div
                          className="text-[#1a3a52]/80 text-xl sm:text-2xl leading-none mt-1 sm:mt-2"
                          style={{ transform: `rotate(-${i * 30}deg)` }}
                        >
                          {pieces[i / 3]}
                        </div>
                      ) : (
                        <div className="w-0.5 h-3 rounded-full bg-[#1a3a52]/30 mt-1 sm:mt-2" />
                      )}
                    </div>
                  );
                })}
              </div>

              <div
                className="absolute top-1/2 left-1/2 w-0.5 sm:w-1 bg-[#1a3a52]/35 rounded-full z-10"
                style={{
                  height: "42%",
                  transformOrigin: "bottom center",
                  transform: `translate(-50%, -100%) rotate(${isVisible ? 330 : 0}deg)`,
                  transition: "transform 2s cubic-bezier(0.25, 1, 0.5, 1) 0.3s"
                }}
              />

              <div className="absolute inset-0 flex items-center justify-center z-20">
                <div className="text-center glass-strong rounded-full w-40 h-40 sm:w-48 sm:h-48 flex flex-col items-center justify-center relative shadow-[0_18px_40px_-20px_rgba(15,31,47,0.45)]">
                  <div className="text-5xl sm:text-6xl font-bold gold-text font-[family-name:var(--font-playfair)] tabular-nums">
                    {count}
                  </div>
                  <div className="text-xs text-text-secondary uppercase tracking-[0.2em] mt-1.5 font-medium">
                    Minutes
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {timelineItems.map((item, i) => (
              <div
                key={item.label}
                className="group flex items-start gap-5 reveal reveal-up"
                style={{ transitionDelay: `${0.3 + i * 0.15}s` }}
              >
                <div className="relative flex flex-col items-center">
                  <span className="icon-tile">
                    <item.Icon className="w-5 h-5" strokeWidth={1.75} />
                  </span>
                  {i < timelineItems.length - 1 && (
                    <div className="w-px h-6 bg-gradient-to-b from-[#1a3a52]/25 to-transparent mt-2" />
                  )}
                </div>

                <div className="pt-1">
                  <div className="text-[0.6875rem] text-[#b8912e] font-semibold uppercase tracking-[0.14em] mb-1">
                    {item.time}
                  </div>
                  <div className="text-lg font-semibold text-text-primary group-hover:text-gold transition-colors duration-300">
                    {item.label}
                  </div>
                </div>
              </div>
            ))}

            <div className="grid grid-cols-3 gap-3 mt-8 reveal reveal-up" style={{ transitionDelay: "0.8s" }}>
              {extraInfo.map((item) => (
                <div
                  key={item.label}
                  className={`group/pill relative overflow-hidden text-center px-2 py-4 rounded-xl glass border border-[#e2e8f0] ${item.hoverBorder} card-lift transition-colors duration-300`}
                >
                  <div
                    className={`absolute inset-0 bg-gradient-to-br ${item.hoverWash} opacity-0 group-hover/pill:opacity-100 transition-opacity duration-500`}
                  />
                  <div className="relative flex flex-col items-center gap-2">
                    <span
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border ${item.tint} transition-transform duration-300 group-hover/pill:scale-110`}
                    >
                      <item.Icon className="w-4 h-4" strokeWidth={1.75} />
                    </span>
                    <span className="text-xs font-medium text-text-secondary">{item.label}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
