/**
 * `true` when `value` carries no textual content: `null`, `undefined`, or a
 * string that is empty or only whitespace. Everything else is `false`,
 * including `0`, `false`, `NaN`, and non-string objects — those are "not
 * blank" because they are not absent text.
 */
export function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  return false;
}
