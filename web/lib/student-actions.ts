'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { cryptoToken, db, tx } from './db';
import { completeStep, getProgress, schoolCourses } from './workflow';

import { MAX_UNITS } from './constants';

async function stepFor(stepId: number, allowed: string[]) {
  const me = await requireRole('student');
  const p = getProgress(me.id);
  const s = p?.steps.find((x) => x.id === stepId);
  if (!p || !s || !allowed.includes(s.status)) redirect(`/student/steps/${stepId}`);
  return { me, p, s };
}

export async function submitCccapply(formData: FormData) {
  const { me } = await stepFor(1, ['current']);
  const conf = String(formData.get('confirmation') || '').trim();
  if (!/^[A-Za-z0-9-]{4,40}$/.test(conf)) redirect('/student/steps/1?error=confirmation');
  completeStep(me.id, 1, { confirmation: conf });
  redirect('/student/steps/1/complete');
}

export async function submitCourses(formData: FormData) {
  const { me, p } = await stepFor(2, ['current', 'changes']);
  const offered = new Map(schoolCourses(p.school.id).map((c) => [c.id, c]));
  const picked = [...new Set(formData.getAll('course').map(Number))].filter((id) => offered.has(id));
  const units = picked.reduce((n, id) => n + offered.get(id)!.units, 0);
  if (picked.length === 0) redirect('/student/steps/2?error=none');
  if (units > MAX_UNITS) redirect('/student/steps/2?error=units');
  tx(() => {
    db().prepare('DELETE FROM course_requests WHERE student_id = ?').run(me.id);
    const ins = db().prepare('INSERT INTO course_requests (student_id, course_id) VALUES (?,?)');
    for (const id of picked) ins.run(me.id, id);
    db().prepare("DELETE FROM step_progress WHERE student_id = ? AND step_id = 4 AND status = 'changes_requested'").run(me.id);
  });
  completeStep(me.id, 2, { units });
  redirect('/student/steps/2/complete');
}

export async function confirmRegistered(formData: FormData) {
  const { me } = await stepFor(5, ['current']);
  const crns = String(formData.get('crns') || '').trim().slice(0, 200);
  completeStep(me.id, 5, { crns });
  redirect('/student/steps/5/complete');
}

export async function finishTextbooks() {
  const { me } = await stepFor(6, ['current']);
  completeStep(me.id, 6, null);
  redirect('/student/steps/6/complete');
}

export async function setParentSharing(formData: FormData) {
  const me = await requireRole('student');
  const on = formData.get('share') === 'on';
  db().prepare('UPDATE users SET share_with_parents = ? WHERE id = ?').run(on ? 1 : 0, me.id);
  redirect(`/student/account?saved=${on ? 'on' : 'off'}`);
}

/** Student invites a parent / guardian. Reuses an existing parent account with that email (e.g. a sibling's parent). */
export async function inviteParent(formData: FormData) {
  const me = await requireRole('student');
  const first = String(formData.get('first') || '').trim().slice(0, 60);
  const last = String(formData.get('last') || '').trim().slice(0, 60);
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 200);
  const fail = (e: string) => redirect(`/student/steps/3?invite_error=${e}`);
  if (!first || !last) fail('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email');
  if (email === me.email.toLowerCase()) fail('self');
  const existing = db().prepare('SELECT id, role FROM users WHERE email = ?').get(email) as { id: number; role: string } | undefined;
  if (existing && existing.role !== 'parent') fail('taken');
  const parentId = tx(() => {
    let id = existing?.id;
    if (!id) {
      id = Number(db()
        .prepare("INSERT INTO users (first_name, last_name, email, role, school_id, status, invite_token) VALUES (?,?,?,'parent',?,'invited',?)")
        .run(first, last, email, me.school_id, cryptoToken()).lastInsertRowid);
    }
    db().prepare('INSERT OR IGNORE INTO parent_links (parent_id, student_id) VALUES (?,?)').run(id, me.id);
    return id;
  });
  redirect(`/student/steps/3?invited=${parentId}`);
}
