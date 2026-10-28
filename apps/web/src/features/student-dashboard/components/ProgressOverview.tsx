"use client";

import { GraduationCap, BookOpen, Target, type LucideIcon } from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";

interface ProgressMetric {
  label: string;
  value: string;
  trend?: string;
}

interface ProgressOverviewProps {
  metrics?: ProgressMetric[];
}

const DEFAULT_METRICS: ProgressMetric[] = [
  { label: "Classes Attended", value: "0" },
  { label: "Lessons Completed", value: "0" },
  { label: "Attendance", value: "0%" }
];

function MetricArtwork({
  label,
  isDark
}: {
  label: string;
  isDark: boolean;
}) {
  if (label === "Classes Attended") {
    return (
      <svg
        viewBox="0 0 110 96"
        fill="none"
        className={`pointer-events-none absolute right-1.5 sm:right-3 bottom-1 w-14 sm:w-28 h-12 sm:h-24 select-none opacity-65 sm:opacity-100 ${isDark ? "text-[#172B52]" : "text-[#F7E6C4]"
          }`}
        aria-hidden="true"
      >
        <path
          d="M36 26c-5 0-9 2-12 5l-5-2-2 6-10 7c-2 1.5-2.5 4-1 6l3 4c1 1.5 3.5 2 5.5 1l6-3c1 3 0 6.5-2.5 9.5L14 68h26c1.5-8 3.5-17 3.5-26 0-9-4-16-7.5-16z"
          fill="currentColor"
          opacity="0.55"
        />
        <path d="M72 8h5v6h6v5h-6v5h-5v-5h-6v-5h6V8z" fill="currentColor" />
        <path
          d="M57 27h35l-4 11H61l-4-11zm5 14h25l3 29H59l3-29zm-6 32h37v5H56v-5zm-3 7h43c1.5 0 3 1.2 3 2.8V86H50v-3.2c0-1.6 1.5-2.8 3-2.8z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (label === "Lessons Completed") {
    return (
      <svg
        viewBox="0 0 110 90"
        fill="none"
        className={`pointer-events-none absolute right-1.5 sm:right-3 bottom-1.5 w-14 sm:w-28 h-12 sm:h-22 select-none opacity-65 sm:opacity-100 ${isDark ? "text-[#15284E]" : "text-[#F9E3DA]"
          }`}
        aria-hidden="true"
      >
        <path
          d="M55 24c-10-6-24-7-36-4v46c12-3 26-2 36 4m0-46c10-6 24-7 36-4v46c-12-3-26-2-36 4m0-46v46"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="currentColor"
          fillOpacity="0.35"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 110 90"
      fill="none"
      className="pointer-events-none absolute right-1.5 sm:right-3 bottom-1.5 w-14 sm:w-28 h-12 sm:h-22 select-none opacity-65 sm:opacity-100"
      aria-hidden="true"
    >
      <rect
        x="18"
        y="58"
        width="12"
        height="22"
        rx="3"
        fill={isDark ? "#3D3522" : "#F8E5B8"}
      />
      <rect
        x="36"
        y="46"
        width="12"
        height="34"
        rx="3"
        fill={isDark ? "#574724" : "#F3D38C"}
      />
      <rect
        x="54"
        y="34"
        width="12"
        height="46"
        rx="3"
        fill={isDark ? "#785D26" : "#ECC060"}
      />
      <rect
        x="72"
        y="18"
        width="12"
        height="62"
        rx="3"
        fill={isDark ? "#9E7829" : "#DFA83C"}
      />
      <path
        d="M20 50 L42 36 L60 26 L78 12"
        stroke={isDark ? "#E2B355" : "#C58927"}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const METRIC_CONFIG: Record<
  string,
  {
    Icon: LucideIcon;
    badgeBgLight: string;
    badgeBgDark: string;
    iconColorLight: string;
    iconColorDark: string;
  }
> = {
  "Classes Attended": {
    Icon: GraduationCap,
    badgeBgLight: "bg-[#071B41]",
    badgeBgDark: "bg-[#11244A] border border-white/10",
    iconColorLight: "text-[#E5B85B]",
    iconColorDark: "text-[#E2B355]"
  },
  "Lessons Completed": {
    Icon: BookOpen,
    badgeBgLight: "bg-[#FCE8E0]",
    badgeBgDark: "bg-[#3A2028] border border-rose-400/20",
    iconColorLight: "text-[#D96B43]",
    iconColorDark: "text-[#F28B66]"
  },
  Attendance: {
    Icon: Target,
    badgeBgLight: "bg-[#FDF3DC]",
    badgeBgDark: "bg-[#2C281E] border border-[#E2B355]/25",
    iconColorLight: "text-[#C58927]",
    iconColorDark: "text-[#E2B355]"
  }
};

export function ProgressOverview({ metrics }: ProgressOverviewProps) {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  const rawMetrics = metrics?.length ? metrics : DEFAULT_METRICS;
  const orderedLabels = ["Classes Attended", "Lessons Completed", "Attendance"];
  const displayMetrics = orderedLabels.map(
    (label) =>
      rawMetrics.find((m) => m.label === label) ?? { label, value: "0" }
  );

  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-5">
      {displayMetrics.map((metric) => {
        const cfg =
          METRIC_CONFIG[metric.label] ?? METRIC_CONFIG["Classes Attended"];
        const Icon = cfg.Icon;

        return (
          <div
            key={metric.label}
            className={`relative overflow-hidden rounded-2xl border p-3 sm:p-5 transition-all duration-200 ${isDark
                ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
                : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]"
              }`}
          >
            {/* Right-Side Watermark Illustration */}
            <MetricArtwork label={metric.label} isDark={isDark} />

            <div className="relative z-10 flex flex-col justify-between h-full">
              {/* Top Circular Icon Badge */}
              <div
                className={`size-8 sm:size-10 rounded-full flex items-center justify-center mb-2.5 sm:mb-4 ${isDark ? cfg.badgeBgDark : cfg.badgeBgLight
                  }`}
              >
                <Icon
                  className={`size-4 sm:size-5 ${isDark ? cfg.iconColorDark : cfg.iconColorLight
                    }`}
                  strokeWidth={2.1}
                />
              </div>

              {/* Value & Full Label */}
              <div>
                <div className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight leading-none">
                  {metric.value}
                </div>
                <div
                  className={`mt-1.5 text-[10px] sm:text-xs font-semibold leading-tight ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                    }`}
                >
                  {metric.label}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}