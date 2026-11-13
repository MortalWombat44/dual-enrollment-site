'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { db, tx } from './db';
import { sendApproverLink } from './approver-links';
import { notifyLeads } from './notify';
import { clearNudges, nudgePrereq } from './nudge';
import { actorOf, logEvent } from './audit';
import { addTranscript, readUpload, releaseHolds } from './transcripts';
import { mailConfigured, sendMail } from './mail';
import { siteOrigin } from './site';
import { HOLD_LABEL, courseName, namesApprover, type PrereqHold } from './workflow';
import { setApprover, validApprover } from './approver-review';
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

/** Step 7 · College review & clear units */
export async function clearUnits(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (p.steps.find((s) => s.id === 7)?.status !== 'in_review') redirect(back(formData));
  // College review: the Shasta College ID (updated here if wrong) and Program (SACP), Start date (RGPE) and
  // Cohort (STAL) verified in Colleague, then units cleared.
  if (!['v_sacp', 'v_rgpe', 'v_stal'].every((k) => formData.get(k) === 'on')) redirect(back(formData, { error: 'verify' }));
  const num = String(formData.get('student_number') || '').trim().slice(0, 20);
  if (!/^[A-Za-z0-9-]{4,20}$/.test(num)) redirect(back(formData, { error: 'id' }));
  // Unlisted schools and homeschool: the named approver has to be reviewed before College review is cleared.
  if (namesApprover(p.school) && p.student.hs_approver_status !== 'approved') redirect(back(formData, { error: 'approver_review' }));
  const oldNum = p.student.student_number;
  if (num !== oldNum) db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(num, studentId);
  // school_id records which school the student was at, for the Reports page.
  // CCAP only: "cleared for the maximum units" for the terms of these classes, so Clear units doesn't come back for them.
  const maxUnits = p.school.designation === 'CCAP' && formData.get('max_units') === 'on';
  if (maxUnits) {
    const ins = db().prepare('INSERT OR REPLACE INTO unit_clearances (student_id, term_id, cleared_by, cleared_at) VALUES (?,?,?,?)');
    const at = new Date().toISOString();
    for (const t of p.requestTerms) ins.run(studentId, t.id, me.id, at);
  }
  const units = p.courses.reduce((n, c) => n + c.units, 0);
  completeStep(studentId, 7, {
    admin_id: me.id, school_id: p.school.id, note, units, max_units: maxUnits || undefined,
    verified: { student_number: num, id_changed_from: num !== oldNum ? oldNum : undefined, sacp: true, rgpe: true, stal: true },
  }, true);
  for (const t of p.requestTerms) {
    const termUnits = p.courses.filter((c) => c.term_id === t.id).reduce((n, c) => n + c.units, 0);
    logEvent(studentId, actorOf(me), 'College review done and units cleared', [
      `Verified Program (SACP), Start date (RGPE), Cohort (STAL) in Colleague`,
      `Shasta College ID ${num}${num !== oldNum ? ` (changed from ${oldNum ?? 'none'})` : ''}`,
      `${termUnits} units in ${t.name}`, maxUnits ? 'Cleared for the maximum units' : '', note ? `Note: ${note}` : '',
    ].filter(Boolean).join(' · '), [t.id]);
  }
  redirect(back(formData, { done: 'cleared' }));
}

/** Clear units / Prerequisite review · send the courses back to the student. */
export async function sendBackToStudent(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  const stepId = Number(formData.get('stepId'));
  if (![7, 8].includes(stepId) || p.steps.find((s) => s.id === stepId)?.status !== 'in_review') redirect(back(formData));
  if (!note) redirect(back(formData, { error: 'note' }));
  if (stepId === 8) clearNudges(studentId);
  logEvent(studentId, actorOf(me), `Sent back to the student from ${stepId === 7 ? 'College review' : 'Prerequisite review'}`, note, 'student');
  requestChanges(studentId, stepId, me, note);
  redirect(back(formData, { done: 'sent_back' }));
}

/**
 * Step 8 · Prerequisite review, college counselors only. For each class: approve, decline (comes off the request),
 * or put it on hold until the student responds: "More information needed" or "Appointment with a college counselor
 * required". Classes already on hold can be left as they are.
 */
export async function decidePrerequisites(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (!me.is_college_counselor) redirect(back(formData, { error: 'not_counselor' }));
  if (p.steps.find((s) => s.id === 8)?.status !== 'in_review') redirect(back(formData));
  // One decision per class per term (the same class can be requested in two terms). Classes already approved stay approved.
  const prereq = p.courses.filter((c) => c.needs_prereq && c.prereq_status !== 'approved');
  const field = (c: { id: number; term_id: number | null }) => `course_${c.id}_${c.term_id ?? 0}`;
  const choice = (c: (typeof prereq)[number]) => String(formData.get(field(c)) || (c.prereq_hold ? 'keep' : ''));
  if (!prereq.length || prereq.some((c) => !['approve', 'decline', 'info', 'appointment', 'keep'].includes(choice(c)))) redirect(back(formData, { error: 'decide' }));
  const decisions = prereq.map((c) => ({ id: c.id, term_id: c.term_id, code: c.code, term: c.term_name, choice: choice(c),
    decision: choice(c) === 'decline' ? 'declined' : choice(c) === 'approve' ? 'approved' : 'on_hold' }));
  const declined = decisions.filter((d) => d.choice === 'decline');
  const holds = decisions.filter((d) => d.choice === 'info' || d.choice === 'appointment');
  if (declined.length && !note) redirect(back(formData, { error: 'note' }));
  if (holds.some((d) => d.choice === 'info') && !note) redirect(back(formData, { error: 'info_note' }));
  // Approving needs the student cleared in NCWS first (declining or a hold doesn't).
  const ncws = formData.get('ncws') === 'on';
  if (decisions.some((d) => d.decision === 'approved') && !ncws) redirect(back(formData, { error: 'ncws' }));
  const at = new Date().toISOString();
  const who = actorOf(me);
  tx(() => {
    const ok = db().prepare(`UPDATE course_requests SET prereq_status = 'approved', prereq_by = ?, prereq_at = ?, prereq_hold = NULL, prereq_hold_note = NULL,
      prereq_hold_by = NULL, prereq_hold_at = NULL WHERE student_id = ? AND course_id = ? AND term_id IS ?`);
    const hold = db().prepare(`UPDATE course_requests SET prereq_hold = ?, prereq_hold_note = ?, prereq_hold_by = ?, prereq_hold_at = ?, prereq_reply = NULL, prereq_reply_at = NULL
      WHERE student_id = ? AND course_id = ? AND term_id IS ?`);
    const del = db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?');
    for (const d of decisions) {
      if (d.choice === 'approve') {
        ok.run(me.id, at, studentId, d.id, d.term_id);
        logEvent(studentId, who, `Prerequisite approved for ${d.code}`, `Student cleared in NCWS${note ? ` · Note: ${note}` : ''}`, [d.term_id]);
      } else if (d.choice === 'decline') {
        del.run(studentId, d.id, d.term_id);
        logEvent(studentId, who, `Prerequisite declined for ${d.code}; class removed`, note, [d.term_id]);
      } else if (d.choice === 'info' || d.choice === 'appointment') {
        hold.run(d.choice, note || null, me.id, at, studentId, d.id, d.term_id);
        logEvent(studentId, who, `${HOLD_LABEL[d.choice as PrereqHold]}: ${d.code}`, note || null, [d.term_id]);
      }
    }
  });
  clearNudges(studentId);
  if (holds.length) await emailHold(p.student, holds.map((d) => d.code), holds.some((d) => d.choice === 'info') ? 'info' : 'appointment', note);
  const remaining = p.courses.length - declined.length;
  if (remaining === 0) {
    // Nothing left to take: the student picks again.
    requestChanges(studentId, 8, me, note);
    redirect(back(formData, { done: 'sent_back' }));
  }
  const waiting = decisions.filter((d) => d.decision === 'on_hold');
  if (!waiting.length) completeStep(studentId, 8, { admin_id: me.id, note, decisions, ncws_cleared: ncws }, true);
  redirect(back(formData, { done: waiting.length ? 'prereq_hold' : 'prereq' }));
}

/** Tell the student (when email is set up) that a counselor needs something before deciding. They also see it on their steps. */
async function emailHold(s: { email: string; first_name: string }, codes: string[], kind: PrereqHold, note: string) {
  if (!mailConfigured()) return;
  const what = kind === 'info'
    ? 'needs more information before deciding on the prerequisite'
    : 'needs you to make an appointment with a Shasta College counselor before deciding on the prerequisite';
  await sendMail({
    to: s.email,
    subject: `Dual Enrollment: ${HOLD_LABEL[kind]}`,
    text: `Hi ${s.first_name},\n\nA Shasta College counselor ${what} for ${codes.join(', ')}.${note ? `\n\nTheir note: ${note}` : ''}\n\nSee what to do: ${await siteOrigin()}/student/steps/8\n\nShasta College Dual Enrollment`,
  });
}

/** Take a class off hold and put it back in the counselor queue (e.g. after the student's appointment). */
export async function releasePrereqHold(formData: FormData) {
  const { me, studentId } = await load(formData);
  const courseId = Number(formData.get('courseId'));
  const termId = Number(formData.get('fromTermId')) || null;
  const r = await releaseHolds(studentId, ['info', 'appointment'], actorOf(me), `${me.first_name} ${me.last_name} put it back in the queue`, { courseId, termId });
  redirect(back(formData, { done: r.length ? 'hold_released' : 'hold_none' }));
}

/** A college admin uploads a transcript on the student's behalf. */
export async function adminUploadTranscript(formData: FormData) {
  const { me, studentId } = await load(formData);
  const f = await readUpload(formData.get('transcript'));
  if ('error' in f) redirect(back(formData, { error: `tr_${f.error}` }));
  await addTranscript(studentId, { ...actorOf(me), id: me.id }, f as { buf: Buffer; mime: string; name: string }, 'Uploaded by Shasta College');
  redirect(back(formData, { done: 'transcript' }));
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
  logEvent(studentId, actorOf(me), `Young student review: ${rec === 'recommend' ? 'recommended' : 'not recommended'}`, note, 'student');
  await notifyLeads('young', studentId, `${p.student.first_name} ${p.student.last_name} (young student): ${rec === 'recommend' ? 'recommended' : 'not recommended'} by ${me.first_name} ${me.last_name}. A Young Student Approver makes the final decision.`);
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
    logEvent(studentId, actorOf(me), 'Young student review: approved', note || null, 'student');
    db().prepare('DELETE FROM young_reviews WHERE student_id = ?').run(studentId);
    redirect(back(formData, { done: 'young_approved' }));
  }
  if (decision !== 'decline') redirect(back(formData, { error: 'decide' }));
  if (!note) redirect(back(formData, { error: 'note' }));
  logEvent(studentId, actorOf(me), 'Young student review: declined; sent back to Course selection', note, 'student');
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
  if (stepId === 8) {
    clearNudges(studentId);
    // Override: approve every class still waiting for prerequisite review.
    db().prepare(`UPDATE course_requests SET prereq_status = 'approved', prereq_by = ?, prereq_at = ?
      WHERE student_id = ? AND prereq_status IS NULL AND (prereq_flag = 1 OR course_id IN (SELECT id FROM courses WHERE prerequisite IS NOT NULL))`).run(me.id, new Date().toISOString(), studentId);
  }
  if (stepId === 11) {
    // Affidavit on file with Shasta College (no upload here).
    db().prepare("INSERT INTO affidavits (student_id, file_id, uploaded_by, uploaded_at, status, reviewed_by, reviewed_at, note) VALUES (?, NULL, ?, ?, 'approved', ?, ?, 'Marked complete by Shasta College')")
      .run(studentId, me.id, new Date().toISOString(), me.id, new Date().toISOString());
  }
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
  logEvent(studentId, actorOf(me), `Marked “${s!.short}” complete (staff override)`,
    stepId === 8 && p.courses.some((c) => c.needs_prereq && c.prereq_status !== 'approved')
      ? `Approved without counselor review: ${p.courses.filter((c) => c.needs_prereq && c.prereq_status !== 'approved').map((c) => c.code).join(', ')}` : null,
    [1, 3, 11].includes(stepId) ? [] : 'student');
  redirect(back(formData, { done: 'moved' }));
}

/** Override · move a step backward (reopen it and every step after it). */
export async function adminReopenStep(formData: FormData) {
  const { me, studentId, p } = await load(formData);
  const stepId = Number(formData.get('stepId'));
  if (!STUDENT_STEP_IDS.includes(stepId)) redirect(back(formData));
  if (stepId === 4) {
    // High school approval lives on each class and can't be undone here: say which classes were already approved.
    const approved = p.courses.filter((c) => c.hs_status === 'approved').map((c) => `${c.code} (${c.term_name ?? 'no term'})`);
    redirect(back(formData, { done: 'hs_already', classes: approved.join(', ') }));
  }
  const s = p.steps.find((x) => x.id === stepId);
  logEvent(studentId, actorOf(me), `Moved “${s?.short ?? 'a step'}” back (reopened it and the steps after it)`, null, [1, 3, 11].includes(stepId) ? [] : 'student');
  reopenFrom(studentId, stepId);
  redirect(back(formData, { done: 'reopened' }));
}

export async function adminAddCourse(formData: FormData) {
  const { me, studentId, p } = await load(formData);
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
    if (!db().prepare("SELECT 1 FROM courses WHERE id = ? AND active = 1 AND (kind = 'ce' OR (kind = 'de' AND school_id = ?))").get(courseId, p.school.id)) redirect(back(formData));
  }
  addRequest(studentId, courseId, termId, actorOf(me));
  redirect(back(formData, { done: 'course_added' }));
}

export async function adminRemoveCourse(formData: FormData) {
  const { me, studentId } = await load(formData);
  const from = Number(formData.get('fromTermId')) || null;
  logEvent(studentId, actorOf(me), `Removed ${courseName(Number(formData.get('courseId')))}`, null, [from]);
  db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?').run(studentId, Number(formData.get('courseId')), from);
  redirect(back(formData, { done: 'course_removed' }));
}

/** Move a student to another school: new counselor, and that school's step rules from here on. */
export async function reassignSchool(formData: FormData) {
  const { me, studentId, p } = await load(formData);
  const schoolId = Number(formData.get('schoolId'));
  if (!schoolId || schoolId === p.school.id || !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(schoolId)) redirect(back(formData));
  logEvent(studentId, actorOf(me), 'Moved to another high school', `${p.school.name} → ${(db().prepare('SELECT name FROM schools WHERE id = ?').get(schoolId) as { name: string }).name}`);
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
  const req = db().prepare("SELECT id, to_school_id, approver_name, approver_email FROM school_change_requests WHERE student_id = ? AND status = 'open'").get(studentId) as
    { id: number; to_school_id: number; approver_name: string | null; approver_email: string | null } | undefined;
  if (!req) redirect(back(formData));
  if (approve) {
    const cur = db().prepare('SELECT school_id FROM users WHERE id = ?').get(studentId) as { school_id: number | null } | undefined;
    if (req!.to_school_id !== cur?.school_id) moveStudentSchool(studentId, req!.to_school_id);
    // An unlisted ("Other") school or homeschool comes with the approver the student named, to be reviewed.
    db().prepare('UPDATE users SET hs_approver_name = ?, hs_approver_email = ?, hs_approver_status = ?, hs_approver_reviewed_by = NULL, hs_approver_reviewed_at = NULL WHERE id = ?')
      .run(req!.approver_name, req!.approver_email, req!.approver_email ? 'pending' : null, studentId);
  }
  db().prepare('UPDATE school_change_requests SET status = ?, handled_by = ?, handled_at = ? WHERE id = ?').run(approve ? 'approved' : 'declined', me.id, new Date().toISOString(), req.id);
  logEvent(studentId, actorOf(me), approve ? 'High school change approved' : 'High school change declined', (db().prepare('SELECT name FROM schools WHERE id = ?').get(req!.to_school_id) as { name: string } | undefined)?.name ?? null);
  redirect(back(formData, { done: approve ? 'school_change_approved' : 'school_change_declined' }));
}

/** Fix a student's Shasta College ID (e.g. when the same ID shows up on two accounts). */
export async function setStudentNumber(formData: FormData) {
  const { me, studentId, p } = await load(formData);
  const num = String(formData.get('student_number') || '').trim().slice(0, 20) || null;
  if (num && !/^[A-Za-z0-9-]+$/.test(num)) redirect(back(formData, { error: 'id' }));
  if (num !== p.student.student_number) logEvent(studentId, actorOf(me), 'Shasta College ID changed', `${p.student.student_number ?? 'none'} → ${num ?? 'none'}`);
  db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(num, studentId);
  redirect(back(formData, { done: 'id_saved' }));
}

/** Change which term a requested class is in. */
export async function adminSetCourseTerm(formData: FormData) {
  const { me, studentId } = await load(formData);
  const termId = Number(formData.get('termId'));
  if (!db().prepare('SELECT 1 FROM terms WHERE id = ?').get(termId)) redirect(back(formData));
  const from = Number(formData.get('fromTermId')) || null;
  if (from === termId) redirect(back(formData));
  const courseId = Number(formData.get('courseId'));
  // Already requested in that term (even if archived): nothing to move.
  if (db().prepare('SELECT 1 FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id = ?').get(studentId, courseId, termId)) redirect(back(formData, { error: 'term_taken' }));
  // A class in a new term needs its own high school approval and its own prerequisite decision (both are per term).
  const moved = db().prepare(`UPDATE course_requests SET term_id = ?, hs_status = 'pending', hs_by = NULL, hs_at = NULL, hs_signed_name = NULL, hs_signature_file_id = NULL, hs_sign_method = NULL,
      prereq_status = NULL, prereq_by = NULL, prereq_at = NULL, prereq_hold = NULL, prereq_hold_note = NULL, prereq_hold_by = NULL, prereq_hold_at = NULL, prereq_reply = NULL, prereq_reply_at = NULL
    WHERE student_id = ? AND course_id = ? AND term_id IS ?`).run(termId, studentId, courseId, from);
  if (!Number(moved.changes)) redirect(back(formData));
  const tn = (id: number | null) => (id ? (db().prepare('SELECT name FROM terms WHERE id = ?').get(id) as { name: string } | undefined)?.name : null) ?? 'no term';
  logEvent(studentId, actorOf(me), `Moved ${courseName(Number(formData.get('courseId')))} to another term`, `${tn(from)} → ${tn(termId)}`, [from, termId]);
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
  logEvent(studentId, actorOf(me), approve ? 'Shasta College ID change approved' : 'Shasta College ID change declined', `Requested ID ${req!.new_number}`);
  redirect(back(formData, { done: approve ? 'id_change_approved' : 'id_change_declined' }));
}

/** Unlisted-school students: make (and email, if set up) a new approval link for the approver they named. */
export async function adminSendApproverLink(formData: FormData) {
  const { studentId } = await load(formData);
  const r = await sendApproverLink(studentId);
  if (!r) redirect(back(formData, { error: 'no_approver' }));
  redirect(back(formData, { done: 'approver_link', link: r!.link, emailed: r!.emailed ? '1' : '0' }));
}

/** Homeschooled students: a college admin approves or declines the Private School Affidavit. */
export async function reviewAffidavit(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (p.steps.find((s) => s.id === 11)?.status !== 'in_review') redirect(back(formData));
  const decision = formData.get('decision');
  if (decision !== 'approve' && decision !== 'decline') redirect(back(formData, { error: 'decide' }));
  if (decision === 'decline' && !note) redirect(back(formData, { error: 'note' }));
  db().prepare("UPDATE affidavits SET status = ?, reviewed_by = ?, reviewed_at = ?, note = ? WHERE id = (SELECT id FROM affidavits WHERE student_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1)")
    .run(decision === 'approve' ? 'approved' : 'declined', me.id, new Date().toISOString(), note || null, studentId);
  logEvent(studentId, actorOf(me), decision === 'approve' ? 'Private School Affidavit approved' : 'Private School Affidavit declined', note || null);
  redirect(back(formData, { done: decision === 'approve' ? 'affidavit_ok' : 'affidavit_declined' }));
}

/** Nudge college counselors to prioritize a student's prerequisite review (top of their queue, highlighted). */
export async function nudgePrerequisite(formData: FormData) {
  const { me, studentId, p, note } = await load(formData);
  if (p.steps.find((s) => s.id === 8)?.status !== 'in_review') redirect(back(formData));
  await nudgePrereq(studentId, { id: me.id, name: `${me.first_name} ${me.last_name}` }, note || null);
  logEvent(studentId, actorOf(me), 'Nudged prerequisite review (prioritize)', note || null, p.courses.filter((c) => c.needs_prereq && c.prereq_status !== 'approved').map((c) => c.term_id));
  redirect(back(formData, { done: 'nudged' }));
}

/**
 * A class the student said has no prerequisite (or that isn't marked as having one): send it to prerequisite
 * review, even after Clear units. Or take a flag off again (only flags, not a course's own prerequisite).
 */
export async function adminFlagPrereq(formData: FormData) {
  const { me, studentId } = await load(formData);
  const courseId = Number(formData.get('courseId'));
  const termId = Number(formData.get('fromTermId')) || null;
  const on = formData.get('flag') === 'on';
  db().prepare(`UPDATE course_requests SET prereq_flag = ?, prereq_flagged_by = ?, prereq_status = CASE WHEN ? = 1 THEN NULL ELSE prereq_status END,
    prereq_by = CASE WHEN ? = 1 THEN NULL ELSE prereq_by END, prereq_at = CASE WHEN ? = 1 THEN NULL ELSE prereq_at END
    WHERE student_id = ? AND course_id = ? AND term_id IS ?`).run(on ? 1 : 0, on ? me.id : null, on ? 1 : 0, on ? 1 : 0, on ? 1 : 0, studentId, courseId, termId);
  logEvent(studentId, actorOf(me), on ? `Sent ${courseName(courseId)} to prerequisite review` : `Took ${courseName(courseId)} out of prerequisite review`, null, [termId]);
  redirect(back(formData, { done: on ? 'prereq_flagged' : 'prereq_unflagged' }));
}

/**
 * Review the approver a student named (unlisted schools and homeschool): confirm them, or correct the name / email
 * (e.g. the student named office staff and it has to be the administrator). A changed approver gets a new link.
 */
export async function reviewApprover(formData: FormData) {
  const { me, studentId, p } = await load(formData);
  if (!namesApprover(p.school)) redirect(back(formData));
  const name = String(formData.get('approver_name') || '').trim().slice(0, 120);
  const email = String(formData.get('approver_email') || '').trim().toLowerCase().slice(0, 200);
  if (!validApprover(name, email)) redirect(back(formData, { error: 'approver' }));
  const emailChanged = (p.student.hs_approver_email ?? '').toLowerCase() !== email;
  const r = await setApprover(studentId, name, email, actorOf(me), me.id);
  // The new person gets a link when classes are waiting on them.
  if (emailChanged && getProgress(studentId)?.steps.find((s) => s.id === 4)?.status === 'in_review') {
    const sent = await sendApproverLink(studentId);
    if (sent) redirect(back(formData, { done: 'approver_changed', link: sent.link, emailed: sent.emailed ? '1' : '0', classes: r.reset.join(', ') }));
  }
  redirect(back(formData, { done: r.changed ? 'approver_saved' : 'approver_ok' }));
}
