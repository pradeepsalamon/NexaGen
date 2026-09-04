/**
 * Floor `value` to an integer and clamp it to the inclusive `[min, max]` range.
 * Non-finite input (`NaN`, `Infinity`, `-Infinity`) yields `min`.
 */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  const floored = Math.floor(value);
  if (floored < min) {
    return min;
  }
  if (floored > max) {
    return max;
  }
  return floored;
}
