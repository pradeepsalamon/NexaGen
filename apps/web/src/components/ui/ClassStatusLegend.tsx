import { CLASS_STATUS_DOT, CLASS_STATUS_LEGEND } from "@/constants/classes";
import { cn } from "@/lib/utils";

/** The key for every class calendar's status dots. */
export function ClassStatusLegend({ className }: { className?: string }) {
  return (
    <ul aria-label="Class status legend" className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-app-muted", className)}>
      {CLASS_STATUS_LEGEND.map(({ status, label }) => (
        <li className="flex items-center gap-1.5" key={status}>
          <span aria-hidden="true" className={cn("size-2 rounded-full", CLASS_STATUS_DOT[status])} />
          <span>{label}</span>
        </li>
      ))}
    </ul>
  );
}
