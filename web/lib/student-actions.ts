'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { cryptoToken, db, tx } from './db';
import { activeTerms, ceCourse, completeStep, currentClassYear, getProgress, GRADES, parseCe, schoolCourses } from './workflow';
import { saveFile, sniff } from './files';
import { MAX_UPLOAD_BYTES } from './constants';


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
  redirect('/student/steps/1/complete');
}

/** Adding the ID later, after skipping. */
export async function addStudentId(formData: FormData) {
  const me = await requireRole('student');
  const num = String(formData.get('student_number') || '').trim().slice(0, 20);
  if (!/^[A-Za-z0-9-]{4,20}$/.test(num)) redirect('/student/steps/1?error=id');
  db().prepare('UPDATE users SET student_number = ? WHERE id = ?').run(num, me.id);
  redirect('/student?id_added=1');
}

export async function submitCourses(formData: FormData) {
  const { me, p } = await stepFor(2, ['current', 'changes']);
  const open = new Set(activeTerms().map((t) => t.id));
  // Dual Enrollment: checkboxes from the school's list, each with a term.
  const offered = new Set(schoolCourses(p.school.id).map((c) => c.id));
  const picks: { id: number; term: number }[] = [...new Set(formData.getAll('course').map(Number))]
    .filter((id) => offered.has(id)).map((id) => ({ id, term: Number(formData.get(`term_${id}`)) }));
  // Concurrent Enrollment: typed in (code + units), each with a term.
  const codes = formData.getAll('ce_code'), titles = formData.getAll('ce_title'), units = formData.getAll('ce_units');
  const terms = formData.getAll('ce_term'), prereqs = formData.getAll('ce_prereq');
  const ce: { entry: NonNullable<ReturnType<typeof parseCe>>; term: number }[] = [];
  for (let i = 0; i < codes.length; i++) {
    if (!String(codes[i]).trim() && !String(units[i] ?? '').trim()) continue; // blank row
    const entry = parseCe(codes[i], titles[i], units[i], prereqs[i]);
    if (!entry) redirect('/student/steps/2?error=ce');
    ce.push({ entry: entry!, term: Number(terms[i]) });
  }
  if (picks.length + ce.length === 0) redirect('/student/steps/2?error=none');
  // Every class needs a term that's open for registration. Going over the unit limit is allowed (the student sees a note).
  if ([...picks, ...ce].some((x) => !open.has(x.term))) redirect('/student/steps/2?error=term');
  tx(() => {
    for (const x of ce) picks.push({ id: ceCourse(x.entry), term: x.term });
    // Keep classes that stay in the same term (with their high school approval); new ones, or ones moved
    // to another term, start pending: approval is per class, per term.
    const keep = new Set(picks.map((x) => `${x.id}:${x.term}`));
    const existing = db().prepare('SELECT course_id, term_id FROM course_requests WHERE student_id = ?').all(me.id) as { course_id: number; term_id: number | null }[];
    const had = new Set(existing.map((r) => `${r.course_id}:${r.term_id}`));
    const del = db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?');
    for (const r of existing) if (!keep.has(`${r.course_id}:${r.term_id}`)) del.run(me.id, r.course_id, r.term_id);
    const ins = db().prepare('INSERT OR IGNORE INTO course_requests (student_id, course_id, term_id) VALUES (?,?,?)');
    for (const x of picks) ins.run(me.id, x.id, x.term);
    db().prepare("DELETE FROM step_progress WHERE student_id = ? AND status = 'changes_requested'").run(me.id);
    // Any change to the classes means Shasta College clears units (and checks prerequisites) again.
    const changed = keep.size !== had.size || [...keep].some((k) => !had.has(k));
    if (changed) db().prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id IN (7, 8)').run(me.id);
  });
  const total = getProgress(me.id)!.courses.reduce((n, c) => n + c.units, 0);
  completeStep(me.id, 2, { units: total });
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

export async function requestSchoolChange(formData: FormData) {
  const me = await requireRole('student');
  const to = Number(formData.get('school'));
  const note = String(formData.get('note') || '').trim().slice(0, 500) || null;
  if (!to || to === me.school_id || !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(to)) redirect('/student/account?error=school');
  tx(() => {
    // One open request at a time: a new one replaces the old.
    db().prepare("DELETE FROM school_change_requests WHERE student_id = ? AND status = 'open'").run(me.id);
    db().prepare('INSERT INTO school_change_requests (student_id, from_school_id, to_school_id, note) VALUES (?,?,?,?)').run(me.id, me.school_id, to, note);
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
  db().prepare('UPDATE users SET grade = ?, grad_year = ?, grade_confirmed_year = ? WHERE id = ?').run(grade, gradYear, thisClass, me.id);
  redirect('/student');
}

/** After picking courses (e.g. next term), students can reopen Course selection to add or change classes. */
export async function reopenCourseSelection() {
  const me = await requireRole('student');
  const p = getProgress(me.id);
  if (p?.steps.find((s) => s.id === 2)?.status !== 'complete') redirect('/student/steps/2');
  db().prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id = 2').run(me.id);
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
  redirect('/student/steps/9/complete');
}
