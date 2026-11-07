'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { db, tx } from './db';
import { completeStep, getProgress, reopenFrom, requestChanges, schoolModes, STUDENT_STEP_IDS } from './workflow';

/** Where to send the admin back to, keeping their place in the queue. */
function back(formData: FormData, extra: Record<string, string> = {}) {
  const u = new URLSearchParams();
  for (const k of ['tab', 'school', 'q']) {
    const v = String(formData.get(k) || '');
    if (v) u.set(k, v);
  }
  u.set('student', String(formData.get('studentId')));
  for (const [k, v] of Object.entries(extra)) u.set(k, v);
  return `/admin/students?${u}`;
}

async function load(formData: FormData) {
  const me = await requireAdmin('college');
  const studentId = Number(formData.get('studentId'));
  const p = getProgress(studentId);
  if (!p) redirect('/admin/students');
  const note = String(formData.get('note') || '').trim().slice(0, 1000);
  return { me, studentId, p, note };
}

/** Step 7 · Clear units */
export async function clearUnits(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (p.steps.find((s) => s.id === 7)?.status !== 'in_review') redirect(back(formData));
  completeStep(studentId, 7, { admin_id: me.id, note, units: p.courses.reduce((n, c) => n + c.units, 0) }, true);
  redirect(back(formData, { done: 'cleared' }));
}

/** Clear units / Prerequisite review · send the courses back to the student. */
export async function sendBackToStudent(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  const stepId = Number(formData.get('stepId'));
  if (![7, 8].includes(stepId) || p.steps.find((s) => s.id === stepId)?.status !== 'in_review') redirect(back(formData));
  if (!note) redirect(back(formData, { error: 'note' }));
  requestChanges(studentId, stepId, me, note);
  redirect(back(formData, { done: 'sent_back' }));
}

/** Step 8 · Prerequisite review, college counselors only. Declined classes come off the request. */
export async function decidePrerequisites(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (!me.is_college_counselor) redirect(back(formData, { error: 'not_counselor' }));
  if (p.steps.find((s) => s.id === 8)?.status !== 'in_review') redirect(back(formData));
  const prereq = p.courses.filter((c) => c.prerequisite);
  const decisions = prereq.map((c) => ({ id: c.id, code: c.code, decision: formData.get(`course_${c.id}`) === 'decline' ? 'declined' : 'approved' }));
  if (prereq.some((c) => !formData.get(`course_${c.id}`))) redirect(back(formData, { error: 'decide' }));
  const declined = decisions.filter((d) => d.decision === 'declined');
  if (declined.length && !note) redirect(back(formData, { error: 'note' }));
  tx(() => {
    const del = db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ?');
    for (const d of declined) del.run(studentId, d.id);
  });
  const remaining = p.courses.length - declined.length;
  if (remaining === 0) {
    // Nothing left to take: the student picks again.
    requestChanges(studentId, 8, me, note);
    redirect(back(formData, { done: 'sent_back' }));
  }
  completeStep(studentId, 8, { admin_id: me.id, note, decisions }, true);
  redirect(back(formData, { done: 'prereq' }));
}

/** Override · move a step forward (mark it complete). */
export async function adminCompleteStep(formData: FormData) {
  const { me, studentId, p } = await load(formData);
  const stepId = Number(formData.get('stepId'));
  const s = p.steps.find((x) => x.id === stepId);
  if (!s || s.status === 'complete') redirect(back(formData));
  const data: Record<string, unknown> = { admin_id: me.id, override: true };
  if (stepId === 3) Object.assign(data, { method: 'office', signer: 'On file with Shasta College' });
  if (stepId === 1) data.confirmation = 'Verified by Shasta College';
  db().prepare("DELETE FROM step_progress WHERE student_id = ? AND status = 'changes_requested'").run(studentId);
  completeStep(studentId, stepId, data, true);
  redirect(back(formData, { done: 'moved' }));
}

/** Override · move a step backward (reopen it and every step after it). */
export async function adminReopenStep(formData: FormData) {
  const { studentId } = await load(formData);
  const stepId = Number(formData.get('stepId'));
  if (!STUDENT_STEP_IDS.includes(stepId)) redirect(back(formData));
  reopenFrom(studentId, stepId);
  redirect(back(formData, { done: 'reopened' }));
}

export async function adminAddCourse(formData: FormData) {
  const { studentId, p } = await load(formData);
  const courseId = Number(formData.get('courseId'));
  const offered = db().prepare('SELECT 1 FROM school_courses WHERE school_id = ? AND course_id = ?').get(p.school.id, courseId);
  if (!offered) redirect(back(formData));
  db().prepare('INSERT OR IGNORE INTO course_requests (student_id, course_id) VALUES (?,?)').run(studentId, courseId);
  redirect(back(formData, { done: 'course_added' }));
}

export async function adminRemoveCourse(formData: FormData) {
  const { studentId } = await load(formData);
  db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ?').run(studentId, Number(formData.get('courseId')));
  redirect(back(formData, { done: 'course_removed' }));
}

/** Move a student to another school: new counselor, and that school's step rules from here on. */
export async function reassignSchool(formData: FormData) {
  const { studentId, p } = await load(formData);
  const schoolId = Number(formData.get('schoolId'));
  if (!schoolId || schoolId === p.school.id || !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(schoolId)) redirect(back(formData));
  tx(() => {
    const counselor = db()
      .prepare("SELECT id FROM users WHERE role = 'counselor' AND school_id = ? ORDER BY status = 'active' DESC, id LIMIT 1")
      .get(schoolId) as { id: number } | undefined;
    db().prepare('UPDATE users SET school_id = ?, counselor_id = ? WHERE id = ?').run(schoolId, counselor?.id ?? null, studentId);
    db().prepare('UPDATE enrollments SET step_modes = ? WHERE student_id = ? AND step_modes IS NOT NULL').run(JSON.stringify(schoolModes(schoolId)), studentId);
  });
  redirect(back(formData, { done: 'moved_school' }));
}
