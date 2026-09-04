/**
 * `true` when `value` carries no textual content: `null`, `undefined`, or a
 * string that is empty or only whitespace. Everything else is `false`,
 * including `0`, `false`, `NaN`, and non-string objects — those are "not
 * blank" because they are not absent text.
 */
/**
 * Title-cases `value`: every whitespace-separated word gets its first letter
 * uppercased and the rest lowercased. Original whitespace (runs, tabs,
 * newlines) is preserved. Returns `""` for an empty string.
 */
export function titleCase(value: string): string {
  if (value.length === 0) {
    return "";
  }
  return value.replace(
    /\S+/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase(),
  );
}

export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}

/**
 * Strips accents/diacritics from `value` by normalising to NFD and removing
 * combining diacritical marks (U+0300–U+036F), so `"Crème Brûlée"` becomes
 * `"Creme Brulee"`. Non-Latin characters and casing are otherwise preserved.
 * Returns `""` for an empty string.
 */
export function stripAccents(value: string): string {
  if (value.length === 0) {
    return "";
  }
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "");
}
