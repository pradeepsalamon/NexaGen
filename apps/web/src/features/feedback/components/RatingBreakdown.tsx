import { FEEDBACK_RATING_MAX } from "@nexa-chess/types";

/** 5→1 star rows with a proportional bar, like a store review summary. */
export function RatingBreakdown({ distribution }: { distribution: number[] }) {
  const total = distribution.reduce((sum, n) => sum + n, 0);
  const rows = Array.from({ length: FEEDBACK_RATING_MAX }, (_, i) => FEEDBACK_RATING_MAX - i);

  return (
    <div className="grid gap-1">
      {rows.map((star) => {
        const count = distribution[star - 1] ?? 0;
        const pct = total === 0 ? 0 : Math.round((count / total) * 100);
        return (
          <div className="flex items-center gap-2 text-xs" key={star}>
            <span className="w-3 text-right font-semibold text-app-muted">{star}</span>
            <div aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-app-soft">
              <div className="h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-7 text-right tabular-nums text-app-muted">{count}</span>
          </div>
        );
      })}
    </div>
  );
}
