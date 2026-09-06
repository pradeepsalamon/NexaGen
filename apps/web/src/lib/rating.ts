/**
 * Presentation for a student's `chessRating`.
 *
 * Bands follow the conventional USCF/club class labels. The API stores only the
 * number — there is no rating history table, so a "+38 this week" style delta
 * cannot be derived here; the widget omits it rather than inventing one.
 */

type RatingBand = {
  /** Rating at which the next band starts; null once in the top band. */
  next: number | null;
  /** 0–100 progress through the current band. */
  progress: number;
  title: string;
};

const BANDS: { floor: number; title: string }[] = [
  { floor: 2200, title: "Master" },
  { floor: 2000, title: "Expert" },
  { floor: 1800, title: "Class A" },
  { floor: 1600, title: "Class B" },
  { floor: 1400, title: "Class C" },
  { floor: 1200, title: "Class D" },
  { floor: 1000, title: "Class E" },
  { floor: 0, title: "Beginner" }
];

export function ratingBand(rating: number): RatingBand {
  const index = BANDS.findIndex((band) => rating >= band.floor);
  const band = BANDS[index] ?? BANDS[BANDS.length - 1];
  const next = index <= 0 ? null : BANDS[index - 1].floor;

  if (next === null) {
    return { next: null, progress: 100, title: band.title };
  }

  const span = next - band.floor;
  const progress = Math.round(((rating - band.floor) / span) * 100);

  return {
    next,
    progress: Math.min(Math.max(progress, 0), 100),
    title: band.title
  };
}
