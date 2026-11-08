import 'server-only';
import ExcelJS from 'exceljs';

/** Columns of the course upload template, in order. Code, Title and Units are required. */
export const IMPORT_COLUMNS = ['Code', 'Title', 'Units', 'Period', 'Teacher', 'Prerequisite'] as const;
export const IMPORT_EXAMPLE = ['PSYC C1000', 'Introduction to Psychology', '3', '2', 'Ms. Lopez', ''];
export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export type ImportRow = { line: number; code: string; title: string; units: number; period: string | null; teacher: string | null; prerequisite: string | null };

/** Minimal RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  const s = text.replace(/^﻿/, ''); // Excel's UTF-8 byte order mark
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function parseXlsx(buf: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: string[][] = [];
  ws.eachRow({ includeEmpty: true }, (r) => {
    const out: string[] = [];
    for (let i = 1; i <= Math.max(r.cellCount, IMPORT_COLUMNS.length); i++) out.push(r.getCell(i).text ?? '');
    rows.push(out);
  });
  return rows;
}

/** Reads an uploaded CSV or Excel (.xlsx) file into rows of text. */
export async function readUpload(file: File): Promise<string[][] | null> {
  const buf = Buffer.from(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  // .xlsx is a zip file ("PK" header).
  if (name.endsWith('.xlsx') || (buf[0] === 0x50 && buf[1] === 0x4b)) {
    try { return await parseXlsx(buf); } catch { return null; }
  }
  if (name.endsWith('.xls')) return null; // old binary Excel: ask for .xlsx or .csv
  return parseCsv(buf.toString('utf8'));
}

/** Checks every row. Returns the rows to import, or the problems (with spreadsheet line numbers). */
export function validateRows(raw: string[][]): { rows: ImportRow[]; errors: string[] } {
  const errors: string[] = [];
  const cells = raw.map((r) => r.map((c) => String(c ?? '').trim()));
  const headerAt = cells.findIndex((r) => r.some((c) => c));
  if (headerAt < 0) return { rows: [], errors: ['The file is empty.'] };
  const header = cells[headerAt].map((h) => h.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const idx = {
    code: col('code', 'coursecode', 'course'), title: col('title', 'coursetitle', 'name', 'coursename'), units: col('units', 'unit', 'credits'),
    period: col('period'), teacher: col('teacher', 'instructor'), prerequisite: col('prerequisite', 'prerequisites', 'prereq'),
  };
  for (const k of ['code', 'title', 'units'] as const) if (idx[k] < 0) errors.push(`Missing the "${k[0].toUpperCase() + k.slice(1)}" column. Use the template's header row.`);
  if (errors.length) return { rows: [], errors };
  const rows: ImportRow[] = [];
  const seen = new Map<string, number>();
  cells.slice(headerAt + 1).forEach((r, i) => {
    const line = headerAt + i + 2;
    if (!r.some((c) => c)) return; // blank line
    const get = (j: number) => (j >= 0 ? r[j] ?? '' : '');
    const code = get(idx.code).toUpperCase().replace(/\s+/g, ' ');
    const title = get(idx.title).replace(/\s+/g, ' ');
    const units = Number(get(idx.units));
    const period = get(idx.period).slice(0, 20) || null;
    const problems: string[] = [];
    if (!/^[A-Z][A-Z0-9 .\-]{1,19}$/.test(code)) problems.push('a course code like PSYC C1000');
    if (!title) problems.push('a title');
    if (!Number.isFinite(units) || units < 0.5 || units > 10 || Math.round(units * 2) !== units * 2) problems.push('units between 0.5 and 10');
    if (problems.length) { errors.push(`Line ${line}: needs ${problems.join(', ')}.`); return; }
    const key = `${code}|${period ?? ''}`;
    if (seen.has(key)) { errors.push(`Line ${line}: ${code}${period ? ` period ${period}` : ''} is already on line ${seen.get(key)}.`); return; }
    seen.set(key, line);
    rows.push({ line, code, title: title.slice(0, 120), units, period, teacher: get(idx.teacher).slice(0, 80) || null, prerequisite: get(idx.prerequisite).slice(0, 200) || null });
  });
  if (rows.length > MAX_IMPORT_ROWS) errors.push(`Too many rows (${rows.length}). Upload at most ${MAX_IMPORT_ROWS} at a time.`);
  if (!rows.length && !errors.length) errors.push('No courses found under the header row.');
  return { rows, errors };
}

/** The template as CSV (opens in Excel or Google Sheets). */
export function templateCsv(): string {
  const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '﻿' + [IMPORT_COLUMNS.join(','), IMPORT_EXAMPLE.map(q).join(',')].join('\r\n') + '\r\n';
}

/** The template as an Excel workbook, with a second sheet of instructions. */
export async function templateXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Courses');
  ws.addRow([...IMPORT_COLUMNS]);
  ws.addRow(IMPORT_EXAMPLE.map((v, i) => (i === 2 ? Number(v) : v)));
  ws.getRow(1).font = { bold: true };
  ws.columns = [{ width: 14 }, { width: 36 }, { width: 8 }, { width: 10 }, { width: 22 }, { width: 36 }];
  const help = wb.addWorksheet('How to fill this in');
  for (const line of [
    'One row per Dual Enrollment section. Delete the example row.',
    'Code, Title and Units are required. Units can be whole or half units (3, 4, 1.5).',
    'Period and Teacher are optional (leave blank or write TBD).',
    'Prerequisite is optional. When filled in, a college counselor reviews the request.',
    'On the Courses page, pick the school and the term, then upload this file (.xlsx or .csv).',
    'A row with the same code and period as an existing course for that school and term updates it.',
  ]) help.addRow([line]);
  help.getColumn(1).width = 100;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
