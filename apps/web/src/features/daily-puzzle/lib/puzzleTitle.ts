/**
 * A catalogue puzzle's title already ends with its rating ("Mate in 2 · 1280");
 * drop that tail where the rating is shown on its own.
 */
export function titleWithoutRating(title: string, rating: number | null): string {
  if (rating === null) return title;
  const suffix = ` · ${rating}`;
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}
