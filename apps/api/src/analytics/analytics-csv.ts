/**
 * Serialises a cell for CSV, guarding against formula injection in spreadsheet
 * apps (mirrors `attendance.service.ts#toCsvCell`, AUDIT H25).
 */
export function toCsvCell(value: unknown): string {
  let s =
    value === null || value === undefined
      ? ""
      : value instanceof Date
        ? value.toISOString()
        : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(toCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(toCsvCell).join(","));
  return lines.join("\r\n");
}
