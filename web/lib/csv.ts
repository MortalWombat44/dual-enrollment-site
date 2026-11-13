/**
 * One CSV cell: always quoted, and anything that a spreadsheet would run as a formula (starts with = + - @, or a
 * tab / carriage return) gets a leading apostrophe so it's shown as text.
 */
export function csvCell(v: unknown): string {
  const s = String(v ?? '');
  return `"${(/^[=+\-@\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
}
