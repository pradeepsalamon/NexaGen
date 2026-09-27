import { cn } from "@/lib/utils";

interface AttendancePercentBarProps {
  percent: number;
  className?: string;
  showText?: boolean;
}

export function AttendancePercentBar({ percent, className, showText = true }: AttendancePercentBarProps) {
  // Determine color based on threshold
  let colorClass = "bg-red-500";
  if (percent >= 90) colorClass = "bg-green-500";
  else if (percent >= 70) colorClass = "bg-secondary";
  else if (percent >= 30) colorClass = "bg-orange-500";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-2 bg-app-border rounded-full overflow-hidden">
        <div 
          className={cn("h-full transition-all duration-500 rounded-full", colorClass)} 
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} 
        />
      </div>
      {showText && (
        <span className="text-xs font-medium text-app-muted min-w-[32px] text-right">
          {Math.round(percent)}%
        </span>
      )}
    </div>
  );
}
