'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { canSeeStudent } from './access';
import { completeStep, currentClassYear, getProgress, GRADES, requestChanges } from './workflow';
import { db } from './db';
import { saveFile, sniff } from './files';

async function guard(formData: FormData) {
  const me = await requireRole('counselor');
  const studentId = Number(formData.get('studentId'));
  if (!canSeeStudent(me, studentId)) redirect('/counselor');
  const p = getProgress(studentId);
  if (p?.steps.find((s) => s.id === 4)?.status !== 'in_review') redirect(`/counselor?student=${studentId}`);
  const note = String(formData.get('note') || '').trim().slice(0, 1000);
  return { me, studentId, note, name: p!.student.first_name };
}

/** "Approve & sign digitally": the approval keeps the staff member's signature (saved, drawn or typed in cursive). */
export async function approve(formData: FormData) {
  const { me, studentId, note, name } = await guard(formData);
  const mode = String(formData.get('sign_mode') || '');
  const signedName = String(formData.get('signed_name') || '').trim().slice(0, 80) || `${me.first_name} ${me.last_name}`;
  let signatureFile: number | null = null;
  if (mode === 'saved' && me.signature_file_id) {
    signatureFile = me.signature_file_id;
  } else {
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(formData.get('signature') || ''));
    const buf = m ? Buffer.from(m[1], 'base64') : null;
    if (!buf || buf.length > 2 * 1024 * 1024 || sniff(buf) !== 'image/png') redirect(`/counselor?student=${studentId}&error=signature`);
    signatureFile = saveFile({ studentId, uploadedBy: me.id, kind: 'hs_signature', filename: 'hs-approval-signature.png', mime: 'image/png', data: buf! });
    if (formData.get('save_signature') === 'on') {
      // A staff copy (kept under the staff member's own id) becomes their saved signature.
      const mine = saveFile({ studentId: me.id, uploadedBy: me.id, kind: 'staff_signature', filename: 'my-signature.png', mime: 'image/png', data: buf! });
      db().prepare('UPDATE users SET signature_file_id = ? WHERE id = ?').run(mine, me.id);
    }
  }
  completeStep(studentId, 4, {
    counselor_id: me.id, note, signed_name: signedName, signature_file_id: signatureFile,
    sign_method: mode === 'type' ? 'typed' : mode === 'saved' ? 'saved' : 'drawn', signed_at: new Date().toISOString(),
  }, true);
  redirect(`/counselor?done=approved&name=${encodeURIComponent(name)}`);
}

export async function sendBack(formData: FormData) {
  const { me, studentId, note, name } = await guard(formData);
  if (!note) redirect(`/counselor?student=${studentId}&error=note`);
  requestChanges(studentId, 4, me, note);
  redirect(`/counselor?done=changes&name=${encodeURIComponent(name)}`);
}

async function staffFor(formData: FormData) {
  const me = await requireRole('counselor');
  const studentId = Number(formData.get('studentId'));
  if (!canSeeStudent(me, studentId)) redirect('/counselor');
  return { me, studentId, back: (q: string) => redirect(`/counselor?student=${studentId}&${q}`) };
}

/** High school staff: update a student's grade and graduation year (counts as this year's confirmation). */
export async function staffSetGrade(formData: FormData) {
  const { studentId, back } = await staffFor(formData);
  const grade = Number(formData.get('grade'));
  const y = Number(formData.get('grad_year'));
  if (!GRADES.includes(grade) || !Number.isInteger(y) || y < 2000 || y > 2100) back('error=grade');
  db().prepare('UPDATE users SET grade = ?, grad_year = ?, grade_confirmed_year = ? WHERE id = ?').run(grade, y, currentClassYear(), studentId);
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
  back('done=id_request');
}
