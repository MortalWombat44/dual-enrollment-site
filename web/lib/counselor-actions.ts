'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { canSeeStudent } from './access';
import { completeStep, currentClassYear, getProgress, GRADES, requestChanges } from './workflow';
import { db, tx } from './db';
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

/**
 * High school approval, per class per term: staff approve or decline each pending class and sign digitally
 * (saved, drawn, or typed in cursive). Declined classes come off the request and the student picks again,
 * with the note; classes already approved stay approved.
 */
export async function approve(formData: FormData) {
  const { me, studentId, note, name } = await guard(formData);
  const p = getProgress(studentId)!;
  const pending = p.courses.filter((c) => c.hs_status === 'pending');
  const decision = (c: { id: number; term_id: number | null }) => String(formData.get(`d_${c.id}_${c.term_id ?? 0}`) || '');
  if (pending.some((c) => !['approve', 'decline'].includes(decision(c)))) redirect(`/counselor?student=${studentId}&error=decide`);
  const approved = pending.filter((c) => decision(c) === 'approve');
  const declined = pending.filter((c) => decision(c) === 'decline');
  if (declined.length && !note) redirect(`/counselor?student=${studentId}&error=note`);

  let signatureFile: number | null = null;
  const mode = String(formData.get('sign_mode') || '');
  const signedName = String(formData.get('signed_name') || '').trim().slice(0, 80) || `${me.first_name} ${me.last_name}`;
  if (approved.length) {
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
  }
  const method = mode === 'type' ? 'typed' : mode === 'saved' ? 'saved' : 'drawn';
  const at = new Date().toISOString();
  tx(() => {
    const ok = db().prepare(`UPDATE course_requests SET hs_status = 'approved', hs_by = ?, hs_at = ?, hs_signed_name = ?, hs_signature_file_id = ?, hs_sign_method = ?
      WHERE student_id = ? AND course_id = ? AND term_id IS ?`);
    for (const c of approved) ok.run(me.id, at, signedName, signatureFile, method, studentId, c.id, c.term_id);
    const del = db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?');
    for (const c of declined) del.run(studentId, c.id, c.term_id);
  });
  if (declined.length) {
    requestChanges(studentId, 4, me, `${declined.map((c) => `${c.code} (${c.term_name ?? 'no term'})`).join(', ')} not approved: ${note}`);
    redirect(`/counselor?done=changes&name=${encodeURIComponent(name)}`);
  }
  completeStep(studentId, 4, {
    counselor_id: me.id, note, signed_name: signedName, signature_file_id: signatureFile, sign_method: method, signed_at: at,
    classes: approved.map((c) => `${c.code} (${c.term_name})`),
  }, true);
  redirect(`/counselor?done=approved&name=${encodeURIComponent(name)}`);
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
