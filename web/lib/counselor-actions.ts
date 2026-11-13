'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { canSeeStudent } from './access';
import { currentClassYear, getProgress, GRADES } from './workflow';
import { applyHsDecisions } from './hs-approval';
import { db, tx } from './db';
import { saveFile, sniff } from './files';
import { actorOf, logEvent } from './audit';
import { addTranscript, readUpload } from './transcripts';

async function guard(formData: FormData) {
  const me = await requireRole('counselor');
  const studentId = Number(formData.get('studentId'));
  if (!canSeeStudent(me, studentId)) redirect('/counselor');
  const p = getProgress(studentId);
  if (p?.steps.find((s) => s.id === 4)?.status !== 'in_review') redirect(`/counselor?student=${studentId}`);
  const note = String(formData.get('note') || '').trim().slice(0, 1000);
  return { me, studentId, note, name: p!.student.first_name };
}

/**
 * High school approval, per class per term: staff approve or decline each pending class and sign digitally
 * (saved, drawn, or typed in cursive). Declined classes come off the request and the student picks again,
 * with the note; classes already approved stay approved.
 */
export async function approve(formData: FormData) {
  const { me, studentId, name } = await guard(formData);
  const r = applyHsDecisions(studentId, formData, { id: me.id, name: `${me.first_name} ${me.last_name}`, savedSignatureId: me.signature_file_id },
    (code) => redirect(`/counselor?student=${studentId}&error=${code}`));
  redirect(`/counselor?done=${r}&name=${encodeURIComponent(name)}`);
}

async function staffFor(formData: FormData) {
  const me = await requireRole('counselor');
  const studentId = Number(formData.get('studentId'));
  if (!canSeeStudent(me, studentId)) redirect('/counselor');
  return { me, studentId, back: (q: string) => redirect(`/counselor?student=${studentId}&${q}`) };
}

/** High school staff: update a student's grade and graduation year (counts as this year's confirmation). */
export async function staffSetGrade(formData: FormData) {
  const { me, studentId, back } = await staffFor(formData);
  const grade = Number(formData.get('grade'));
  const y = Number(formData.get('grad_year'));
  if (!GRADES.includes(grade) || !Number.isInteger(y) || y < 2000 || y > 2100) back('error=grade');
  db().prepare('UPDATE users SET grade = ?, grad_year = ?, grade_confirmed_year = ? WHERE id = ?').run(grade, y, currentClassYear(), studentId);
  logEvent(studentId, actorOf(me), 'Grade and graduation year updated', `Grade ${grade}, class of ${y}`);
  back('done=grade');
}

/** High school staff: ask Shasta College to change a student's Shasta College ID (an admin approves it). */
export async function requestIdChange(formData: FormData) {
  const { me, studentId, back } = await staffFor(formData);
  const num = String(formData.get('new_number') || '').trim().slice(0, 20);
  const note = String(formData.get('note') || '').trim().slice(0, 500) || null;
  if (!/^[A-Za-z0-9-]{4,20}$/.test(num)) back('error=id');
  const cur = (db().prepare('SELECT student_number FROM users WHERE id = ?').get(studentId) as { student_number: string | null }).student_number;
  db().prepare("DELETE FROM id_change_requests WHERE student_id = ? AND status = 'open'").run(studentId);
  db().prepare('INSERT INTO id_change_requests (student_id, requested_by, current_number, new_number, note, created_at) VALUES (?,?,?,?,?,?)')
    .run(studentId, me.id, cur, num, note, new Date().toISOString());
  logEvent(studentId, actorOf(me), 'Asked Shasta College to change the Shasta College ID', `${cur ?? 'none'} → ${num}${note ? ` · ${note}` : ''}`);
  back('done=id_request');
}

/** High school staff upload a transcript on the student's behalf (for Shasta College's prerequisite review). */
export async function staffUploadTranscript(formData: FormData) {
  const { me, studentId, back } = await staffFor(formData);
  const f = await readUpload(formData.get('transcript'));
  if ('error' in f) back(`error=tr_${f.error}`);
  await addTranscript(studentId, { ...actorOf(me), id: me.id }, f as { buf: Buffer; mime: string; name: string }, 'Uploaded by high school staff');
  back('done=transcript');
}
