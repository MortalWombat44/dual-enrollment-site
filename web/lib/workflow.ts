import 'server-only';
import { db, DEFAULT_MODES, STEP_DEFS, STEP_ORDER, sweepYoungDocs, tx } from './db';
import type { User } from './auth';
import { logEvent, SYSTEM, type Actor } from './audit';

export type Mode = 'required' | 'optional' | 'off';
export type StepStatus =
  | 'complete'
  | 'current' // the student can act on it now
  | 'changes' // counselor asked for changes (course selection reopened)
  | 'waiting_parent'
  | 'in_review' // waiting on a reviewer: Clear units (7), Prerequisite review (8), High school approval (4)
  | 'scheduled' // ready, but registration hasn't opened
  | 'locked';

export type School = {
  id: number;
  name: string;
  district: string;
  designation: 'CCAP' | 'NON_CCAP';
  /** 'listed' (on the sign-up list), 'other' (typed in by a student), 'homeschool' (the one Homeschool entry). */
  kind: 'listed' | 'other' | 'homeschool';
  agreement_id: string | null;
  agreement_expires: string | null;
};
export type Term = { id: number; name: string; registration_opens: string; is_current?: number; summer?: number };
export type Course = {
  id: number; code: string; title: string; units: number; schedule: string; prerequisite: string | null;
  /** 'ce' Concurrent Enrollment (at Shasta College) or 'de' Dual Enrollment (at the high school, with period + teacher). */
  kind: 'ce' | 'de'; school_id: number | null; period: string | null; teacher: string | null; active: number;
  /** Dual Enrollment: the only term this section is offered (null = every term). */
  offered_term_id: number | null;
  /** 1 = a Concurrent class a student (or admin) typed in; 0 = on an admin-kept list. */
  custom: number;
};
/** A requested class, with the term the student asked to take it in. */
export type RequestedCourse = Course & {
  term_id: number | null; term_name: string | null;
  /** High school approval for this class in this term (Non-CCAP schools). */
  hs_status: 'pending' | 'approved'; hs_by: number | null; hs_at: string | null;
  hs_signed_name: string | null; hs_signature_file_id: number | null; hs_sign_method: string | null; hs_signer_email: string | null;
  /** Needs prerequisite review: the course has a prerequisite, or the class was flagged later (prereq_flag). */
  needs_prereq: number; prereq_flag: number; prereq_status: 'approved' | null; prereq_at: string | null; prereq_by: number | null;
  /** A college counselor put this class's prerequisite review on hold until the student responds. */
  prereq_hold: PrereqHold | null; prereq_hold_note: string | null; prereq_hold_by: number | null; prereq_hold_at: string | null;
  /** The student's latest answer to a hold. */
  prereq_reply: string | null; prereq_reply_at: string | null;
};
export type PrereqHold = 'info' | 'appointment';
export const HOLD_LABEL: Record<PrereqHold, string> = {
  info: 'Prerequisite: More information needed',
  appointment: 'Prerequisite: Appointment with a college counselor required',
};

/** CCAP schools never use high school approval; Non-CCAP schools always do (per class, per term). */
/** Days a student has to confirm registration once it opens before the step shows as overdue. */
export const REGISTER_GRACE_DAYS = 5;

/** Short label for a step's status (admin lists and panels). */
export function stepStatusLabel(s: StudentStep): string {
  if (s.id === 5 && s.overdue) return 'Overdue registration';
  if (s.id === 5 && s.status === 'scheduled') return 'Ready to register';
  if (s.id === 5 && s.status === 'current') return 'Registration open';
  if (s.id === 8 && s.hold) return s.hold === 'info' ? 'More information needed' : 'Counselor appointment required';
  return { complete: 'Done', in_review: 'In review', waiting_parent: 'Waiting on parent', changes: 'Changes requested', locked: 'Locked', scheduled: 'Not open yet', current: 'Student to do' }[s.status];
}
/** "06 Register", "06 Overdue registration", "06 Ready to register": the step a student is on, for lists. */
export function stepOnLabel(p: { next: StudentStep | null }): string {
  const n = p.next;
  if (!n) return 'Done';
  const name = n.id === 5 && (n.overdue || n.status === 'scheduled') ? stepStatusLabel(n) : n.id === 8 && n.hold ? HOLD_LABEL[n.hold] : n.short;
  return `${String(n.num).padStart(2, '0')} ${name}`;
}

export type Affidavit = { id: number; file_id: number | null; uploaded_by: number | null; uploaded_at: string; status: 'pending' | 'approved' | 'declined'; reviewed_by: number | null; reviewed_at: string | null; note: string | null };
/** The student's most recent Private School Affidavit upload (homeschooled students). */
export function latestAffidavit(studentId: number): Affidavit | null {
  return (db().prepare('SELECT id, file_id, uploaded_by, uploaded_at, status, reviewed_by, reviewed_at, note FROM affidavits WHERE student_id = ? ORDER BY id DESC LIMIT 1').get(studentId) as Affidavit | undefined) ?? null;
}

/** Unlisted ("Other") schools and homeschool: the student names the person who approves their classes, by link. */
export const namesApprover = (s: { kind: string }) => s.kind === 'other' || s.kind === 'homeschool';
export const hsApprovalMode = (designation: 'CCAP' | 'NON_CCAP'): Mode => (designation === 'CCAP' ? 'off' : 'required');

export type StudentStep = {
  id: number; // canonical step id (1–6)
  num: number; // position in this student's list
  name: string;
  short: string;
  description: string;
  mode: Exclude<Mode, 'off'>;
  status: StepStatus;
  completedAt: string | null;
  data: Record<string, unknown> | null;
  seen: boolean;
  /** Register for classes: open for more than 5 days without the student confirming ("Overdue registration"). */
  overdue?: boolean;
  /** Prerequisite review: every class left is on hold, waiting on the student (not the counselor). */
  hold?: PrereqHold;
};

export type StudentProgress = {
  student: User;
  school: School;
  term: Term;
  counselor: User | null;
  parents: User[];
  steps: StudentStep[];
  complete: number;
  total: number;
  done: boolean;
  next: StudentStep | null;
  courses: RequestedCourse[];
  /** Terms the student confirmed registering for (Register for classes is per term). */
  registeredTermIds: number[];
  /** Terms the student's classes are in (registration date and whether registration is allowed). */
  requestTerms: Term[];
  /** "Spring 2027" or "Spring 2027 + Summer 2027": what the student is enrolling for. */
  termLabel: string;
  startedAt: string | null;
  changeNote: string | null;
  /** Who sent the courses back: the high school counselor or Shasta College. */
  changeBy: 'counselor' | 'college' | null;
};

export const TZ = 'America/Los_Angeles';
export function fmt(iso: string | null | undefined, kind: 'md' | 'mdy' | 'time' | 'wmd' = 'md'): string {
  if (!iso) return '';
  const d = new Date(iso);
  const o: Intl.DateTimeFormatOptions =
    kind === 'md' ? { month: 'short', day: 'numeric' } :
    kind === 'mdy' ? { month: 'short', day: 'numeric', year: 'numeric' } :
    kind === 'wmd' ? { weekday: 'long', month: 'short', day: 'numeric' } :
    { hour: 'numeric', minute: '2-digit' };
  return new Intl.DateTimeFormat('en-US', { ...o, timeZone: TZ }).format(d);
}
export function now(): string {
  return new Date().toISOString();
}
export function pad(n: number) {
  return String(n).padStart(2, '0');
}
export function displayName(u: Pick<User, 'first_name' | 'last_name' | 'title'>, formal = false) {
  return formal && u.title ? `${u.title} ${u.last_name}` : `${u.first_name} ${u.last_name}`;
}

export function getSchool(id: number): School | null {
  return (db().prepare('SELECT * FROM schools WHERE id = ?').get(id) as School | undefined) ?? null;
}
/** All terms, newest registration first. `is_current` = 1 means active (taking students). */
export function allTerms(): Term[] {
  return db().prepare('SELECT id, name, registration_opens, is_current, summer FROM terms ORDER BY registration_opens DESC').all() as Term[];
}
export function activeTerms(): Term[] {
  return db().prepare('SELECT id, name, registration_opens, is_current, summer FROM terms WHERE is_current = 1 ORDER BY registration_opens').all() as Term[];
}
/** The term new students land in when none is chosen: the active term whose registration opens soonest. */
export function currentTerm(): Term {
  return activeTerms()[0] ?? (db().prepare('SELECT id, name, registration_opens FROM terms ORDER BY registration_opens DESC').get() as Term);
}
/** The next registration date across active terms (for the dashboards' stat). */
export function nextRegistration(): Term {
  const active = activeTerms();
  return active.find((t) => new Date(t.registration_opens).getTime() > Date.now()) ?? active.at(-1) ?? currentTerm();
}
export function getTerm(id: number): Term | null {
  return (db().prepare('SELECT id, name, registration_opens, is_current, summer FROM terms WHERE id = ?').get(id) as Term | undefined) ?? null;
}
export function schoolModes(schoolId: number): Record<number, Mode> {
  const rows = db().prepare('SELECT step_id, mode FROM school_steps WHERE school_id = ?').all(schoolId) as { step_id: number; mode: Mode }[];
  const out: Record<number, Mode> = {};
  for (const r of rows) out[r.step_id] = r.mode;
  return out;
}
export function schoolStepRows(schoolId: number) {
  const rows = db()
    .prepare('SELECT s.id, s.name, s.description, ss.mode, ss.note FROM steps s LEFT JOIN school_steps ss ON ss.step_id = s.id AND ss.school_id = ?')
    .all(schoolId) as { id: number; name: string; description: string; mode: Mode | null; note: string | null }[];
  // Show in workflow order, using the current names from the code.
  // Only steps that are switched on in the code (e.g. Textbooks & Canvas is off for now).
  return rows
    .filter((r) => STEP_ORDER.includes(r.id))
    .map((r) => { const def = STEP_DEFS.find((d) => d.id === r.id)!; return { ...r, name: def.name, description: def.description }; })
    .sort((a, b) => STEP_ORDER.indexOf(a.id) - STEP_ORDER.indexOf(b.id));
}
export function defaultModes(designation: 'CCAP' | 'NON_CCAP') {
  return DEFAULT_MODES[designation];
}

function getUser(id: number | null): User | null {
  if (!id) return null;
  return (db().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined) ?? null;
}

export function getProgress(studentId: number): StudentProgress | null {
  return getProgressMany([studentId]).get(studentId) ?? null;
}

const CHUNK = 400;
/** Run a query with "IN (…)" over many ids, a few hundred at a time. */
function rowsIn<T>(sql: (marks: string) => string, ids: number[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    out.push(...(db().prepare(sql(part.map(() => '?').join(','))).all(...part) as T[]));
  }
  return out;
}
function groupBy<T>(rows: T[], key: (r: T) => number): Map<number, T[]> {
  const m = new Map<number, T[]>();
  for (const r of rows) { const k = key(r); const list = m.get(k); if (list) list.push(r); else m.set(k, [r]); }
  return m;
}

type ProgRow = { student_id: number; step_id: number; status: string; completed_at: string; seen: number; data: string | null };
type Loaded = {
  schools: Map<number, School>; terms: Map<number, Term>; fallbackTerm: Term; schoolModes: Map<number, Record<number, Mode>>;
  enrollments: Map<number, { term_id: number; started_at: string | null; step_modes: string | null }>;
  progress: Map<number, ProgRow[]>; courses: Map<number, (RequestedCourse & { student_id: number })[]>;
  regs: Map<number, { student_id: number; term_id: number; crns: string | null; registered_at: string }[]>;
  affidavits: Map<number, Affidavit>;
  clearances: Map<number, { student_id: number; term_id: number; cleared_by: number; cleared_at: string }[]>;
  parents: Map<number, User[]>; counselors: Map<number, User>;
};

/**
 * Progress for many students at once (staff queues, rosters, reports): a handful of queries in total instead of
 * about ten per student. Students keep the order of `ids`; ids that aren't students with a school are left out.
 */
export function getProgressMany(ids: number[]): Map<number, StudentProgress> {
  const out = new Map<number, StudentProgress>();
  if (!ids.length) return out;
  const d = db();
  const students = rowsIn<User>((m) => `SELECT * FROM users WHERE id IN (${m}) AND role = 'student' AND school_id IS NOT NULL`, ids);
  if (!students.length) return out;
  const sids = students.map((u) => u.id);
  const modeRows = d.prepare('SELECT school_id, step_id, mode FROM school_steps').all() as { school_id: number; step_id: number; mode: Mode }[];
  const schoolModeMap = new Map<number, Record<number, Mode>>();
  for (const r of modeRows) { const o = schoolModeMap.get(r.school_id) ?? {}; o[r.step_id] = r.mode; schoolModeMap.set(r.school_id, o); }
  const affidavits = new Map<number, Affidavit>();
  for (const a of rowsIn<Affidavit & { student_id: number }>((m) => `SELECT student_id, id, file_id, uploaded_by, uploaded_at, status, reviewed_by, reviewed_at, note FROM affidavits WHERE student_id IN (${m}) ORDER BY id`, sids)) {
    const { student_id, ...rest } = a; affidavits.set(student_id, rest); // later rows win: the most recent upload
  }
  const counselorIds = [...new Set(students.map((u) => u.counselor_id).filter((id): id is number => !!id))];
  const x: Loaded = {
    schools: new Map((d.prepare('SELECT * FROM schools').all() as School[]).map((s) => [s.id, s])),
    terms: new Map(allTerms().map((t) => [t.id, t])),
    fallbackTerm: currentTerm(),
    schoolModes: schoolModeMap,
    enrollments: new Map(rowsIn<{ student_id: number; term_id: number; started_at: string | null; step_modes: string | null }>(
      (m) => `SELECT student_id, term_id, started_at, step_modes FROM enrollments WHERE student_id IN (${m})`, sids).map((r) => [r.student_id, r])),
    progress: groupBy(rowsIn<ProgRow>((m) => `SELECT student_id, step_id, status, completed_at, seen, data FROM step_progress WHERE student_id IN (${m})`, sids), (r) => r.student_id),
    courses: groupBy(rowsIn<RequestedCourse & { student_id: number; opens: string | null }>((m) => `SELECT r.student_id, t.registration_opens AS opens, c.*, r.term_id, t.name AS term_name, r.hs_status, r.hs_by, r.hs_at, r.hs_signed_name, r.hs_signature_file_id, r.hs_sign_method, r.hs_signer_email,
                     (c.prerequisite IS NOT NULL OR r.prereq_flag = 1) AS needs_prereq, r.prereq_flag, r.prereq_status, r.prereq_at, r.prereq_by,
                     r.prereq_hold, r.prereq_hold_note, r.prereq_hold_by, r.prereq_hold_at, r.prereq_reply, r.prereq_reply_at
              FROM course_requests r JOIN courses c ON c.id = r.course_id
              LEFT JOIN terms t ON t.id = r.term_id WHERE r.student_id IN (${m}) AND r.archived_at IS NULL ORDER BY t.registration_opens, c.code`, sids), (r) => r.student_id),
    regs: groupBy(rowsIn<{ student_id: number; term_id: number; crns: string | null; registered_at: string }>((m) => `SELECT student_id, term_id, crns, registered_at FROM registrations WHERE student_id IN (${m})`, sids), (r) => r.student_id),
    affidavits,
    clearances: groupBy(rowsIn<{ student_id: number; term_id: number; cleared_by: number; cleared_at: string }>((m) => `SELECT student_id, term_id, cleared_by, cleared_at FROM unit_clearances WHERE student_id IN (${m})`, sids), (r) => r.student_id),
    parents: new Map([...groupBy(rowsIn<User & { linked_student: number }>((m) => `SELECT u.*, l.student_id AS linked_student FROM parent_links l JOIN users u ON u.id = l.parent_id WHERE l.student_id IN (${m})`, sids), (r) => r.linked_student)]),
    counselors: new Map(rowsIn<User>((m) => `SELECT * FROM users WHERE id IN (${m})`, counselorIds).map((u) => [u.id, u])),
  };
  const byId = new Map(students.map((u) => [u.id, u]));
  for (const id of ids) {
    const u = byId.get(id);
    const p = u && !out.has(id) ? computeProgress(u, x) : null;
    if (p) out.set(id, p);
  }
  return out;
}

function computeProgress(student: User, x: Loaded): StudentProgress | null {
  const studentId = student.id;
  const school = x.schools.get(student.school_id!);
  if (!school) return null;
  const enr = x.enrollments.get(studentId);
  const homeTerm = (enr && x.terms.get(enr.term_id)) || x.fallbackTerm;
  const modes: Record<number, Mode> = enr?.step_modes ? JSON.parse(enr.step_modes) : { ...(x.schoolModes.get(school.id) ?? {}) };
  modes[4] = hsApprovalMode(school.designation); // set by school type, never by saved settings
  modes[9] = 'required'; modes[10] = 'required'; // young student review is policy, not a school setting
  // Homeschooled: the approver they name approves classes (like an unlisted school), and Shasta College reviews the Private School Affidavit.
  modes[11] = school.kind === 'homeschool' ? 'required' : 'off';
  const prog = new Map((x.progress.get(studentId) ?? []).map((r) => [r.step_id, r]));
  // A reviewer (Clear units, Prerequisite review or High school approval) sent the courses back.
  const changeRow = [...prog.values()].find((r) => r.status === 'changes_requested') ?? null;
  const courses: RequestedCourse[] = x.courses.get(studentId) ?? [];
  // Classes carry their own term. The Register step follows the earliest registration date among them;
  // with no classes yet, the student's default term.
  const requestTerms = [...new Set(courses.map((c) => c.term_id).filter((id): id is number => !!id))]
    .map((id) => x.terms.get(id)).filter((t): t is Term => !!t)
    .sort((a, b) => a.registration_opens.localeCompare(b.registration_opens));
  // Register for classes is per term: done when the student registered for every term they have classes in.
  const regs = new Map((x.regs.get(studentId) ?? []).map((r) => [r.term_id, r]));
  const unregistered = requestTerms.filter((t) => !regs.has(t.id));
  const registeredAll = requestTerms.length > 0 && unregistered.length === 0;
  const lastReg = registeredAll ? requestTerms.map((t) => regs.get(t.id)!).sort((a, b) => a.registered_at.localeCompare(b.registered_at)).at(-1)! : null;
  // "The" term for registration dates: the next one still to register for.
  const term = unregistered[0] ?? requestTerms[0] ?? homeTerm;
  const termLabel = requestTerms.length ? requestTerms.map((t) => t.name).join(' + ') : homeTerm.name;
  // Prerequisite review only applies when a requested class has a prerequisite (or it already ran).
  // Prerequisite review is per class (like high school approval): done when every class that needs it is approved.
  const prereqClasses = courses.filter((c) => c.needs_prereq);
  const needsPrereq = prereqClasses.length > 0 || (prog.has(8) && prog.get(8)!.status === 'complete');
  const prereqDone = prereqClasses.length ? prereqClasses.every((c) => c.prereq_status === 'approved') : prog.get(8)?.status === 'complete';
  // On hold: every class still waiting is on hold, so it's the student's move (not the counselor's).
  const prereqLeft = prereqClasses.filter((c) => c.prereq_status !== 'approved');
  const prereqHold: PrereqHold | undefined = prereqLeft.length && prereqLeft.every((c) => c.prereq_hold)
    ? (prereqLeft.some((c) => c.prereq_hold === 'info') ? 'info' : 'appointment') : undefined;
  const prereqAt = prereqClasses.length && prereqDone ? prereqClasses.map((c) => c.prereq_at ?? '').sort().at(-1) || prog.get(8)?.completed_at || null : prog.get(8)?.completed_at ?? null;
  const young = isYoung(student);
  const adult = isAdult(student);
  const affidavit = x.affidavits.get(studentId) ?? null;
  // CCAP students cleared for the maximum units in a term skip Clear units for that term (classes added later included).
  const maxCleared = new Map((x.clearances.get(studentId) ?? []).map((r) => [r.term_id, r]));
  const unitsByMax = school.designation === 'CCAP' && courses.length > 0 && courses.every((c) => c.term_id && maxCleared.has(c.term_id));
  const regOpen = new Date(term.registration_opens).getTime() <= Date.now();

  const steps: StudentStep[] = [];
  let blocked = false;
  let blockedBefore7 = false;
  for (const def of STEP_DEFS) {
    const mode = modes[def.id] ?? 'required';
    if (mode === 'off') continue;
    if (def.id === 8 && !needsPrereq) continue;
    if ((def.id === 9 || def.id === 10) && !young) continue; // young students (8th grade and below) only
    // 18 or older today: no parent consent needed (a consent already on file still shows).
    if (def.id === 3 && adult && prog.get(3)?.status !== 'complete') continue;
    const p = prog.get(def.id);
    // High school approval is done only when every requested class (every term) is approved,
    // so adding classes later (e.g. next term) opens it again for just those classes.
    const hsDone = courses.length > 0 && courses.every((c) => c.hs_status === 'approved');
    const autoCleared = def.id === 7 && p?.status !== 'complete' && unitsByMax;
    const isComplete = def.id === 4 ? hsDone : def.id === 8 ? prereqDone : def.id === 11 ? affidavit?.status === 'approved' : def.id === 5 ? registeredAll : p?.status === 'complete' || autoCleared;
    const maxAt = autoCleared ? courses.map((c) => maxCleared.get(c.term_id!)!.cleared_at).sort().at(-1)! : null;
    const hsAt = def.id === 4 && hsDone ? courses.map((c) => c.hs_at ?? '').sort().at(-1) || p?.completed_at || null : null;
    let status: StepStatus;
    if (def.id === 7) blockedBefore7 = blocked;
    // Prerequisite review runs alongside Clear units: it opens when Clear units does.
    const isBlocked = def.id === 8 ? blockedBefore7 : blocked;
    if (isComplete) status = 'complete';
    // The Private School Affidavit can be uploaded (and reviewed) any time; it still has to be approved before later steps.
    else if (def.id === 11) status = affidavit?.status === 'pending' ? 'in_review' : 'current';
    else if (isBlocked) status = 'locked';
    else if (def.id === 2 && changeRow) status = 'changes';
    else if (def.id === 3) status = 'waiting_parent';
    else if (def.id === 4 || def.id === 7 || def.id === 8 || def.id === 10 || (def.id === 11 && affidavit?.status === 'pending')) status = 'in_review';
    else if (def.id === 5 && !regOpen) status = 'scheduled';
    else status = 'current';
    // Register: once the term's registration has been open (and the student ready) for more than 5 days, it's overdue.
    let overdue = false;
    if (def.id === 5 && status === 'current') {
      const ready = [term.registration_opens, ...steps.map((x) => x.completedAt ?? '')].sort().at(-1)!;
      overdue = Date.now() - new Date(ready).getTime() > REGISTER_GRACE_DAYS * 864e5;
    }
    if (!isComplete && mode === 'required') blocked = true;
    steps.push({ overdue, hold: def.id === 8 && status === 'in_review' ? prereqHold : undefined,
      id: def.id, num: steps.length + 1, name: def.name, short: def.short, description: def.description,
      mode, status, completedAt: isComplete ? (def.id === 4 ? hsAt : def.id === 8 ? prereqAt : def.id === 11 ? affidavit!.reviewed_at : def.id === 5 ? lastReg!.registered_at : autoCleared ? maxAt : p!.completed_at) : null,
      data: def.id === 11 ? (affidavit ? { ...affidavit } : null) : def.id === 5 ? (isComplete ? { crns: lastReg!.crns } : null) : autoCleared ? { max_units: true, admin_id: maxCleared.get(courses[0].term_id!)!.cleared_by } : isComplete && p?.data ? JSON.parse(p.data) : null,
      seen: !isComplete || !p || p.seen === 1 || def.id === 5,
    });
  }
  const complete = steps.filter((s) => s.status === 'complete').length;
  const done = steps.every((s) => s.status === 'complete' || s.mode === 'optional');
  const next = steps.find((s) => s.status !== 'complete' && s.status !== 'locked') ?? null;
  const parents = x.parents.get(studentId) ?? [];
  return {
    student, school, term, counselor: (student.counselor_id && x.counselors.get(student.counselor_id)) || null, parents, steps, complete, total: steps.length,
    done, next, courses, requestTerms, termLabel, registeredTermIds: [...regs.keys()], startedAt: enr?.started_at ?? null,
    changeNote: changeRow?.data ? (JSON.parse(changeRow.data).note as string) ?? null : null,
    changeBy: changeRow ? (changeRow.step_id === 4 ? 'counselor' : 'college') : null,
  };
}

/** Marks a step complete. The first completed step snapshots the school's step rules for this student. */
/** Young student review (step 10): the college counselor's recommendation, saved before the final decision. */
export type YoungRec = { rec_by: number; rec: 'recommend' | 'not_recommend'; rec_note: string; rec_at: string };
export function youngRecommendation(studentId: number): YoungRec | null {
  return (db().prepare('SELECT rec_by, rec, rec_note, rec_at FROM young_reviews WHERE student_id = ?').get(studentId) as YoungRec | undefined) ?? null;
}

/** Terms (names) a CCAP student was cleared for the maximum units in. Staff only. */
export function maxUnitTerms(studentId: number): string[] {
  return (db().prepare('SELECT t.name FROM unit_clearances c JOIN terms t ON t.id = c.term_id WHERE c.student_id = ? ORDER BY t.registration_opens')
    .all(studentId) as { name: string }[]).map((r) => r.name);
}

/**
 * Add a class request. If the same class + term was archived earlier (registration was turned off), it comes back
 * as a new, pending request.
 */
export function addRequest(studentId: number, courseId: number, termId: number, by?: Actor): boolean {
  const prev = db().prepare('SELECT archived_at FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?').get(studentId, courseId, termId) as { archived_at: string | null } | undefined;
  db().prepare(`INSERT INTO course_requests (student_id, course_id, term_id) VALUES (?,?,?)
    ON CONFLICT (student_id, course_id, term_id) DO UPDATE SET archived_at = NULL, archived_reason = NULL,
      hs_status = 'pending', hs_by = NULL, hs_at = NULL, hs_signed_name = NULL, hs_signature_file_id = NULL, hs_sign_method = NULL,
      prereq_status = NULL, prereq_by = NULL, prereq_at = NULL, prereq_hold = NULL, prereq_hold_note = NULL, prereq_hold_by = NULL, prereq_hold_at = NULL,
      prereq_reply = NULL, prereq_reply_at = NULL
    WHERE archived_at IS NOT NULL`).run(studentId, courseId, termId);
  const added = !prev || !!prev.archived_at;
  if (added && by) logEvent(studentId, by, `Requested ${courseName(courseId)}`, prev ? 'Requested again after it was archived' : null, [termId]);
  return added;
}

/** "ENGL C1000 (3 units)" for the history. */
export function courseName(courseId: number): string {
  const c = db().prepare('SELECT code, units FROM courses WHERE id = ?').get(courseId) as { code: string; units: number } | undefined;
  return c ? `${c.code} (${c.units} units)` : `class #${courseId}`;
}

/** Requests archived because registration for their term was turned off before the student registered. Staff only. */
export function archivedRequests(studentId: number): { code: string; title: string; units: number; term_name: string | null; archived_at: string; archived_reason: string | null }[] {
  return db().prepare(`SELECT c.code, c.title, c.units, t.name AS term_name, r.archived_at, r.archived_reason
    FROM course_requests r JOIN courses c ON c.id = r.course_id LEFT JOIN terms t ON t.id = r.term_id
    WHERE r.student_id = ? AND r.archived_at IS NOT NULL ORDER BY r.archived_at DESC, c.code`).all(studentId) as never;
}

/** Turning registration off for a term archives the requests of students who hadn't registered for it yet. */
export function archiveClosedTerm(termId: number) {
  const t = getTerm(termId);
  if (!t) return 0;
  const d = db();
  const at = now();
  const affected = (d.prepare(`SELECT DISTINCT student_id FROM course_requests r WHERE term_id = ? AND archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM registrations g WHERE g.student_id = r.student_id AND g.term_id = r.term_id)`).all(termId) as { student_id: number }[]).map((r) => r.student_id);
  const archiving = d.prepare(`SELECT r.student_id, c.code FROM course_requests r JOIN courses c ON c.id = r.course_id WHERE r.term_id = ? AND r.archived_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM registrations g WHERE g.student_id = r.student_id AND g.term_id = r.term_id)`).all(termId) as { student_id: number; code: string }[];
  const n = tx(() => {
    for (const id of affected) logEvent(id, SYSTEM, `Archived ${archiving.filter((r) => r.student_id === id).map((r) => r.code).join(', ')}`, `Registration for ${t.name} was turned off before the student registered.`, [termId]);
    const changes = Number(d.prepare(`UPDATE course_requests SET archived_at = ?, archived_reason = ?
      WHERE term_id = ? AND archived_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM registrations g WHERE g.student_id = course_requests.student_id AND g.term_id = course_requests.term_id)`)
      .run(at, `Registration for ${t.name} was turned off before the student registered.`, termId).changes);
    // Students left with no active classes go back to Course selection (nothing is left to review).
    for (const id of affected) {
      if (d.prepare('SELECT 1 FROM course_requests WHERE student_id = ? AND archived_at IS NULL').get(id)) continue;
      d.prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id IN (2, 4, 7, 8, 9, 10)').run(id);
      d.prepare('DELETE FROM young_reviews WHERE student_id = ?').run(id);
    }
    return changes;
  });
  sweepYoungDocs();
  return n;
}

export function completeStep(studentId: number, stepId: number, data: Record<string, unknown> | null, bySomeoneElse = false) {
  const d = db();
  tx(() => {
    const enr = d.prepare('SELECT started_at, step_modes FROM enrollments WHERE student_id = ?').get(studentId) as
      | { started_at: string | null; step_modes: string | null }
      | undefined;
    if (!enr) {
      const u = getUser(studentId)!;
      d.prepare('INSERT INTO enrollments (student_id, term_id, started_at, step_modes) VALUES (?,?,?,?)').run(
        studentId, currentTerm().id, now(), JSON.stringify(schoolModes(u.school_id!)));
    } else if (!enr.step_modes) {
      const u = getUser(studentId)!;
      d.prepare('UPDATE enrollments SET started_at = ?, step_modes = ? WHERE student_id = ?').run(
        now(), JSON.stringify(schoolModes(u.school_id!)), studentId);
    }
    d.prepare('INSERT OR REPLACE INTO step_progress (student_id, step_id, status, completed_at, seen, data) VALUES (?,?,?,?,?,?)').run(
      studentId, stepId, 'complete', now(), bySomeoneElse ? 0 : 1, data ? JSON.stringify(data) : null);
  });
}

/** A reviewer step (4, 7 or 8) sends the courses back: course selection reopens with the reviewer's note. */
export function requestChanges(studentId: number, stepId: number, by: { id: number | null }, note: string) {
  const d = db();
  tx(() => {
    // Course selection reopens, and new courses go back through every review (high school, young student, units, prerequisites).
    d.prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id IN (2, 4, 7, 8, 9, 10)').run(studentId);
    d.prepare('DELETE FROM young_reviews WHERE student_id = ?').run(studentId);
    d.prepare('INSERT OR REPLACE INTO step_progress (student_id, step_id, status, completed_at, data) VALUES (?,?,?,?,?)').run(
      studentId, stepId, 'changes_requested', now(), JSON.stringify({ by_id: by.id, note }));
  });
  sweepYoungDocs(); // documents sent before are replaced by new ones
}

/**
 * Admin override: reopen a step and every step after it (later steps depended on it).
 * Parent consent is one-time and covers future terms, so it is only removed when that step itself is reopened.
 */
export function reopenFrom(studentId: number, stepId: number) {
  // CCCApply (1) and parent consent (3) are once-ever, so they're only removed when that step itself is reopened.
  const later = STEP_ORDER.slice(STEP_ORDER.indexOf(stepId)).filter((id) => (id !== 3 && id !== 1) || stepId === id);
  const d = db();
  tx(() => {
    const del = d.prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id = ?');
    for (const id of later) del.run(studentId, id);
    if (later.includes(10)) d.prepare('DELETE FROM young_reviews WHERE student_id = ?').run(studentId);
    // Moving Clear units back on purpose also drops any "cleared for maximum units" so it really reopens.
    if (later.includes(7)) d.prepare('DELETE FROM unit_clearances WHERE student_id = ?').run(studentId);
    if (later.includes(5)) d.prepare('DELETE FROM registrations WHERE student_id = ?').run(studentId);
    if (later.includes(11)) d.prepare("UPDATE affidavits SET status = 'declined', note = COALESCE(note, 'Reopened by Shasta College') WHERE student_id = ? AND status != 'declined'").run(studentId);
  });
  if (later.includes(9)) sweepYoungDocs();
}

export function studentsForParent(parentId: number): User[] {
  return db()
    .prepare('SELECT u.* FROM parent_links l JOIN users u ON u.id = l.student_id WHERE l.parent_id = ? ORDER BY u.first_name')
    .all(parentId) as User[];
}

export function schoolCourses(schoolId: number): Course[] {
  return db()
    // What a student at this school can pick from a list: their high school's Dual Enrollment sections, plus the
    // Concurrent Enrollment list Shasta College keeps. Students can also type in any other Concurrent class (ceCourse),
    // which is stored as a hidden (active = 0) course.
    .prepare("SELECT * FROM courses WHERE active = 1 AND custom = 0 AND ((kind = 'de' AND school_id = ?) OR kind = 'ce') ORDER BY kind DESC, code")
    .all(schoolId) as Course[];
}

/** A Concurrent Enrollment class typed in by a student (or admin): code like "PSYC C1000", units, optional name. */
export type CeEntry = { code: string; title: string; units: number; prereq: boolean };
export const CE_DEFAULT_TITLE = 'Concurrent Enrollment';
export function parseCe(code: unknown, title: unknown, units: unknown, prereq: unknown): CeEntry | null {
  const c = String(code ?? '').toUpperCase().replace(/\s+/g, ' ').trim();
  const u = Number(units);
  if (!/^[A-Z][A-Z0-9 .\-]{1,19}$/.test(c) || !/\d/.test(c)) return null;
  if (!Number.isFinite(u) || u < 0.5 || u > 20 || Math.round(u * 2) !== u * 2) return null;
  const t = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 100) || CE_DEFAULT_TITLE;
  return { code: c, title: t, units: u, prereq: prereq === '1' || prereq === 'on' };
}
/** Find or create the (hidden) course row for a typed-in Concurrent class. */
export function ceCourse(e: CeEntry): number {
  // Typed a class that's on the Concurrent list (same code and units)? Use the listed one.
  const listed = db().prepare("SELECT id FROM courses WHERE kind = 'ce' AND custom = 0 AND active = 1 AND code = ? AND units = ?").get(e.code, e.units) as { id: number } | undefined;
  if (listed) return listed.id;
  const prereq = e.prereq ? 'Reported by the student' : null;
  const found = db().prepare("SELECT id FROM courses WHERE kind = 'ce' AND custom = 1 AND code = ? AND title = ? AND units = ? AND prerequisite IS ?")
    .get(e.code, e.title, e.units, prereq) as { id: number } | undefined;
  if (found) return found.id;
  return Number(db().prepare("INSERT INTO courses (code, title, units, schedule, prerequisite, kind, active, custom) VALUES (?,?,?,'',?,'ce',0,1)")
    .run(e.code, e.title, e.units, prereq).lastInsertRowid);
}

export function daysSince(iso: string | null): string {
  if (!iso) return '';
  const day = (t: number) => Math.floor(new Date(new Date(t).toLocaleString('en-US', { timeZone: TZ })).setHours(0, 0, 0, 0) / 864e5);
  const n = day(Date.now()) - day(new Date(iso).getTime());
  return n <= 0 ? 'Today' : n === 1 ? '1 day' : `${n} days`;
}

export function markSeen(studentId: number, stepId: number) {
  db().prepare('UPDATE step_progress SET seen = 1 WHERE student_id = ? AND step_id = ?').run(studentId, stepId);
}

export const STUDENT_STEP_IDS = STEP_ORDER;

/** ISO time → "YYYY-MM-DDTHH:mm" in Pacific time, for a datetime-local input. */
export function toPacificInput(iso: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(iso)).map((x) => [x.type, x.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** "YYYY-MM-DDTHH:mm" typed as Pacific time → ISO (handles daylight saving). */
export function fromPacificInput(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // Find the Pacific offset at that moment, then correct (twice, in case the guess crosses a DST change).
  let t = asUtc;
  for (let i = 0; i < 2; i++) {
    const shown = toPacificInput(new Date(t).toISOString());
    const [d, h] = shown.split('T');
    const [y, mo, da] = d.split('-').map(Number);
    const [hh, mm] = h.split(':').map(Number);
    t += asUtc - Date.UTC(y, mo - 1, da, hh, mm);
  }
  return new Date(t).toISOString();
}

/** Move a student to another high school: that school's counselor and step rules from here on. */
export function moveStudentSchool(studentId: number, schoolId: number) {
  const d = db();
  tx(() => {
    const counselor = d
      .prepare("SELECT id FROM users WHERE role = 'counselor' AND school_id = ? ORDER BY status = 'active' DESC, id LIMIT 1")
      .get(schoolId) as { id: number } | undefined;
    d.prepare('UPDATE users SET school_id = ?, counselor_id = ? WHERE id = ?').run(schoolId, counselor?.id ?? null, studentId);
    d.prepare('UPDATE enrollments SET step_modes = ? WHERE student_id = ? AND step_modes IS NOT NULL').run(JSON.stringify(schoolModes(schoolId)), studentId);
  });
}

/** Shasta College IDs that appear on more than one student account → the accounts sharing each. */
export function sharedStudentIds(): Map<string, { id: number; name: string }[]> {
  const rows = db().prepare(`
    SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.student_number AS num FROM users u
    WHERE u.role = 'student' AND u.student_number IS NOT NULL AND u.student_number != ''
      AND u.student_number IN (SELECT student_number FROM users WHERE role = 'student' AND student_number IS NOT NULL GROUP BY student_number HAVING COUNT(*) > 1)
    ORDER BY u.id`).all() as { id: number; name: string; num: string }[];
  const out = new Map<string, { id: number; name: string }[]>();
  for (const r of rows) out.set(r.num, [...(out.get(r.num) ?? []), { id: r.id, name: r.name }]);
  return out;
}

/** Students with an open school-change or ID-change request (for the queue tabs, in one query each). */
export function openSchoolChangeIds(): Set<number> {
  return new Set((db().prepare("SELECT DISTINCT student_id FROM school_change_requests WHERE status = 'open'").all() as { student_id: number }[]).map((r) => r.student_id));
}
export function openIdChangeIds(): Set<number> {
  return new Set((db().prepare("SELECT DISTINCT student_id FROM id_change_requests WHERE status = 'open'").all() as { student_id: number }[]).map((r) => r.student_id));
}

/** A student's open "please change my high school" request, if any. */
export function openSchoolChange(studentId: number) {
  return (db().prepare(`SELECT r.id, r.note, r.created_at, s.name AS to_name, r.to_school_id FROM school_change_requests r
    JOIN schools s ON s.id = r.to_school_id WHERE r.student_id = ? AND r.status = 'open'`).get(studentId) as
    { id: number; note: string | null; created_at: string; to_name: string; to_school_id: number } | undefined) ?? null;
}

/** "Period 2 · Mr. Hall" for Dual Enrollment. Concurrent courses are just code, title and units, so nothing. */
export function courseWhen(c: Pick<Course, 'kind' | 'period' | 'teacher'>): string {
  if (c.kind === 'de') return [c.period ? `Period ${c.period}` : null, c.teacher ? (c.teacher === 'TBD' ? 'Teacher TBD' : c.teacher) : null].filter(Boolean).join(' · ') || 'At your high school';
  return '';
}
export const KIND_LABEL = { de: 'Dual Enrollment', ce: 'Concurrent Enrollment' } as const;

/** The graduating class of the current school year (school years end in June, Pacific time). */
export function currentClassYear(now = new Date()): number {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(now).split('-').map(Number);
  return m >= 7 ? y + 1 : y;
}
type GradeInfo = { grad_year: number | null; grade: number | null; grade_confirmed_year?: number | null };

/** Grades students can pick. We've had 5th graders enroll, so it goes all the way down. */
export const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/** This school year's grade: what the student confirmed this year, otherwise worked out from their graduation year. */
export function currentGrade(u: GradeInfo): number | null {
  if (u.grade && u.grade_confirmed_year === currentClassYear()) return u.grade;
  if (u.grad_year) return 12 - (u.grad_year - currentClassYear());
  return u.grade;
}
/** Age in whole years on a date (Pacific time), from a YYYY-MM-DD date of birth. */
export function ageOn(dob: string | null | undefined, on = new Date()): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob ?? '');
  if (!m) return null;
  const [y, mo, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(on).split('-').map(Number);
  let age = y - Number(m[1]);
  if (mo < Number(m[2]) || (mo === Number(m[2]) && d < Number(m[3]))) age--;
  return age;
}
/**
 * 18 or older today: no parent consent needed. Today, not "by the time the term starts": a 17-year-old who
 * turns 18 before registration still needs consent until their birthday.
 */
export const isAdult = (u: { date_of_birth?: string | null }) => (ageOn(u.date_of_birth) ?? 0) >= 18;

/** Contact info and date of birth every student account needs, plus 12th graders' plans after high school. */
export function profileMissing(u: User): string[] {
  if (u.role !== 'student') return [];
  const miss: string[] = [];
  if (!u.date_of_birth) miss.push('date of birth');
  if (!u.phone) miss.push('phone number');
  if (!u.address_line || !u.city || !u.state || !u.zip) miss.push('address');
  if (currentGrade(u) === 12 && u.plans_year !== currentClassYear()) miss.push('plans after high school');
  return miss;
}

/** 8th grade or below: tagged as a young student until they reach 9th grade. */
export const isYoung = (u: GradeInfo) => { const g = currentGrade(u); return g !== null && g <= 8; };
/** After July 1 each year, students confirm their graduation year and grade on first sign-in. */
export const needsGradeConfirm = (u: { role: string } & GradeInfo) => u.role === 'student' && u.grade_confirmed_year !== currentClassYear();

/** "Class of 2027 · 12th grade". */
export function classLabel(u: GradeInfo): string {
  const g = currentGrade(u);
  const grade = g === null ? '' : g > 12 ? 'Graduated' : g < 1 ? '' : `${ordinal(g)} grade`;
  if (!u.grad_year) return grade || 'Class not set';
  return `Class of ${u.grad_year}` + (grade ? ` · ${grade}` : '');
}

/** An open request (from high school staff) to change a student's Shasta College ID. */
export function openIdChange(studentId: number) {
  return (db().prepare(`SELECT r.id, r.current_number, r.new_number, r.note, r.created_at, u.first_name || ' ' || u.last_name AS by_name
    FROM id_change_requests r JOIN users u ON u.id = r.requested_by WHERE r.student_id = ? AND r.status = 'open'`).get(studentId) as
    { id: number; current_number: string | null; new_number: string; note: string | null; created_at: string; by_name: string } | undefined) ?? null;
}
