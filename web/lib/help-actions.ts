'use server';
import { redirect } from 'next/navigation';
import { requireAdmin, requireRole } from './auth';
import { canSeeStudent } from './access';
import { db } from './db';
import { raiseHelp } from './help';

const msg = (fd: FormData) => String(fd.get('message') || '').trim().replace(/\s+\n/g, '\n').slice(0, 1000);

/** A student says they need help, with where they're stuck. */
export async function studentAskHelp(formData: FormData) {
  const me = await requireRole('student');
  const back = String(formData.get('back') || '/student').startsWith('/student') ? String(formData.get('back') || '/student') : '/student';
  const m = msg(formData);
  if (m.length < 3) redirect(`${back}${back.includes('?') ? '&' : '?'}help=empty#help`);
  await raiseHelp(me.id, { id: me.id, role: 'student', name: `${me.first_name} ${me.last_name}` }, m);
  redirect(`${back}${back.includes('?') ? '&' : '?'}help=sent#help`);
}

/** High school staff flag a student for help from Shasta College. */
export async function staffFlagHelp(formData: FormData) {
  const me = await requireRole('counselor');
  const studentId = Number(formData.get('studentId'));
  if (!canSeeStudent(me, studentId)) redirect('/counselor');
  const m = msg(formData);
  if (m.length < 3) redirect(`/counselor?student=${studentId}&error=help`);
  await raiseHelp(studentId, { id: me.id, role: 'counselor', name: `${me.first_name} ${me.last_name}` }, m);
  redirect(`/counselor?student=${studentId}&done=help`);
}

/** A college admin resolves a help request, optionally with a reply the student sees. */
export async function resolveHelp(formData: FormData) {
  const me = await requireAdmin('college');
  const id = Number(formData.get('helpId'));
  const reply = String(formData.get('reply') || '').trim().slice(0, 1000) || null;
  const r = db().prepare("UPDATE help_requests SET status = 'resolved', resolved_by = ?, resolved_at = ?, reply = ? WHERE id = ? AND status = 'open'").run(me.id, new Date().toISOString(), reply, id);
  const sid = (db().prepare('SELECT student_id FROM help_requests WHERE id = ?').get(id) as { student_id: number } | undefined)?.student_id;
  const u = new URLSearchParams();
  for (const k of ['tab', 'school', 'term', 'q']) { const v = String(formData.get(k) || ''); if (v) u.set(k, v); }
  if (sid) u.set('student', String(sid));
  u.set('done', Number(r.changes) ? 'help_resolved' : 'help_already');
  redirect(`/admin/students?${u}`);
}
