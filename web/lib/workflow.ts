import 'server-only';
import { db, DEFAULT_MODES, STEP_DEFS, STEP_ORDER, tx } from './db';
import type { User } from './auth';

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
  agreement_id: string | null;
  agreement_expires: string | null;
};
export type Term = { id: number; name: string; registration_opens: string; is_current?: number; summer?: number };
export type Course = {
  id: number; code: string; title: string; units: number; schedule: string; prerequisite: string | null;
  /** 'ce' Concurrent Enrollment (at Shasta College) or 'de' Dual Enrollment (at the high school, with period + teacher). */
  kind: 'ce' | 'de'; school_id: number | null; period: string | null; teacher: string | null; active: number;
};
/** A requested class, with the term the student asked to take it in. */
export type RequestedCourse = Course & { term_id: number | null; term_name: string | null };

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
  return rows
    .map((r) => { const def = STEP_DEFS.find((d) => d.id === r.id); return def ? { ...r, name: def.name, description: def.description } : r; })
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
  const d = db();
  const student = getUser(studentId);
  if (!student || student.role !== 'student' || !student.school_id) return null;
  const school = getSchool(student.school_id)!;
  const enr = d.prepare('SELECT term_id, started_at, step_modes FROM enrollments WHERE student_id = ?').get(studentId) as
    | { term_id: number; started_at: string | null; step_modes: string | null }
    | undefined;
  const homeTerm = (enr && getTerm(enr.term_id)) || currentTerm();
  const modes: Record<number, Mode> = enr?.step_modes ? JSON.parse(enr.step_modes) : schoolModes(school.id);
  const prog = new Map(
    (d.prepare('SELECT step_id, status, completed_at, seen, data FROM step_progress WHERE student_id = ?').all(studentId) as {
      step_id: number; status: string; completed_at: string; seen: number; data: string | null;
    }[]).map((r) => [r.step_id, r]),
  );
  // A reviewer (Clear units, Prerequisite review or High school approval) sent the courses back.
  const changeRow = [...prog.values()].find((r) => r.status === 'changes_requested') ?? null;
  const courses = d
    .prepare(`SELECT c.*, r.term_id, t.name AS term_name FROM course_requests r JOIN courses c ON c.id = r.course_id
              LEFT JOIN terms t ON t.id = r.term_id WHERE r.student_id = ? ORDER BY t.registration_opens, c.code`)
    .all(studentId) as RequestedCourse[];
  // Classes carry their own term. The Register step follows the earliest registration date among them;
  // with no classes yet, the student's default term.
  const requestTerms = [...new Set(courses.map((c) => c.term_id).filter((x): x is number => !!x))]
    .map(getTerm).filter((t): t is Term => !!t)
    .sort((a, b) => a.registration_opens.localeCompare(b.registration_opens));
  const term = requestTerms[0] ?? homeTerm;
  const termLabel = requestTerms.length ? requestTerms.map((t) => t.name).join(' + ') : homeTerm.name;
  // Prerequisite review only applies when a requested class has a prerequisite (or it already ran).
  const needsPrereq = courses.some((c) => c.prerequisite) || (prog.has(8) && prog.get(8)!.status === 'complete');
  const regOpen = new Date(term.registration_opens).getTime() <= Date.now();

  const steps: StudentStep[] = [];
  let blocked = false;
  for (const def of STEP_DEFS) {
    const mode = modes[def.id] ?? 'required';
    if (mode === 'off') continue;
    if (def.id === 8 && !needsPrereq) continue;
    const p = prog.get(def.id);
    const isComplete = p?.status === 'complete';
    let status: StepStatus;
    if (isComplete) status = 'complete';
    else if (blocked) status = 'locked';
    else if (def.id === 2 && changeRow) status = 'changes';
    else if (def.id === 3) status = 'waiting_parent';
    else if (def.id === 4 || def.id === 7 || def.id === 8) status = 'in_review';
    else if (def.id === 5 && !regOpen) status = 'scheduled';
    else status = 'current';
    if (!isComplete && mode === 'required') blocked = true;
    steps.push({
      id: def.id, num: steps.length + 1, name: def.name, short: def.short, description: def.description,
      mode, status, completedAt: isComplete ? p!.completed_at : null,
      data: isComplete && p?.data ? JSON.parse(p.data) : null,
      seen: !isComplete || p!.seen === 1,
    });
  }
  const complete = steps.filter((s) => s.status === 'complete').length;
  const done = steps.every((s) => s.status === 'complete' || s.mode === 'optional');
  const next = steps.find((s) => s.status !== 'complete' && s.status !== 'locked') ?? null;
  const parents = d
    .prepare('SELECT u.* FROM parent_links l JOIN users u ON u.id = l.parent_id WHERE l.student_id = ?')
    .all(studentId) as User[];
  return {
    student, school, term, counselor: getUser(student.counselor_id), parents, steps, complete, total: steps.length,
    done, next, courses, requestTerms, termLabel, startedAt: enr?.started_at ?? null,
    changeNote: changeRow?.data ? (JSON.parse(changeRow.data).note as string) ?? null : null,
    changeBy: changeRow ? (changeRow.step_id === 4 ? 'counselor' : 'college') : null,
  };
}

/** Marks a step complete. The first completed step snapshots the school's step rules for this student. */
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
export function requestChanges(studentId: number, stepId: number, by: User, note: string) {
  const d = db();
  tx(() => {
    // Course selection reopens, and new courses go back through every review (high school, units, prerequisites).
    d.prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id IN (2, 4, 7, 8)').run(studentId);
    d.prepare('INSERT OR REPLACE INTO step_progress (student_id, step_id, status, completed_at, data) VALUES (?,?,?,?,?)').run(
      studentId, stepId, 'changes_requested', now(), JSON.stringify({ by_id: by.id, note }));
  });
}

/**
 * Admin override: reopen a step and every step after it (later steps depended on it).
 * Parent consent is one-time and covers future terms, so it is only removed when that step itself is reopened.
 */
export function reopenFrom(studentId: number, stepId: number) {
  const later = STEP_ORDER.slice(STEP_ORDER.indexOf(stepId)).filter((id) => id !== 3 || stepId === 3);
  const d = db();
  tx(() => {
    const del = d.prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id = ?');
    for (const id of later) del.run(studentId, id);
  });
}

export function studentsForParent(parentId: number): User[] {
  return db()
    .prepare('SELECT u.* FROM parent_links l JOIN users u ON u.id = l.student_id WHERE l.parent_id = ? ORDER BY u.first_name')
    .all(parentId) as User[];
}

export function schoolCourses(schoolId: number): Course[] {
  return db()
    // What a student at this school can request: their high school's Dual Enrollment sections + every Concurrent course.
    .prepare("SELECT * FROM courses WHERE active = 1 AND ((kind = 'de' AND school_id = ?) OR kind = 'ce') ORDER BY kind DESC, code")
    .all(schoolId) as Course[];
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

/** A student's open "please change my high school" request, if any. */
export function openSchoolChange(studentId: number) {
  return (db().prepare(`SELECT r.id, r.note, r.created_at, s.name AS to_name, r.to_school_id FROM school_change_requests r
    JOIN schools s ON s.id = r.to_school_id WHERE r.student_id = ? AND r.status = 'open'`).get(studentId) as
    { id: number; note: string | null; created_at: string; to_name: string; to_school_id: number } | undefined) ?? null;
}

/** "Period 2 · Mr. Hall" for Dual Enrollment. Concurrent courses are just code, title and units, so nothing. */
export function courseWhen(c: Pick<Course, 'kind' | 'period' | 'teacher'>): string {
  if (c.kind === 'de') return [c.period ? `Period ${c.period}` : null, c.teacher].filter(Boolean).join(' · ') || 'At your high school';
  return '';
}
export const KIND_LABEL = { de: 'Dual Enrollment', ce: 'Concurrent Enrollment' } as const;

/** The graduating class of the current school year (school years end in June, Pacific time). */
export function currentClassYear(now = new Date()): number {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(now).split('-').map(Number);
  return m >= 7 ? y + 1 : y;
}
/** "Class of 2027 · Grade 12" (grade worked out from the graduation year). */
export function classLabel(u: { grad_year: number | null; grade: number | null }): string {
  if (!u.grad_year) return u.grade ? `Grade ${u.grade}` : 'Class not set';
  const grade = 12 - (u.grad_year - currentClassYear());
  return `Class of ${u.grad_year}` + (grade > 12 ? ' · Graduated' : grade >= 9 ? ` · Grade ${grade}` : '');
}
