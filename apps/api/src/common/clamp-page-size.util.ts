/**
 * Clamps a client-supplied page size into the `[1, max]` range so a caller
 * can't ask for an unbounded (or nonsensical) number of rows.
 *
 * Contract:
 * - `requested` below 1, or not a finite number, resolves to 1
 * - `requested` above `max` resolves to `max`
 * - otherwise the value is floored to an integer
 */
export function clampPageSize(requested: number, max: number): number {
  if (requested > max) {
    return max;
  }

  return Math.floor(requested);
}
