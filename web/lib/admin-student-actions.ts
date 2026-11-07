'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { db, tx } from './db';
import { completeStep, getProgress, moveStudentSchool, reopenFrom, requestChanges, STUDENT_STEP_IDS } from './workflow';

/** Where to send the admin back to, keeping their place in the queue. */
function back(formData: FormData, extra: Record<string, string> = {}) {
  const u = new URLSearchParams();
  for (const k of ['tab', 'school', 'term', 'q']) {
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
  // school_id records which school the student was at, for the Reports page.
  completeStep(studentId, 7, { admin_id: me.id, school_id: p.school.id, note, units: p.courses.reduce((n, c) => n + c.units, 0) }, true);
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
  const data: Record<string, unknown> = { admin_id: me.id, school_id: p.school.id, override: true };
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
  const offered = db().prepare("SELECT 1 FROM courses WHERE id = ? AND active = 1 AND (kind = 'ce' OR (kind = 'de' AND school_id = ?))").get(courseId, p.school.id);
  if (!offered) redirect(back(formData));
  const termId = Number(formData.get('termId'));
  if (!db().prepare('SELECT 1 FROM terms WHERE id = ?').get(termId)) redirect(back(formData));
  db().prepare('INSERT OR IGNORE INTO course_requests (student_id, course_id, term_id) VALUES (?,?,?)').run(studentId, courseId, termId);
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
  moveStudentSchool(studentId, schoolId);
  redirect(back(formData, { done: 'moved_school' }));
}

/** Answer a student's request to change their high school. */
export async function approveSchoolChange(formData: FormData) {
  return decideSchoolChange(formData, true);
}
export async function declineSchoolChange(formData: FormData) {
  return decideSchoolChange(formData, false);
}
async function decideSchoolChange(formData: FormData, approve: boolean) {
  const { me, studentId } = await load(formData);
  const req = db().prepare("SELECT id, to_school_id FROM school_change_requests WHERE student_id = ? AND status = 'open'").get(studentId) as { id: number; to_school_id: number } | undefined;
  if (!req) redirect(back(formData));
  if (approve) moveStudentSchool(studentId, req.to_school_id);
  db().prepare('UPDATE school_change_requests SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?').run(approve ? 'approved' : 'declined', me.id, new Date().toISOString(), req.id);
  redirect(back(formData, { done: approve ? 'school_change_approved' : 'school_change_declined' }));
}

/** Fix a student's Shasta College ID (e.g. when the same ID shows up on two accounts). */
export async function setStudentNumber(formData: FormData) {
  const { studentId } = await load(formData);
  const num = String(formData.get('student_number') || '').trim().slice(0, 20) || null;
  if (num && !/^[A-Za-z0-9-]+$/.test(num)) redirect(back(formData, { error: 'id' }));
  db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(num, studentId);
  redirect(back(formData, { done: 'id_saved' }));
}

/** Change which term a requested class is in. */
export async function adminSetCourseTerm(formData: FormData) {
  const { studentId } = await load(formData);
  const termId = Number(formData.get('termId'));
  if (!db().prepare('SELECT 1 FROM terms WHERE id = ?').get(termId)) redirect(back(formData));
  db().prepare('UPDATE course_requests SET term_id = ? WHERE student_id = ? AND course_id = ?').run(termId, studentId, Number(formData.get('courseId')));
  redirect(back(formData, { done: 'course_term' }));
}
