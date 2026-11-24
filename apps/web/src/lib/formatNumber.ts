/**
 * One number format for the whole app: Indian digit grouping (1,00,000), the
 * same on every screen whatever the browser's language (FE review U4; other
 * screens already used "en-IN"). Dates have their own rules in `datetime.ts`.
 */
const NUMBER_FORMAT = new Intl.NumberFormat("en-IN");

export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}
