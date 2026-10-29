import { GraduationCap, BookOpen, Target, type LucideIcon } from "lucide-react";

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

function MetricArtwork({ label }: { label: string }) {
  if (label === "Classes Attended") {
    return (
      <svg
        viewBox="0 0 110 96"
        fill="none"
        className="pointer-events-none absolute right-1.5 sm:right-3 bottom-1 w-14 sm:w-28 h-12 sm:h-24 select-none opacity-65 sm:opacity-100 text-nx-gold-pale-ink"
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
        className="pointer-events-none absolute right-1.5 sm:right-3 bottom-1.5 w-14 sm:w-28 h-12 sm:h-22 select-none opacity-65 sm:opacity-100 text-nx-warm-pale-ink"
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
        className="fill-nx-chart-1"
      />
      <rect
        x="36"
        y="46"
        width="12"
        height="34"
        rx="3"
        className="fill-nx-chart-2"
      />
      <rect
        x="54"
        y="34"
        width="12"
        height="46"
        rx="3"
        className="fill-nx-chart-3"
      />
      <rect
        x="72"
        y="18"
        width="12"
        height="62"
        rx="3"
        className="fill-nx-chart-4"
      />
      <path
        d="M20 50 L42 36 L60 26 L78 12"
        className="stroke-nx-gold-ink"
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
    badge: string;
    icon: string;
  }
> = {
  "Classes Attended": {
    Icon: GraduationCap,
    badge: "bg-nx-stat-navy border-nx-stat-navy-line",
    icon: "text-nx-stat-navy-ink"
  },
  "Lessons Completed": {
    Icon: BookOpen,
    badge: "bg-nx-stat-coral border-nx-stat-coral-line",
    icon: "text-nx-stat-coral-ink"
  },
  Attendance: {
    Icon: Target,
    badge: "bg-nx-stat-gold border-nx-stat-gold-line",
    icon: "text-nx-gold-ink"
  }
};

export function ProgressOverview({ metrics }: ProgressOverviewProps) {
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
            className="relative overflow-hidden rounded-2xl border p-3 sm:p-5 transition-all duration-200 bg-nx-card border-nx-line text-nx-ink shadow-nx-card"
          >
            {/* Right-Side Watermark Illustration */}
            <MetricArtwork label={metric.label} />

            <div className="relative z-10 flex flex-col justify-between h-full">
              {/* Top Circular Icon Badge */}
              <div
                className={`size-8 sm:size-10 rounded-full border flex items-center justify-center mb-2.5 sm:mb-4 ${cfg.badge}`}
              >
                <Icon
                  className={`size-4 sm:size-5 ${cfg.icon}`}
                  strokeWidth={2.1}
                />
              </div>

              {/* Value & Full Label */}
              <div>
                <div className="text-xl sm:text-3xl font-extrabold tabular-nums tracking-tight leading-none">
                  {metric.value}
                </div>
                <div
                  className="mt-1.5 text-[10px] sm:text-xs font-semibold leading-tight text-nx-muted"
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