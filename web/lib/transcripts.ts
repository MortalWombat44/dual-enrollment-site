import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, tx, UPLOAD_DIR } from './db';
import { saveFile, sniff } from './files';
import { MAX_UPLOAD_BYTES } from './constants';
import { logEvent, type Actor } from './audit';
import { notifyUsers } from './notify';
import type { PrereqHold } from './workflow';

/**
 * Transcripts for prerequisite review. The student, their high school staff or a college admin can upload one
 * (college admins can also upload many at once: see /admin/transcripts). A college counselor sees them on the
 * student's Prerequisite review. Uploading one answers any "More information needed" hold.
 */
export type Transcript = { id: number; filename: string; created_at: string; by_name: string | null; by_role: string | null };

export function transcriptsFor(studentId: number): Transcript[] {
  return db().prepare(`SELECT f.id, f.filename, strftime('%Y-%m-%dT%H:%M:%SZ', f.created_at) AS created_at, u.first_name || ' ' || u.last_name AS by_name, u.role AS by_role
    FROM files f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.student_id = ? AND f.kind = 'transcript' ORDER BY f.id DESC`).all(studentId) as Transcript[];
}

export const TRANSCRIPT_ERRORS: Record<string, string> = {
  file: 'Choose a transcript file to upload.',
  size: 'That file is over 10 MB.',
  type: 'Upload a PDF, JPG or PNG.',
};

/** Check an uploaded file: returns its bytes and type, or an error code (see TRANSCRIPT_ERRORS). */
export async function readUpload(f: FormDataEntryValue | null): Promise<{ buf: Buffer; mime: string; name: string } | { error: string }> {
  if (!(f instanceof File) || f.size === 0) return { error: 'file' };
  if (f.size > MAX_UPLOAD_BYTES) return { error: 'size' };
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniff(buf);
  if (!mime) return { error: 'type' };
  return { buf, mime, name: f.name.slice(0, 120) };
}

/** Terms of the student's classes still waiting on prerequisite review (where a transcript belongs in the history). */
function prereqTermIds(studentId: number): number[] {
  return (db().prepare(`SELECT DISTINCT r.term_id FROM course_requests r JOIN courses c ON c.id = r.course_id
    WHERE r.student_id = ? AND r.archived_at IS NULL AND r.prereq_status IS NULL AND (c.prerequisite IS NOT NULL OR r.prereq_flag = 1) AND r.term_id IS NOT NULL`)
    .all(studentId) as { term_id: number }[]).map((r) => r.term_id);
}

/** Save a transcript to a student's record, note it in the history, and answer any "More information needed" hold. */
export async function addTranscript(studentId: number, by: Actor & { id: number }, file: { buf: Buffer; mime: string; name: string }, how?: string): Promise<number> {
  const id = saveFile({ studentId, uploadedBy: by.id, kind: 'transcript', filename: file.name, mime: file.mime, data: file.buf });
  await afterTranscript(studentId, by, file.name, how);
  return id;
}

async function afterTranscript(studentId: number, by: Actor, filename: string, how?: string) {
  logEvent(studentId, by, 'Uploaded a transcript', [filename, how].filter(Boolean).join(' · '), prereqTermIds(studentId));
  await releaseHolds(studentId, ['info'], by, 'A transcript was uploaded');
}

// ---------- Bulk upload: match each file to a student by its file name ----------

type Candidate = { id: number; first_name: string; last_name: string; student_number: string | null; school: string | null };
export type Match =
  | { kind: 'id' | 'name'; studentId: number; note: string }           // sure: assigned right away
  | { kind: 'review'; studentId: number | null; note: string };        // staff confirm (closest match) or pick

const norm = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const idNorm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Words in file names that aren't names. */
const NOISE = new Set(['transcript', 'transcripts', 'unofficial', 'official', 'report', 'card', 'grades', 'grade', 'high', 'school', 'hs', 'copy', 'scan',
  'scanned', 'final', 'fall', 'spring', 'summer', 'winter', 'semester', 'term', 'student', 'id', 'pdf', 'jpg', 'png', 'and', 'the', 'of', 'for', 'doc', 'img', 'image']);

function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
const similar = (a: string, b: string) => (a && b ? 1 - lev(a, b) / Math.max(a.length, b.length) : 0);

function candidates(): Candidate[] {
  return db().prepare(`SELECT u.id, u.first_name, u.last_name, u.student_number, s.name AS school FROM users u LEFT JOIN schools s ON s.id = u.school_id
    WHERE u.role = 'student' AND u.disabled = 0 AND u.retired_at IS NULL`).all() as Candidate[];
}
const label = (c: Candidate) => `${c.first_name} ${c.last_name}${c.student_number ? ` (ID ${c.student_number})` : ''}`;

/**
 * Match a transcript to a student from its file name. Sure matches (assigned right away): a Shasta College ID that's on
 * exactly one account, or one student whose first and last name are both in the file name (and no ID that points
 * elsewhere). Anything else goes to staff with the closest match suggested, if one is close enough.
 */
export function matchTranscript(filename: string, pool: Candidate[] = candidates()): Match {
  const base = filename.replace(/\.[a-z0-9]{2,4}$/i, '');
  const words = norm(base).split(' ').filter(Boolean);
  // IDs: anything with a digit in it, plus digit runs inside longer tokens.
  const idTokens = new Set<string>();
  for (const w of words) if (/\d/.test(w)) { idTokens.add(w); for (const m of w.match(/\d{4,}/g) ?? []) idTokens.add(m); }
  const byId = new Map<string, Candidate[]>();
  for (const c of pool) if (c.student_number) { const k = idNorm(c.student_number); byId.set(k, [...(byId.get(k) ?? []), c]); }
  const idHits = [...new Set([...idTokens].flatMap((t) => byId.get(t) ?? []))];
  if (idHits.length === 1) return { kind: 'id', studentId: idHits[0].id, note: `Shasta College ID ${idHits[0].student_number} in the file name` };
  if (idHits.length > 1) return { kind: 'review', studentId: idHits[0].id, note: `The ID in the file name is on ${idHits.length} accounts (${idHits.map(label).join(', ')}). Pick the right one.` };

  const nameWords = words.filter((w) => !/\d/.test(w) && w.length > 1 && !NOISE.has(w));
  const parts = (c: Candidate) => [...norm(c.first_name).split(' '), ...norm(c.last_name).split(' ')].filter(Boolean);
  const nameHits = pool.filter((c) => parts(c).every((x) => nameWords.includes(x)));
  if (nameHits.length === 1) {
    // An ID in the file name that isn't this student's: don't guess.
    if (idTokens.size) return { kind: 'review', studentId: nameHits[0].id, note: `Name matches ${label(nameHits[0])}, but the number in the file name isn't their Shasta College ID. Check before confirming.` };
    return { kind: 'name', studentId: nameHits[0].id, note: `Name in the file name: ${nameHits[0].first_name} ${nameHits[0].last_name}` };
  }
  if (nameHits.length > 1) return { kind: 'review', studentId: nameHits[0].id, note: `${nameHits.length} students have this name: ${nameHits.map((c) => `${label(c)}${c.school ? `, ${c.school}` : ''}`).join('; ')}. Pick the right one.` };

  // Closest match: a name that's spelled a little differently, or an ID that's one character off.
  let best: { c: Candidate; score: number; why: string } | null = null;
  for (const c of pool) {
    const ps = parts(c);
    if (nameWords.length) {
      const score = ps.reduce((n, x) => n + Math.max(0, ...nameWords.map((w) => similar(w, x))), 0) / ps.length;
      if (!best || score > best.score) best = { c, score, why: `name ${Math.round(score * 100)}% similar` };
    }
    if (c.student_number) {
      const k = idNorm(c.student_number);
      for (const t of idTokens) if (t.length === k.length && lev(t, k) === 1 && (!best || 0.9 > best.score)) best = { c, score: 0.9, why: `ID ${t} is one character off from ${c.student_number}` };
    }
  }
  if (best && best.score >= 0.7) return { kind: 'review', studentId: best.c.id, note: `Closest match: ${label(best.c)} (${best.why}). Confirm or pick another student.` };
  return { kind: 'review', studentId: null, note: 'No student matched the file name. Pick the student.' };
}

export type InboxItem = { id: number; filename: string; size: number; uploaded_at: string; by_name: string | null; suggested_student_id: number | null; suggested_name: string | null; match_note: string | null };
export function transcriptInbox(): InboxItem[] {
  return db().prepare(`SELECT i.id, i.filename, i.size, i.uploaded_at, b.first_name || ' ' || b.last_name AS by_name, i.suggested_student_id,
      s.first_name || ' ' || s.last_name || COALESCE(' (ID ' || s.student_number || ')', '') AS suggested_name, i.match_note
    FROM transcript_inbox i LEFT JOIN users b ON b.id = i.uploaded_by LEFT JOIN users s ON s.id = i.suggested_student_id ORDER BY i.id`).all() as InboxItem[];
}
export function inboxCount(): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM transcript_inbox').get() as { n: number }).n;
}

/** One file from a bulk upload: assign it if the match is sure, otherwise keep it for staff to confirm. */
export async function bulkTranscript(by: Actor & { id: number }, file: { buf: Buffer; mime: string; name: string }):
  Promise<{ status: 'assigned'; student: string; note: string } | { status: 'review'; note: string }> {
  const m = matchTranscript(file.name);
  if (m.kind !== 'review') {
    await addTranscript(m.studentId, by, file, `Bulk upload, matched by ${m.kind === 'id' ? 'Shasta College ID' : 'name'}`);
    const s = db().prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(m.studentId) as { first_name: string; last_name: string };
    return { status: 'assigned', student: `${s.first_name} ${s.last_name}`, note: m.note };
  }
  const stored = crypto.randomBytes(16).toString('hex') + ({ 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[file.mime] ?? '');
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), file.buf);
  db().prepare('INSERT INTO transcript_inbox (filename, mime, size, stored_name, uploaded_by, uploaded_at, suggested_student_id, match_note) VALUES (?,?,?,?,?,?,?,?)')
    .run(file.name.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'transcript', file.mime, file.buf.length, stored, by.id, new Date().toISOString(), m.studentId, m.note);
  return { status: 'review', note: m.note };
}

export function inboxFile(id: number) {
  return (db().prepare('SELECT id, filename, mime, stored_name FROM transcript_inbox WHERE id = ?').get(id) as { id: number; filename: string; mime: string; stored_name: string } | undefined) ?? null;
}

/** Staff confirm which student an unmatched transcript belongs to: it moves onto their record. */
export async function assignInbox(id: number, studentId: number, by: Actor & { id: number }): Promise<boolean> {
  const d = db();
  const row = d.prepare('SELECT * FROM transcript_inbox WHERE id = ?').get(id) as { filename: string; mime: string; size: number; stored_name: string; match_note: string | null } | undefined;
  if (!row || !d.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'student'").get(studentId)) return false;
  tx(() => {
    d.prepare("INSERT INTO files (student_id, uploaded_by, kind, filename, mime, size, stored_name) VALUES (?,?, 'transcript', ?,?,?,?)")
      .run(studentId, by.id, row.filename, row.mime, row.size, row.stored_name);
    d.prepare('DELETE FROM transcript_inbox WHERE id = ?').run(id);
  });
  await afterTranscript(studentId, by, row.filename, 'Bulk upload, student confirmed by staff');
  return true;
}

/** Throw away an unmatched transcript (e.g. uploaded by mistake). */
export function discardInbox(id: number) {
  const row = inboxFile(id);
  if (!row) return;
  db().prepare('DELETE FROM transcript_inbox WHERE id = ?').run(id);
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(row.stored_name))); } catch { /* already gone */ }
}

/**
 * Take holds off a student's prerequisite reviews (back into the counselor's queue). Notifies the counselor who
 * set each hold. Returns the classes released.
 */
export async function releaseHolds(studentId: number, kinds: PrereqHold[], by: Actor, reason: string, only?: { courseId: number; termId: number | null }): Promise<string[]> {
  const d = db();
  const held = (d.prepare(`SELECT r.course_id, r.term_id, r.prereq_hold_by, c.code FROM course_requests r JOIN courses c ON c.id = r.course_id
    WHERE r.student_id = ? AND r.archived_at IS NULL AND r.prereq_status IS NULL AND r.prereq_hold IN (${kinds.map(() => '?').join(',')})`)
    .all(studentId, ...kinds) as { course_id: number; term_id: number | null; prereq_hold_by: number | null; code: string }[])
    .filter((r) => !only || (r.course_id === only.courseId && r.term_id === only.termId));
  if (!held.length) return [];
  const clear = d.prepare('UPDATE course_requests SET prereq_hold = NULL, prereq_hold_note = NULL, prereq_hold_by = NULL, prereq_hold_at = NULL WHERE student_id = ? AND course_id = ? AND term_id IS ?');
  for (const r of held) {
    clear.run(studentId, r.course_id, r.term_id);
    logEvent(studentId, by, `Prerequisite review of ${r.code} back in the counselor queue`, reason, [r.term_id]);
  }
  const s = d.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(studentId) as { first_name: string; last_name: string };
  const counselors = [...new Set(held.map((r) => r.prereq_hold_by).filter((x): x is number => !!x && x !== by.id))];
  await notifyUsers(counselors, 'prereq', studentId,
    `${s.first_name} ${s.last_name}: ${reason.toLowerCase()}. Prerequisite review of ${held.map((r) => r.code).join(', ')} is back in the queue.`);
  return held.map((r) => r.code);
}
