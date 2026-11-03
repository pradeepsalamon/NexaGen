"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Section heading: a small sentence-case eyebrow, the `h2` and one line under it. */
export function SectionHeader({
  align = "center",
  description,
  eyebrow,
  id,
  title
}: {
  align?: "center" | "left";
  description?: ReactNode;
  eyebrow: string;
  id?: string;
  title: ReactNode;
}) {
  return (
    <div className={cn("grid gap-3", align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl")}>
      <p className="text-sm font-semibold text-primary-ink">{eyebrow}</p>
      <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-app-text sm:text-4xl" id={id}>
        {title}
      </h2>
      {description ? <p className="text-base text-app-muted sm:text-lg">{description}</p> : null}
    </div>
  );
}

/** One line of a feature list with a small success tick. */
export function CheckItem({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-sm text-app-text">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-ink">
        <Check aria-hidden="true" className="size-3" strokeWidth={3} />
      </span>
      <span>{children}</span>
    </li>
  );
}

/** A section's outer frame: one content width and vertical rhythm for the whole page. */
export function Section({
  children,
  className,
  id,
  labelledBy,
  tone = "background"
}: {
  children: ReactNode;
  className?: string;
  id: string;
  labelledBy?: string;
  tone?: "background" | "surface";
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        "scroll-mt-16 py-16 sm:py-20 lg:py-24",
        tone === "surface" ? "bg-app-surface" : "bg-app-background",
        className
      )}
      id={id}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
    </section>
  );
}

/** "15000" → "15,000": the same grouping the stat strings use, whatever the browser locale. */
function groupThousands(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function parseStat(value: string) {
  const match = value.match(/^(\D*)([\d,]+)(.*)$/);
  if (!match) return { prefix: "", suffix: value, target: 0, valid: false };
  return { prefix: match[1], suffix: match[3], target: parseInt(match[2].replace(/,/g, ""), 10), valid: true };
}

/** Counts up to a stat such as "5,000+" the first time it scrolls into view; the "+" stays put. */
export function CountUp({ value, delay = 0, duration = 2200 }: { value: string; delay?: number; duration?: number }) {
  const { prefix, suffix, target, valid } = parseStat(value);
  const ref = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!valid) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCurrent(target);
      return;
    }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let timeout = 0;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setCurrent(Math.round(target * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          timeout = window.setTimeout(run, delay);
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [target, duration, delay, valid]);

  if (!valid) return <>{value}</>;

  return (
    <span className="relative inline-block tabular-nums" ref={ref}>
      {/* The final value reserves the width, so nothing shifts while counting. */}
      <span aria-hidden="true" className="invisible">
        {value}
      </span>
      <span aria-hidden="true" className="absolute left-0 top-0">
        {prefix}
        {groupThousands(current)}
        {suffix}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
