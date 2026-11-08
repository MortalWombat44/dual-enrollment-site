'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { db, tx } from './db';
import { addRequest, ceCourse, currentClassYear, parseCe, youngRecommendation, type YoungRec, GRADES, completeStep, getProgress, moveStudentSchool, reopenFrom, requestChanges, STUDENT_STEP_IDS } from './workflow';

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
  // CCAP only: "cleared for the maximum units" for the terms of these classes, so Clear units doesn't come back for them.
  const maxUnits = p.school.designation === 'CCAP' && formData.get('max_units') === 'on';
  if (maxUnits) {
    const ins = db().prepare('INSERT OR REPLACE INTO unit_clearances (student_id, term_id, cleared_by, cleared_at) VALUES (?,?,?,?)');
    const at = new Date().toISOString();
    for (const t of p.requestTerms) ins.run(studentId, t.id, me.id, at);
  }
  completeStep(studentId, 7, { admin_id: me.id, school_id: p.school.id, note, units: p.courses.reduce((n, c) => n + c.units, 0), max_units: maxUnits || undefined }, true);
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
  // One decision per class per term (the same class can be requested in two terms).
  const prereq = p.courses.filter((c) => c.prerequisite);
  const field = (c: { id: number; term_id: number | null }) => `course_${c.id}_${c.term_id ?? 0}`;
  if (prereq.some((c) => !['approve', 'decline'].includes(String(formData.get(field(c)) || '')))) redirect(back(formData, { error: 'decide' }));
  const decisions = prereq.map((c) => ({ id: c.id, term_id: c.term_id, code: c.code, term: c.term_name, decision: formData.get(field(c)) === 'decline' ? 'declined' : 'approved' }));
  const declined = decisions.filter((d) => d.decision === 'declined');
  if (declined.length && !note) redirect(back(formData, { error: 'note' }));
  tx(() => {
    const del = db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?');
    for (const d of declined) del.run(studentId, d.id, d.term_id);
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

/** Young student review, part 1: a college counselor recommends (or not) and gives feedback. */
export async function recommendYoung(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (!me.is_college_counselor) redirect(back(formData, { error: 'not_counselor_young' }));
  if (p.steps.find((s) => s.id === 10)?.status !== 'in_review' || youngRecommendation(studentId)) redirect(back(formData));
  const rec = formData.get('rec');
  if (rec !== 'recommend' && rec !== 'not_recommend') redirect(back(formData, { error: 'decide' }));
  if (!note) redirect(back(formData, { error: 'feedback' }));
  const data: YoungRec = { rec_by: me.id, rec: rec as YoungRec['rec'], rec_note: note, rec_at: new Date().toISOString() };
  db().prepare('INSERT OR REPLACE INTO young_reviews (student_id, rec_by, rec, rec_note, rec_at) VALUES (?,?,?,?,?)')
    .run(studentId, data.rec_by, data.rec, data.rec_note, data.rec_at);
  redirect(back(formData, { done: 'young_rec' }));
}

/** Young student review, part 2: a Young Student Approver (not the recommender) approves or declines. */
export async function decideYoung(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (!me.is_young_approver) redirect(back(formData, { error: 'not_young_approver' }));
  const rec = youngRecommendation(studentId);
  if (p.steps.find((s) => s.id === 10)?.status !== 'in_review' || !rec) redirect(back(formData));
  if (rec!.rec_by === me.id) redirect(back(formData, { error: 'same_person' }));
  const decision = formData.get('decision');
  if (decision === 'approve') {
    completeStep(studentId, 10, { ...rec, admin_id: me.id, decision: 'approved', note }, true);
    db().prepare('DELETE FROM young_reviews WHERE student_id = ?').run(studentId);
    redirect(back(formData, { done: 'young_approved' }));
  }
  if (decision !== 'decline') redirect(back(formData, { error: 'decide' }));
  if (!note) redirect(back(formData, { error: 'note' }));
  requestChanges(studentId, 10, me, note);
  redirect(back(formData, { done: 'young_declined' }));
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
  if (stepId === 5) {
    // Register is per term: mark every term of the student's classes as registered (by this admin).
    const ins = db().prepare('INSERT OR IGNORE INTO registrations (student_id, term_id, registered_at, marked_by) VALUES (?,?,?,?)');
    for (const t of p.requestTerms) ins.run(studentId, t.id, new Date().toISOString(), me.id);
  }
  if (stepId === 4) {
    // High school approval is per class: the override marks every pending class approved by Shasta College (no HS signature).
    db().prepare(`UPDATE course_requests SET hs_status = 'approved', hs_by = ?, hs_at = ?, hs_signed_name = NULL, hs_signature_file_id = NULL, hs_sign_method = 'admin'
      WHERE student_id = ? AND hs_status = 'pending'`).run(me.id, new Date().toISOString(), studentId);
  }
  completeStep(studentId, stepId, data, true);
  redirect(back(formData, { done: 'moved' }));
}

/** Override · move a step backward (reopen it and every step after it). */
export async function adminReopenStep(formData: FormData) {
  const { studentId, p } = await load(formData);
  const stepId = Number(formData.get('stepId'));
  if (!STUDENT_STEP_IDS.includes(stepId)) redirect(back(formData));
  if (stepId === 4) {
    // High school approval lives on each class and can't be undone here: say which classes were already approved.
    const approved = p.courses.filter((c) => c.hs_status === 'approved').map((c) => `${c.code} (${c.term_name ?? 'no term'})`);
    redirect(back(formData, { done: 'hs_already', classes: approved.join(', ') }));
  }
  reopenFrom(studentId, stepId);
  redirect(back(formData, { done: 'reopened' }));
}

export async function adminAddCourse(formData: FormData) {
  const { studentId, p } = await load(formData);
  const termId = Number(formData.get('termId'));
  if (!db().prepare('SELECT 1 FROM terms WHERE id = ?').get(termId)) redirect(back(formData));
  let courseId: number;
  if (formData.has('ce_code')) {
    // Concurrent class typed in by the admin (code + units).
    const e = parseCe(formData.get('ce_code'), '', formData.get('ce_units'), '0');
    if (!e) redirect(back(formData, { error: 'ce' }));
    courseId = ceCourse(e!);
  } else {
    courseId = Number(formData.get('courseId'));
    if (!db().prepare("SELECT 1 FROM courses WHERE id = ? AND active = 1 AND kind = 'de' AND school_id = ?").get(courseId, p.school.id)) redirect(back(formData));
  }
  addRequest(studentId, courseId, termId);
  redirect(back(formData, { done: 'course_added' }));
}

export async function adminRemoveCourse(formData: FormData) {
  const { studentId } = await load(formData);
  const from = Number(formData.get('fromTermId')) || null;
  db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?').run(studentId, Number(formData.get('courseId')), from);
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
  const from = Number(formData.get('fromTermId')) || null;
  if (from === termId) redirect(back(formData));
  // A class in a new term needs its own high school approval.
  db().prepare(`UPDATE OR IGNORE course_requests SET term_id = ?, hs_status = 'pending', hs_by = NULL, hs_at = NULL, hs_signed_name = NULL, hs_signature_file_id = NULL, hs_sign_method = NULL
    WHERE student_id = ? AND course_id = ? AND term_id IS ?`).run(termId, studentId, Number(formData.get('courseId')), from);
  redirect(back(formData, { done: 'course_term' }));
}

/** Fix a student's graduation year. */
export async function setGradYear(formData: FormData) {
  const { studentId } = await load(formData);
  const y = Number(formData.get('grad_year'));
  const grade = Number(formData.get('grade'));
  if (!Number.isInteger(y) || y < 2000 || y > 2100) redirect(back(formData));
  if (GRADES.includes(grade)) {
    // An admin setting the grade counts as this year's confirmation.
    db().prepare('UPDATE users SET grad_year = ?, grade = ?, grade_confirmed_year = ? WHERE id = ?').run(y, grade, currentClassYear(), studentId);
  } else {
    db().prepare('UPDATE users SET grad_year = ? WHERE id = ?').run(y, studentId);
  }
  redirect(back(formData, { done: 'grad_saved' }));
}

/** Answer a high school staff request to change a student's Shasta College ID. */
export async function approveIdChange(formData: FormData) { return decideIdChange(formData, true); }
export async function declineIdChange(formData: FormData) { return decideIdChange(formData, false); }
async function decideIdChange(formData: FormData, approve: boolean) {
  const { me, studentId } = await load(formData);
  const req = db().prepare("SELECT id, new_number FROM id_change_requests WHERE student_id = ? AND status = 'open'").get(studentId) as { id: number; new_number: string } | undefined;
  if (!req) redirect(back(formData));
  tx(() => {
    if (approve) db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(req!.new_number, studentId);
    db().prepare('UPDATE id_change_requests SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?').run(approve ? 'approved' : 'declined', me.id, new Date().toISOString(), req!.id);
  });
  redirect(back(formData, { done: approve ? 'id_change_approved' : 'id_change_declined' }));
}
