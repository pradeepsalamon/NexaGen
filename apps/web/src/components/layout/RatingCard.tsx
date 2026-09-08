import { ratingBand } from "@/lib/rating";

/**
 * Sidebar rating widget. Driven entirely by `StudentProfile.chessRating` — the
 * band label and progress bar are derived from it, so nothing here is a
 * placeholder. Renders nothing when the student has no rating on file.
 */
export function RatingCard({ rating }: { rating?: number | null }) {
  if (typeof rating !== "number") {
    return null;
  }

  const { next, progress, title } = ratingBand(rating);

  return (
    <div className="rounded-app border border-app-border bg-app-soft p-3.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-app-muted">
          Chess Rating
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-2xl font-black tracking-tight text-app-text">
          {rating.toLocaleString()}
        </span>
        <span className="rounded border border-secondary/40 bg-secondary/25 px-2 py-0.5 text-[11px] font-bold text-secondary-ink">
          {title}
        </span>
      </div>
      {next === null ? null : (
        <div className="mt-2.5">
          <div className="mb-1 flex justify-between text-[10px] text-app-muted">
            <span>Progress to {next}</span>
            <span className="font-mono font-semibold text-app-text">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-app-border">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
