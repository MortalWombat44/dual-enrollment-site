'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { cryptoToken, db, sweepYoungDocs, tx } from './db';
import { activeTerms, addRequest, ceCourse, completeStep, currentClassYear, currentGrade, getProgress, GRADES, parseCe, schoolCourses } from './workflow';
import { saveFile, sniff } from './files';
import { resolveSchool, type SchoolChoice } from './schools';
import { sendApproverLink } from './approver-links';
import { mailConfigured } from './mail';
import { saveAffidavit } from './affidavit';
import { notifyLeads } from './notify';
import { parseProfile, type ProfileInput } from './profile';
import { MAX_UPLOAD_BYTES } from './constants';
import { actorOf, logEvent } from './audit';
import { addTranscript, readUpload, releaseHolds } from './transcripts';
import { courseName } from './workflow';
import { notifyUsers } from './notify';
import { sendInvite } from './account-mail';


async function stepFor(stepId: number, allowed: string[]) {
  const me = await requireRole('student');
  const p = getProgress(me.id);
  const s = p?.steps.find((x) => x.id === stepId);
  if (!p || !s || !allowed.includes(s.status)) redirect(`/student/steps/${stepId}`);
  return { me, p, s };
}

/**
 * Step 01 (done once ever): the student gives their Shasta College ID, or skips for now.
 * Skipping completes the step so they can keep going, but they're sent back here at every sign-in until the ID is in.
 */
export async function submitCccapply(formData: FormData) {
  const { me } = await stepFor(1, ['current']);
  const skip = formData.get('skip') === 'on';
  const num = String(formData.get('student_number') || '').trim().slice(0, 20);
  if (!skip) {
    if (!/^[A-Za-z0-9-]{4,20}$/.test(num)) redirect('/student/steps/1?error=id');
    db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(num, me.id);
  }
  completeStep(me.id, 1, skip ? { id_pending: true } : { student_number: num });
  logEvent(me.id, actorOf(me), skip ? 'CCCApply done (Shasta College ID to add later)' : 'CCCApply done', skip ? null : `Shasta College ID ${num}`);
  redirect('/student/steps/1/complete');
}

/** Adding the ID later, after skipping. */
export async function addStudentId(formData: FormData) {
  const me = await requireRole('student');
  const num = String(formData.get('student_number') || '').trim().slice(0, 20);
  if (!/^[A-Za-z0-9-]{4,20}$/.test(num)) redirect('/student/steps/1?error=id');
  db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(num, me.id);
  logEvent(me.id, actorOf(me), 'Added Shasta College ID', num);
  redirect('/student?id_added=1');
}

/** Students at an unlisted school: email their named approver a link when classes are waiting (if email is set up). */
async function emailApproverIfNeeded(studentId: number) {
  const p = getProgress(studentId);
  // Without email set up, the student sends the link themselves (a new link would cancel one they already shared).
  if (mailConfigured() && p?.school.kind === 'other' && p.steps.find((s) => s.id === 4)?.status === 'in_review') await sendApproverLink(studentId);
}

/** Reads the course picker: Dual Enrollment checkboxes (each with a term) and typed-in Concurrent classes. */
function parsePicks(formData: FormData, schoolId: number, back: string) {
  const offered = new Map(schoolCourses(schoolId).map((c) => [c.id, c]));
  const picks: { id: number; term: number }[] = [...new Set(formData.getAll('course').map(Number))]
    .filter((id) => offered.has(id)).map((id) => ({ id, term: Number(formData.get(`term_${id}`)) }));
  // A section offered in one term can only be requested for that term.
  if (picks.some((x) => { const t = offered.get(x.id)!.offered_term_id; return !!t && t !== x.term; })) redirect(`${back}?error=term`);
  const codes = formData.getAll('ce_code'), titles = formData.getAll('ce_title'), units = formData.getAll('ce_units');
  const terms = formData.getAll('ce_term'), prereqs = formData.getAll('ce_prereq');
  const ce: { entry: NonNullable<ReturnType<typeof parseCe>>; term: number }[] = [];
  for (let i = 0; i < codes.length; i++) {
    if (!String(codes[i]).trim() && !String(units[i] ?? '').trim()) continue; // blank row
    const entry = parseCe(codes[i], titles[i], units[i], prereqs[i]);
    if (!entry) redirect(`${back}?error=ce`);
    ce.push({ entry: entry!, term: Number(terms[i]) });
  }
  return { picks, ce };
}

/**
 * Request more classes at any time after the first course selection, even while other classes are in review.
 * Nothing already requested changes. The new classes go to the high school (Non-CCAP), and Shasta College
 * clears units (and checks prerequisites) again; young students send documents again (the letter names the classes).
 */
export async function addMoreClasses(formData: FormData) {
  const me = await requireRole('student');
  const p = getProgress(me.id);
  if (!p || p.steps.find((s) => s.id === 2)?.status !== 'complete') redirect('/student/steps/2');
  const back = '/student/steps/2';
  const { picks, ce } = parsePicks(formData, p!.school.id, back);
  if (picks.length + ce.length === 0) redirect(`${back}?error=none`);
  const open = new Set(activeTerms().map((t) => t.id));
  if ([...picks, ...ce].some((x) => !open.has(x.term))) redirect(`${back}?error=term`);
  const before = new Set(p!.courses.map((c) => `${c.id}:${c.term_id}`));
  let added = 0;
  tx(() => {
    for (const x of ce) picks.push({ id: ceCourse(x.entry), term: x.term });
    for (const x of picks) {
      if (before.has(`${x.id}:${x.term}`)) continue;
      addRequest(me.id, x.id, x.term, actorOf(me));
      before.add(`${x.id}:${x.term}`);
      added++;
    }
    if (added) {
      db().prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id IN (7, 8, 9, 10)').run(me.id);
      db().prepare('DELETE FROM young_reviews WHERE student_id = ?').run(me.id);
    }
  });
  if (added) { sweepYoungDocs(); await emailApproverIfNeeded(me.id); }
  redirect(`${back}?added=${added}`);
}

export async function submitCourses(formData: FormData) {
  const { me, p } = await stepFor(2, ['current', 'changes']);
  const open = new Set(activeTerms().map((t) => t.id));
  const parsed = parsePicks(formData, p.school.id, '/student/steps/2');
  const picks = parsed.picks, ce = parsed.ce;
  // Classes in terms that are closed for registration aren't on the form: they stay exactly as they are.
  const closedKept = p.courses.filter((c) => !c.term_id || !open.has(c.term_id)).length;
  if (picks.length + ce.length + closedKept === 0) redirect('/student/steps/2?error=none');
  // Every class needs a term that's open for registration. Going over the unit limit is allowed (the student sees a note).
  if ([...picks, ...ce].some((x) => !open.has(x.term))) redirect('/student/steps/2?error=term');
  tx(() => {
    for (const x of ce) picks.push({ id: ceCourse(x.entry), term: x.term });
    // Keep classes that stay in the same term (with their high school approval); new ones, or ones moved
    // to another term, start pending: approval is per class, per term.
    const keep = new Set(picks.map((x) => `${x.id}:${x.term}`));
    // Only classes in open terms are managed here; closed-term and archived requests are left alone.
    const existing = (db().prepare('SELECT course_id, term_id FROM course_requests WHERE student_id = ? AND archived_at IS NULL').all(me.id) as { course_id: number; term_id: number | null }[])
      .filter((r) => r.term_id && open.has(r.term_id));
    const had = new Set(existing.map((r) => `${r.course_id}:${r.term_id}`));
    const del = db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?');
    for (const r of existing) {
      if (keep.has(`${r.course_id}:${r.term_id}`)) continue;
      logEvent(me.id, actorOf(me), `Removed ${courseName(r.course_id)}`, 'Changed on Course selection', [r.term_id]);
      del.run(me.id, r.course_id, r.term_id);
    }
    for (const x of picks) addRequest(me.id, x.id, x.term, actorOf(me));
    db().prepare("DELETE FROM step_progress WHERE student_id = ? AND status = 'changes_requested'").run(me.id);
    // Any change to the classes means Shasta College clears units (and checks prerequisites) again.
    const changed = keep.size !== had.size || [...keep].some((k) => !had.has(k));
    if (changed) db().prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id IN (7, 8)').run(me.id);
  });
  const total = getProgress(me.id)!.courses.reduce((n, c) => n + c.units, 0);
  completeStep(me.id, 2, { units: total });
  logEvent(me.id, actorOf(me), 'Submitted course selection', `${total} units in all`, 'student');
  await emailApproverIfNeeded(me.id);
  redirect('/student/steps/2/complete');
}

export async function confirmRegistered(formData: FormData) {
  const { me, p } = await stepFor(5, ['current']);
  // Register is per term: this confirms the next term the student hasn't registered for (its registration is open).
  const termId = Number(formData.get('termId'));
  if (termId !== p.term.id) redirect('/student/steps/5');
  const crns = String(formData.get('crns') || '').trim().slice(0, 200);
  db().prepare('INSERT OR REPLACE INTO registrations (student_id, term_id, crns, registered_at) VALUES (?,?,?,?)').run(me.id, termId, crns || null, new Date().toISOString());
  completeStep(me.id, 5, { crns, term_id: termId }); // history; the step itself follows the registrations
  logEvent(me.id, actorOf(me), `Confirmed registered for ${p.term.name}`, crns ? `CRNs ${crns}` : null, [termId]);
  redirect(getProgress(me.id)!.steps.find((s) => s.id === 5)?.status === 'complete' ? '/student/steps/5/complete' : '/student/steps/5');
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
  if (!existing) await sendInvite(parentId, `${me.first_name} ${me.last_name}`);
  redirect(`/student/steps/3?invited=${parentId}`);
}

export async function requestSchoolChange(formData: FormData) {
  const me = await requireRole('student');
  const note = String(formData.get('note') || '').trim().slice(0, 500) || null;
  const choice = resolveSchool(formData);
  if ('error' in choice) redirect(`/student/account?error=${choice.error}`);
  const c = choice as SchoolChoice;
  if (c.schoolId === me.school_id && !c.approverEmail) redirect('/student/account?error=school');
  tx(() => {
    // One open request at a time: a new one replaces the old.
    db().prepare("DELETE FROM school_change_requests WHERE student_id = ? AND status = 'open'").run(me.id);
    db().prepare('INSERT INTO school_change_requests (student_id, from_school_id, to_school_id, note, approver_name, approver_email) VALUES (?,?,?,?,?,?)')
      .run(me.id, me.school_id, c.schoolId, note, c.approverName, c.approverEmail);
  });
  redirect('/student/account?saved=school_request');
}

export async function cancelSchoolChange() {
  const me = await requireRole('student');
  db().prepare("DELETE FROM school_change_requests WHERE student_id = ? AND status = 'open'").run(me.id);
  redirect('/student/account?saved=school_cancel');
}

export async function setMyStudentNumber(formData: FormData) {
  const me = await requireRole('student');
  const num = String(formData.get('student_number') || '').trim().slice(0, 20) || null;
  if (num && !/^[A-Za-z0-9-]+$/.test(num)) redirect('/student/account?error=id');
  if (num !== me.student_number) logEvent(me.id, actorOf(me), 'Changed Shasta College ID', `${me.student_number ?? 'none'} → ${num ?? 'none'}`);
  db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(num, me.id);
  redirect('/student/account?saved=id');
}

/** Yearly check (after July 1): the student confirms their graduation year and grade. */
export async function confirmGrade(formData: FormData) {
  const me = await requireRole('student');
  const grade = Number(formData.get('grade'));
  const gradYear = Number(formData.get('grad_year'));
  const thisClass = currentClassYear();
  if (!GRADES.includes(grade) || !Number.isInteger(gradYear) || gradYear < thisClass || gradYear > thisClass + 12) redirect('/confirm-grade?error=1');
  // 12th graders say whether they plan to attend Shasta College after high school.
  const plans = String(formData.get('plans') || '');
  if (grade === 12 && !['yes', 'no', 'unsure'].includes(plans)) redirect('/confirm-grade?error=plans');
  db().prepare('UPDATE users SET grade = ?, grad_year = ?, grade_confirmed_year = ? WHERE id = ?').run(grade, gradYear, thisClass, me.id);
  if (grade === 12) db().prepare('UPDATE users SET plans_shasta = ?, plans_year = ?, plans_at = ? WHERE id = ?').run(plans, thisClass, new Date().toISOString(), me.id);
  redirect('/student');
}

/** After picking courses (e.g. next term), students can reopen Course selection to add or change classes. */
export async function reopenCourseSelection() {
  const me = await requireRole('student');
  const p = getProgress(me.id);
  if (p?.steps.find((s) => s.id === 2)?.status !== 'complete') redirect('/student/steps/2');
  db().prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id = 2').run(me.id);
  logEvent(me.id, actorOf(me), 'Reopened Course selection to change classes', null, 'student');
  redirect('/student/steps/2');
}

/** Young students (8th grade and below): a recent transcript / report card and a principal's letter. */
export async function submitYoungDocs(formData: FormData) {
  const { me } = await stepFor(9, ['current']);
  const ids: Record<string, number> = {};
  const files: [string, string][] = [['transcript', 'young_transcript'], ['letter', 'young_letter']];
  const bufs: { field: string; kind: string; name: string; mime: string; buf: Buffer }[] = [];
  for (const [field, kind] of files) {
    const f = formData.get(field);
    if (!(f instanceof File) || f.size === 0 || f.size > MAX_UPLOAD_BYTES) redirect('/student/steps/9?error=docs');
    const buf = Buffer.from(await (f as File).arrayBuffer());
    const mime = sniff(buf);
    if (!mime) redirect('/student/steps/9?error=docs');
    bufs.push({ field, kind, name: (f as File).name.slice(0, 120), mime: mime!, buf });
  }
  for (const b of bufs) ids[b.field] = saveFile({ studentId: me.id, uploadedBy: me.id, kind: b.kind, filename: b.name, mime: b.mime, data: b.buf });
  completeStep(me.id, 9, { transcript_file_id: ids.transcript, letter_file_id: ids.letter });
  logEvent(me.id, actorOf(me), 'Sent young student documents', 'Report card or transcript, and principal letter', 'student');
  await notifyLeads('young', me.id, `${me.first_name} ${me.last_name} (young student) sent a report card and principal letter; a college counselor recommendation is needed.`);
  redirect('/student/steps/9/complete');
}

/** Date of birth, phone, address (and 12th graders' plans). From the profile prompt or the account page. */
export async function saveProfile(formData: FormData) {
  const me = await requireRole('student');
  const from = formData.get('from') === 'account' ? '/student/account' : '/complete-profile';
  const senior = currentGrade(me) === 12;
  const r = parseProfile(formData, senior && from === '/complete-profile');
  if ('error' in r) redirect(`${from}?error=${r.error}`);
  const v = r as ProfileInput;
  db().prepare('UPDATE users SET date_of_birth = ?, phone = ?, address_line = ?, city = ?, state = ?, zip = ? WHERE id = ?')
    .run(v.dob, v.phone, v.address, v.city, v.state, v.zip, me.id);
  if (senior && v.plans) db().prepare('UPDATE users SET plans_shasta = ?, plans_year = ?, plans_at = ? WHERE id = ?').run(v.plans, currentClassYear(), new Date().toISOString(), me.id);
  redirect(from === '/student/account' ? '/student/account?saved=profile' : '/student');
}

/** Students at an unlisted high school can update who approves their classes there. */
export async function saveHsApprover(formData: FormData) {
  const me = await requireRole('student');
  const name = String(formData.get('approver_name') || '').trim().slice(0, 120);
  const email = String(formData.get('approver_email') || '').trim().toLowerCase().slice(0, 200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect('/student/account?error=approver');
  db().prepare('UPDATE users SET hs_approver_name = ?, hs_approver_email = ? WHERE id = ?').run(name, email, me.id);
  redirect('/student/account?saved=approver');
}

/** Homeschooled students upload their Private School Affidavit; a college admin reviews it. */
export async function submitAffidavit(formData: FormData) {
  const { me } = await stepFor(11, ['current']);
  const err = await saveAffidavit(me.id, me.id, formData.get('affidavit'));
  if (err) redirect(`/student/steps/11?error=aff_${err}`);
  logEvent(me.id, actorOf(me), 'Uploaded the Private School Affidavit');
  await notifyLeads('homeschool', me.id, `${me.first_name} ${me.last_name} uploaded a Private School Affidavit to review.`);
  redirect('/student/steps/11');
}

/** A student realizes a class has a prerequisite they didn't mark: send it to prerequisite review (any time). */
export async function studentRequestPrereq(formData: FormData) {
  const me = await requireRole('student');
  const courseId = Number(formData.get('courseId'));
  const termId = Number(formData.get('termId')) || null;
  const r = db().prepare(`UPDATE course_requests SET prereq_flag = 1, prereq_flagged_by = ?, prereq_status = NULL, prereq_by = NULL, prereq_at = NULL
    WHERE student_id = ? AND course_id = ? AND term_id IS ? AND prereq_flag = 0 AND archived_at IS NULL`).run(me.id, me.id, courseId, termId);
  if (Number(r.changes)) logEvent(me.id, actorOf(me), `Asked for prerequisite review of ${courseName(courseId)}`, null, [termId]);
  redirect(`/student/steps/2?prereq=${Number(r.changes) ? 'sent' : 'already'}#more`);
}

/** The student uploads a transcript for prerequisite review (answers "More information needed"). */
export async function studentUploadTranscript(formData: FormData) {
  const me = await requireRole('student');
  const f = await readUpload(formData.get('transcript'));
  if ('error' in f) redirect(`/student/steps/8?error=tr_${f.error}`);
  await addTranscript(me.id, { ...actorOf(me), id: me.id }, f as { buf: Buffer; mime: string; name: string });
  redirect('/student/steps/8?sent=transcript');
}

/**
 * The student answers a prerequisite hold with a message (and optionally a transcript). "More information needed"
 * goes back to the counselor queue; an appointment hold stays until the counselor decides (the message is passed on).
 */
export async function studentAnswerHold(formData: FormData) {
  const me = await requireRole('student');
  const courseId = Number(formData.get('courseId'));
  const termId = Number(formData.get('termId')) || null;
  const msg = String(formData.get('reply') || '').trim().slice(0, 1000);
  const row = db().prepare(`SELECT r.prereq_hold, r.prereq_hold_by, c.code FROM course_requests r JOIN courses c ON c.id = r.course_id
    WHERE r.student_id = ? AND r.course_id = ? AND r.term_id IS ? AND r.archived_at IS NULL AND r.prereq_hold IS NOT NULL`).get(me.id, courseId, termId) as
    { prereq_hold: 'info' | 'appointment'; prereq_hold_by: number | null; code: string } | undefined;
  if (!row) redirect('/student/steps/8');
  const file = formData.get('transcript');
  const hasFile = file instanceof File && file.size > 0;
  if (!msg && !hasFile) redirect('/student/steps/8?error=reply');
  let upload: { buf: Buffer; mime: string; name: string } | null = null;
  if (hasFile) {
    const f = await readUpload(file);
    if ('error' in f) redirect(`/student/steps/8?error=tr_${f.error}`);
    upload = f as { buf: Buffer; mime: string; name: string };
  }
  if (msg) {
    db().prepare('UPDATE course_requests SET prereq_reply = ?, prereq_reply_at = ? WHERE student_id = ? AND course_id = ? AND term_id IS ?')
      .run(msg, new Date().toISOString(), me.id, courseId, termId);
    logEvent(me.id, actorOf(me), `Answered the prerequisite hold on ${row!.code}`, msg, [termId]);
  }
  if (upload) await addTranscript(me.id, { ...actorOf(me), id: me.id }, upload); // also answers "More information needed"
  if (row!.prereq_hold === 'info') {
    await releaseHolds(me.id, ['info'], actorOf(me), 'The student sent more information', { courseId, termId });
  } else if (row!.prereq_hold_by) {
    await notifyUsers([row!.prereq_hold_by], 'prereq', me.id, `${me.first_name} ${me.last_name} replied about the counselor appointment for ${row!.code}: “${msg || 'sent a transcript'}”`);
  }
  redirect(`/student/steps/8?sent=${row!.prereq_hold === 'info' ? 'info' : 'appointment'}`);
}
