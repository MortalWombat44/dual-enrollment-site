import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from 'pdf-lib';
import { db } from './db';
import { getFile, readFile } from './files';
import { classLabel, fmt, getProgress, type StudentProgress, type Term } from './workflow';
import { unitLimit } from './constants';

const W = 612, H = 792, M = 54; // US Letter, 0.75" margins
const INK = rgb(0.125, 0.118, 0.114), MUTED = rgb(0.4, 0.4, 0.4), GREEN = rgb(0.059, 0.42, 0.263);

/** Standard PDF fonts only cover Latin-1 (+ a few typographic marks); anything else becomes "?". */
const safe = (s: unknown) => String(s ?? '').replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—•·…]/g, '?');

type Name = { first_name: string; last_name: string; title: string | null; role: string; admin_level: string | null };
const person = (id: unknown): Name | null =>
  id ? ((db().prepare('SELECT first_name, last_name, title, role, admin_level FROM users WHERE id = ?').get(Number(id)) as Name | undefined) ?? null) : null;
const fullName = (n: Name | null) => (n ? `${n.first_name} ${n.last_name}` : 'Unknown');
const when = (iso: unknown) => (iso ? `${fmt(String(iso), 'mdy')}, ${fmt(String(iso), 'time')} PT` : '');

/** Small layout helper: writes top-down and adds pages as needed. */
class Writer {
  page!: PDFPage;
  y = 0;
  constructor(public doc: PDFDocument, public font: PDFFont, public bold: PDFFont, private footer: string) { this.newPage(); }
  newPage() {
    this.page = this.doc.addPage([W, H]);
    this.y = H - M;
    this.page.drawText(safe(this.footer), { x: M, y: 30, size: 8, font: this.font, color: MUTED });
  }
  need(h: number) { if (this.y - h < M) this.newPage(); }
  /** Wrapped text. Returns nothing; moves the cursor down. */
  text(s: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = o.size ?? 10, f = o.bold ? this.bold : this.font, x = o.x ?? M, width = o.width ?? W - M - x;
    const words = safe(s).split(/\s+/);
    let line = '';
    const lines: string[] = [];
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (f.widthOfTextAtSize(next, size) > width && line) { lines.push(line); line = w; } else line = next;
    }
    if (line) lines.push(line);
    for (const l of lines) {
      this.need(size + 4);
      this.page.drawText(l, { x, y: this.y - size, size, font: f, color: o.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= o.gap ?? 2;
  }
  heading(s: string) {
    this.need(40);
    this.y -= 10;
    this.text(s, { size: 13, bold: true, gap: 2 });
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 1.5, color: INK });
    this.y -= 10;
  }
  row(cells: string[], widths: number[], o: { bold?: boolean; size?: number } = {}) {
    const size = o.size ?? 9;
    this.need(size + 8);
    let x = M;
    cells.forEach((c, i) => {
      const f = o.bold ? this.bold : this.font;
      let t = safe(c);
      while (t && f.widthOfTextAtSize(t, size) > widths[i] - 6) t = t.slice(0, -2) + '…';
      this.page.drawText(t, { x, y: this.y - size, size, font: f, color: INK });
      x += widths[i];
    });
    this.y -= size + 6;
    this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: W - M, y: this.y + 2 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) });
  }
  image(img: PDFImage, maxW: number, maxH: number) {
    const s = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * s, h = img.height * s;
    this.need(h + 8);
    this.page.drawRectangle({ x: M, y: this.y - h - 6, width: Math.min(maxW, w) + 12, height: h + 6, borderColor: INK, borderWidth: 1 });
    this.page.drawImage(img, { x: M + 6, y: this.y - h - 3, width: w, height: h });
    this.y -= h + 14;
  }
}

async function embedStoredPng(doc: PDFDocument, fileId: unknown): Promise<PDFImage | null> {
  const f = fileId ? getFile(Number(fileId)) : null;
  if (!f) return null;
  const bytes = readFile(f);
  if (f.mime === 'image/png') return doc.embedPng(bytes);
  if (f.mime === 'image/jpeg') return doc.embedJpg(bytes);
  return null;
}

/** Appends one student's audit record (consent + course requests for the chosen terms + approvals). */
async function addStudent(doc: PDFDocument, font: PDFFont, bold: PDFFont, p: StudentProgress, termIds: number[], generatedBy: string) {
  const footer = `Shasta College Dual Enrollment · audit record for ${p.student.first_name} ${p.student.last_name} (ID ${p.student.student_number ?? 'none'}) · generated ${when(new Date().toISOString())} by ${generatedBy}`;
  const w = new Writer(doc, font, bold, footer);
  w.text('SHASTA COLLEGE · DUAL ENROLLMENT', { size: 9, bold: true, color: GREEN });
  w.text(`${p.student.first_name} ${p.student.last_name}`, { size: 22, bold: true, gap: 4 });
  w.text(`Shasta College ID: ${p.student.student_number ?? 'not on file'}   ·   ${p.school.name} (${p.school.designation === 'CCAP' ? 'CCAP' : 'Non-CCAP'})   ·   ${classLabel(p.student)}`, { size: 10 });
  w.text(`Email: ${p.student.email}`, { size: 9, color: MUTED, gap: 6 });

  // 1 · Parent / guardian consent
  w.heading('Parent / guardian consent');
  const consent = p.steps.find((s) => s.id === 3);
  const cd = (consent?.data ?? {}) as { method?: string; signer?: string; file_id?: number; parent_id?: number; admin_id?: number };
  let uploaded: ReturnType<typeof getFile> = null;
  if (!consent) w.text('Parent consent is turned off for this school.');
  else if (consent.status !== 'complete') w.text('No parent consent on file.', { bold: true });
  else {
    w.text(`Signed by: ${cd.signer ?? '—'}${cd.parent_id ? ` (parent / guardian account: ${fullName(person(cd.parent_id))})` : ''}`);
    w.text(`Signed on: ${when(consent.completedAt)}`);
    w.text(`Method: ${cd.method === 'upload' ? 'Uploaded signed form' : cd.method === 'office' ? `On file with Shasta College (marked complete by ${fullName(person(cd.admin_id))})` : 'Electronic signature'}`);
    w.text('One-time consent covering this and future terms until revoked.', { size: 9, color: MUTED, gap: 6 });
    if (cd.method === 'esign') {
      const img = await embedStoredPng(doc, cd.file_id);
      if (img) w.image(img, 260, 90);
    } else if (cd.method === 'upload' && cd.file_id) {
      uploaded = getFile(cd.file_id);
      if (uploaded) w.text(`Signed form attached after this record: ${uploaded.filename}`, { size: 9 });
    }
  }

  // 2 · Course requests for the chosen terms
  const terms: Term[] = p.requestTerms.filter((t) => !termIds.length || termIds.includes(t.id));
  w.heading(`Course requests${termIds.length ? '' : ' (all terms)'}`);
  if (!terms.length) w.text('No course requests for the selected term(s).');
  const cols = [44, 66, 186, 40, 50, 118];
  for (const t of terms) {
    const list = p.courses.filter((c) => c.term_id === t.id);
    const units = list.reduce((n, c) => n + c.units, 0);
    const limit = unitLimit(p.school.designation, t.summer === 1);
    w.text(`${t.name} · registration ${t.is_current === 1 ? 'allowed' : 'closed'} · opens ${fmt(t.registration_opens, 'mdy')}`, { bold: true, size: 10, gap: 4 });
    w.row(['Type', 'Code', 'Title', 'Units', 'Period', 'Teacher / location'], cols, { bold: true });
    for (const c of list) w.row([c.kind === 'de' ? 'DE' : 'CE', c.code, c.title, String(c.units), c.period ?? '', c.kind === 'de' ? c.teacher ?? '' : 'Shasta College'], cols);
    w.text(`Total: ${units} units (usual limit ${limit})${units > limit ? ' · OVER THE USUAL LIMIT' : ''}`, { size: 9, gap: 8 });
  }

  // 3 · Approvals
  w.heading('Approvals');
  const hs = p.steps.find((s) => s.id === 4);
  const hd = (hs?.data ?? {}) as { counselor_id?: number; signed_name?: string; signature_file_id?: number; sign_method?: string; signed_at?: string; note?: string; admin_id?: number; override?: boolean };
  if (!hs) w.text('High school approval: not required at this school.');
  else if (hs.status !== 'complete') w.text('High school approval: not yet approved.', { bold: true });
  else if (hd.override || hd.admin_id) w.text(`High school approval: marked complete by Shasta College admin ${fullName(person(hd.admin_id))} on ${when(hs.completedAt)} (no high school signature).`);
  else {
    const staff = person(hd.counselor_id);
    w.text(`High school approval: approved and digitally signed by ${hd.signed_name ?? fullName(staff)}, High School Staff, ${p.school.name}, on ${when(hd.signed_at ?? hs.completedAt)}.`);
    if (hd.note) w.text(`Note: “${hd.note}”`, { size: 9, color: MUTED });
    const img = await embedStoredPng(doc, hd.signature_file_id);
    if (img) {
      w.image(img, 260, 70);
      w.text(`Signature (${hd.sign_method ?? 'drawn'})`, { size: 8, color: MUTED, gap: 6 });
    } else w.text('No signature image on file (approved before digital signatures).', { size: 9, color: MUTED });
  }
  const cu = p.steps.find((s) => s.id === 7);
  const ud = (cu?.data ?? {}) as { admin_id?: number; note?: string };
  if (cu) w.text(cu.status === 'complete' ? `Clear units: cleared by ${fullName(person(ud.admin_id))}, Shasta College, on ${when(cu.completedAt)}.` : 'Clear units: not yet cleared.');
  const pr = p.steps.find((s) => s.id === 8);
  const pd = (pr?.data ?? {}) as { admin_id?: number; decisions?: { code: string; decision: string }[] };
  if (pr) {
    w.text(pr.status === 'complete' ? `Prerequisite review: by ${fullName(person(pd.admin_id))} on ${when(pr.completedAt)}.` : 'Prerequisite review: not yet reviewed.');
    for (const d of pd.decisions ?? []) w.text(`${d.code}: ${d.decision}`, { size: 9, x: M + 14 });
  }

  // Uploaded consent form, appended as-is.
  if (uploaded) {
    const bytes = readFile(uploaded);
    if (uploaded.mime === 'application/pdf') {
      try {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        for (const pg of await doc.copyPages(src, src.getPageIndices())) doc.addPage(pg);
      } catch {
        const ew = new Writer(doc, font, bold, footer);
        ew.text(`The uploaded consent form (${uploaded.filename}) couldn't be attached. Download it from the student's record.`);
      }
    } else {
      const img = uploaded.mime === 'image/png' ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
      const pw = new Writer(doc, font, bold, footer);
      pw.text(`Uploaded consent form: ${uploaded.filename}`, { bold: true, gap: 8 });
      pw.image(img, W - 2 * M - 12, H - 2 * M - 60);
    }
  }
}

/** One PDF for one or more students. */
export async function buildAuditPdf(studentIds: number[], termIds: number[], generatedBy: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Shasta College Dual Enrollment audit');
  doc.setCreator('Shasta College Dual Enrollment');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (const id of studentIds) {
    const p = getProgress(id);
    if (p) await addStudent(doc, font, bold, p, termIds, generatedBy);
  }
  if (doc.getPageCount() === 0) new Writer(doc, font, bold, 'Shasta College Dual Enrollment audit').text('No matching students.');
  return doc.save();
}

/** Shasta College IDs pasted by an admin → matching student accounts (an ID can match more than one). */
export function studentsForIds(raw: string): { id: string; students: { id: number; name: string; school: string }[] }[] {
  const ids = [...new Set(raw.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))].slice(0, 500);
  return ids.map((id) => ({
    id,
    students: db().prepare(`SELECT u.id, u.first_name || ' ' || u.last_name AS name, s.name AS school FROM users u LEFT JOIN schools s ON s.id = u.school_id
      WHERE u.role = 'student' AND u.student_number = ? COLLATE NOCASE ORDER BY u.id`).all(id) as { id: number; name: string; school: string }[],
  }));
}
