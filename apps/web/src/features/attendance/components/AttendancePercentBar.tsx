import { cn } from "@/lib/utils";

interface AttendancePercentBarProps {
  percent: number;
  className?: string;
  showText?: boolean;
}

export function AttendancePercentBar({ percent, className, showText = true }: AttendancePercentBarProps) {
  // Status hues, not danger: red stays reserved for destructive actions and LIVE.
  const colorClass = percent >= 90 ? "bg-success" : percent >= 70 ? "bg-secondary" : "bg-warning";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-2 bg-app-border rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-[width] duration-500 rounded-full", colorClass)} 
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} 
        />
      </div>
      {showText && (
        <span className="min-w-8 text-right text-xs font-medium tabular-nums text-app-muted">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}
