import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './password';

export const DATA_DIR = process.env.DE_DATA_DIR || path.join(process.cwd(), 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  district TEXT NOT NULL,
  designation TEXT NOT NULL CHECK (designation IN ('CCAP','NON_CCAP')),
  agreement_id TEXT,
  agreement_expires TEXT
);
CREATE TABLE IF NOT EXISTS steps (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  description TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS school_steps (
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES steps(id),
  mode TEXT NOT NULL CHECK (mode IN ('required','optional','off')),
  note TEXT,
  PRIMARY KEY (school_id, step_id)
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  role TEXT NOT NULL CHECK (role IN ('student','parent','counselor','admin')),
  school_id INTEGER REFERENCES schools(id),
  status TEXT NOT NULL CHECK (status IN ('invited','active')),
  title TEXT,
  password_hash TEXT,
  invite_token TEXT UNIQUE,
  grade INTEGER,
  gpa REAL, -- no longer used (GPA was removed from student accounts)
  student_number TEXT,
  counselor_id INTEGER REFERENCES users(id),
  admin_level TEXT CHECK (admin_level IN ('college','super')),
  is_college_counselor INTEGER NOT NULL DEFAULT 0,
  is_young_approver INTEGER NOT NULL DEFAULT 0, -- college admins who make the final call on young students (8th grade and below)
  staff_type TEXT CHECK (staff_type IN ('counselor','admin','teacher','other')), -- high school staff only, for record keeping
  share_with_parents INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0, -- super admins can switch off access
  retired_at TEXT, -- set when retired by graduation year (also disabled)
  grad_year INTEGER, -- students: high school graduation year
  signature_file_id INTEGER, -- high school staff: saved signature used for "Approve & sign digitally"
  grade_confirmed_year INTEGER, -- the school year (by its June) the student last confirmed grade + grad year
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS parent_links (
  parent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (parent_id, student_id)
);
CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  registration_opens TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  summer INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS enrollments (
  student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  term_id INTEGER NOT NULL REFERENCES terms(id),
  started_at TEXT,
  step_modes TEXT
);
CREATE TABLE IF NOT EXISTS step_progress (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_id INTEGER NOT NULL REFERENCES steps(id),
  status TEXT NOT NULL CHECK (status IN ('complete','changes_requested')),
  completed_at TEXT NOT NULL,
  seen INTEGER NOT NULL DEFAULT 1,
  data TEXT,
  PRIMARY KEY (student_id, step_id)
);
CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  units INTEGER NOT NULL,
  schedule TEXT NOT NULL,
  prerequisite TEXT,
  -- 'ce' = Concurrent Enrollment, taught at Shasta College (one list for everyone).
  -- 'de' = Dual Enrollment, taught at a high school (school_id), with a period and teacher.
  kind TEXT NOT NULL DEFAULT 'ce' CHECK (kind IN ('ce','de')),
  school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE,
  period TEXT,
  teacher TEXT,
  active INTEGER NOT NULL DEFAULT 1 -- removed courses stay on existing requests
);
CREATE TABLE IF NOT EXISTS school_courses (
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  PRIMARY KEY (school_id, course_id)
);
CREATE TABLE IF NOT EXISTS course_requests (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  term_id INTEGER REFERENCES terms(id),
  -- High school approval is per class, per term (Non-CCAP schools only).
  hs_status TEXT NOT NULL DEFAULT 'pending' CHECK (hs_status IN ('pending','approved')),
  hs_by INTEGER REFERENCES users(id),
  hs_at TEXT,
  hs_signed_name TEXT,
  hs_signature_file_id INTEGER,
  hs_sign_method TEXT,
  PRIMARY KEY (student_id, course_id, term_id)
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  stored_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_schools (
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  PRIMARY KEY (admin_id, school_id)
);
CREATE TABLE IF NOT EXISTS school_change_requests (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_school_id INTEGER REFERENCES schools(id),
  to_school_id INTEGER NOT NULL REFERENCES schools(id),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','declined')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  handled_by INTEGER REFERENCES users(id),
  handled_at TEXT
);
CREATE TABLE IF NOT EXISTS login_attempts (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  failed_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT,
  locked_until TEXT
);
CREATE TABLE IF NOT EXISTS password_resets (
  token_hash TEXT PRIMARY KEY, -- only a SHA-256 of the emailed token is stored
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS id_change_requests (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  current_number TEXT,
  new_number TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','declined')),
  created_at TEXT NOT NULL,
  handled_by INTEGER REFERENCES users(id),
  handled_at TEXT
);
-- Young student review (step 10): the college counselor's recommendation, waiting for the approver's decision.
CREATE TABLE IF NOT EXISTS young_reviews (
  student_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rec_by INTEGER NOT NULL REFERENCES users(id),
  rec TEXT NOT NULL CHECK (rec IN ('recommend','not_recommend')),
  rec_note TEXT NOT NULL,
  rec_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
`;

type Mode = 'required' | 'optional' | 'off';
export const STEP_DEFS: { id: number; name: string; short: string; description: string }[] = [
  { id: 1, name: 'Apply on CCCApply', short: 'CCCApply', description: 'Creates the Shasta College student record' },
  // Parent consent comes before course selection: students can't pick classes until a parent has signed.
  { id: 3, name: 'Parent consent form', short: 'Parent consent', description: 'E-signature or uploaded signed form' },
  { id: 2, name: 'Course selection', short: 'Course selection', description: "Student picks from this school's approved sections" },
  { id: 4, name: 'High school approval', short: 'High school approval', description: 'High school counselor reviews the course plan' },
  // Young students (8th grade and below) only: documents, then a college counselor recommends and an approver decides.
  { id: 9, name: 'Young student documents', short: 'Young student documents', description: 'Report card or transcript, and a letter from the principal (8th grade and below only)' },
  { id: 10, name: 'Young student review', short: 'Young student review', description: 'A college counselor recommends, then a Young Student Approver decides (8th grade and below only)' },
  // Steps 7 and 8 were added later, so their ids are out of order: this array's order is the workflow order.
  { id: 7, name: 'Clear units', short: 'Clear units', description: 'Shasta College checks the courses and unit load' },
  { id: 8, name: 'Prerequisite review', short: 'Prerequisite review', description: 'A college counselor approves classes that have a prerequisite (only shown when one is requested)' },
  { id: 5, name: 'Register for classes', short: 'Register', description: 'Every student registers in myShasta once registration opens' },
  // Turned off for now. To bring it back, uncomment this line (its page and wording are still in the code):
  // { id: 6, name: 'Textbooks & Canvas access', short: 'Textbooks & Canvas', description: "Shown to students, doesn't block completion" },
];

export const DEFAULT_MODES: Record<'CCAP' | 'NON_CCAP', Record<number, Mode>> = {
  CCAP: { 1: 'required', 2: 'required', 3: 'required', 7: 'required', 8: 'required', 4: 'off', 5: 'required', 6: 'optional', 9: 'required', 10: 'required' },
  NON_CCAP: { 1: 'required', 2: 'required', 3: 'required', 7: 'required', 8: 'required', 4: 'required', 5: 'required', 6: 'required', 9: 'required', 10: 'required' },
};

let _db: DatabaseSync | null = null;

type Param = null | number | bigint | string | Uint8Array;
type Stmt = {
  get(...p: Param[]): unknown;
  all(...p: Param[]): unknown[];
  run(...p: Param[]): { changes: number | bigint; lastInsertRowid: number | bigint };
};
export type Db = { prepare(sql: string): Stmt; exec(sql: string): void };

// node:sqlite returns null-prototype rows; React can't pass those to client components,
// so every row is copied into a plain object.
const plain = (r: unknown) => (r && typeof r === 'object' ? { ...(r as object) } : r);
let _wrapped: Db | null = null;

export function db(): Db {
  if (_wrapped) return _wrapped;
  if (!_db) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    const conn = new DatabaseSync(path.join(DATA_DIR, 'de.sqlite'));
    conn.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    conn.exec(SCHEMA);
    migrate(conn);
    const count = conn.prepare('SELECT COUNT(*) AS n FROM steps').get() as { n: number };
    if (count.n === 0) seed(conn);
    ensureAccounts(conn);
    // Class requests made before classes had terms get the student's term.
    conn.exec('UPDATE course_requests SET term_id = (SELECT term_id FROM enrollments e WHERE e.student_id = course_requests.student_id) WHERE term_id IS NULL');
    if (count.n === 0) approveFromStepFour(conn);
    _db = conn;
  }
  const conn = _db;
  _wrapped = {
    exec: (sql) => conn.exec(sql),
    prepare(sql) {
      const s = conn.prepare(sql);
      return {
        get: (...p) => plain(s.get(...p)),
        all: (...p) => s.all(...p).map(plain),
        run: (...p) => s.run(...p),
      };
    },
  };
  return _wrapped;
}

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec('BEGIN');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
}

function seed(d: DatabaseSync) {
  d.exec('BEGIN');
  const insStep = d.prepare('INSERT INTO steps (id, name, short_name, description) VALUES (?,?,?,?)');
  for (const s of STEP_DEFS) insStep.run(s.id, s.name, s.short, s.description);

  // Two terms open at once: Spring (Dec 2, 8:00 AM PT) and Summer (Apr 12, 8:00 AM PT).
  d.prepare("INSERT INTO terms (id, name, registration_opens, is_current) VALUES (1, 'Spring 2027', '2026-12-02T16:00:00Z', 1)").run();
  d.prepare("INSERT INTO terms (id, name, registration_opens, is_current) VALUES (2, 'Summer 2027', '2027-04-12T15:00:00Z', 1)").run();
  d.prepare('UPDATE terms SET summer = 1 WHERE id = 2').run();

  const schools: [string, string, 'CCAP' | 'NON_CCAP', string | null, string | null][] = [
    ['Anderson High School', 'Anderson Union HSD', 'CCAP', 'CCAP-AUHSD-2025', '2028-06-30'],
    ['Enterprise High School', 'Shasta Union HSD', 'NON_CCAP', null, null], // Non-CCAP in the test data, so high school approval can be tried
    ['Foothill High School', 'Shasta Union HSD', 'CCAP', 'CCAP-SUHSD-2024', '2027-06-30'],
    ['Shasta High School', 'Shasta Union HSD', 'CCAP', 'CCAP-SUHSD-2024', '2027-06-30'],
    ['University Preparatory', 'Redding School District', 'NON_CCAP', null, null],
    ['Fall River High School', 'Fall River JUSD', 'NON_CCAP', null, null],
  ];
  const insSchool = d.prepare('INSERT INTO schools (name, district, designation, agreement_id, agreement_expires) VALUES (?,?,?,?,?)');
  const insMode = d.prepare('INSERT INTO school_steps (school_id, step_id, mode, note) VALUES (?,?,?,?)');
  const schoolIds: Record<string, number> = {};
  for (const [name, district, des, ag, exp] of schools) {
    const r = insSchool.run(name, district, des, ag, exp);
    const id = Number(r.lastInsertRowid);
    schoolIds[name] = id;
    for (const s of STEP_DEFS) {
      const mode = DEFAULT_MODES[des][s.id];
      const note =
        s.id === 4 && mode === 'off' ? 'Pre-approved under the CCAP agreement' : null;
      insMode.run(id, s.id, mode, note);
    }
  }
  const enterprise = schoolIds['Enterprise High School'];
  const anderson = schoolIds['Anderson High School'];

  const courses: [string, string, number, string][] = [
    ['ENGL 1A', 'College Composition', 3, ''],
    ['COMM 1', 'Public Speaking', 3, ''],
    ['MATH 13', 'Introduction to Statistics', 4, ''],
    ['HIST 17', 'United States History', 3, ''],
    ['PSY 1', 'General Psychology', 3, ''],
    ['AJ 1', 'Introduction to Administration of Justice', 3, ''],
  ];
  const insCourse = d.prepare('INSERT INTO courses (code, title, units, schedule) VALUES (?,?,?,?)');
  const courseIds: Record<string, number> = {};
  for (const c of courses) courseIds[c[0]] = Number(insCourse.run(...c).lastInsertRowid);
  // Placeholder prerequisites so the Prerequisite review step has something to review.
  d.prepare('UPDATE courses SET prerequisite = ? WHERE code = ?').run('Intermediate algebra (or math placement)', 'MATH 13');
  d.prepare('UPDATE courses SET prerequisite = ? WHERE code = ?').run('Eligibility for ENGL 1A', 'AJ 1');
  // Dual Enrollment sections taught at each high school (placeholders).
  const insDE = d.prepare("INSERT INTO courses (code, title, units, schedule, kind, school_id, period, teacher, prerequisite) VALUES (?,?,?,'',  'de',?,?,?,?)");
  // Every test school offers the same four Dual Enrollment classes; period and teacher TBD (units are placeholders).
  const de: [string, string, number][] = [
    ['PSYC C1000', 'Introduction to Psychology', 3],
    ['ENGL C1000', 'Academic Reading and Writing', 3],
    ['STAT C1000', 'Introduction to Statistics', 4],
    ['MATH C2210', 'Single Variable Calculus I', 4],
  ];
  for (const sid of Object.values(schoolIds)) for (const [code, title, units] of de) insDE.run(code, title, units, sid, 'TBD', 'TBD', null);

  const pw = hashPassword('shasta2027');
  const insUser = d.prepare(`INSERT INTO users (first_name, last_name, email, role, school_id, status, title, password_hash, invite_token, grade, student_number, counselor_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const user = (f: string, l: string, e: string, role: string, school: number | null, extra: Partial<{ status: string; title: string; grade: number; num: string; counselor: number }> = {}) =>
    Number(insUser.run(f, l, e, role, school, extra.status ?? 'active', extra.title ?? null,
      extra.status === 'invited' ? null : pw, extra.status === 'invited' ? cryptoToken() : null,
      extra.grade ?? null, extra.num ?? null, extra.counselor ?? null).lastInsertRowid);

  const dana = user('Dana', 'Ortiz', 'dortiz@shastacollege.edu', 'admin', null, { title: 'Super admin' });
  const jordan = user('Jordan', 'Kim', 'jkim@shastacollege.edu', 'admin', null, { title: 'Outreach' });
  d.prepare("UPDATE users SET admin_level = 'super' WHERE id = ?").run(dana);
  // Jordan is also designated as a college counselor, so they review prerequisite requests.
  d.prepare("UPDATE users SET admin_level = 'college', is_college_counselor = 1 WHERE id = ?").run(jordan);
  d.prepare('UPDATE users SET is_young_approver = 1 WHERE id = ?').run(dana);
  const alvarez = user('Rosa', 'Alvarez', 'ralvarez@suhsd.net', 'counselor', enterprise, { title: 'Ms.' });
  user('Tom', 'Becker', 'tbecker@andersonhigh.org', 'counselor', anderson, { status: 'invited', title: 'Mr.' });
  d.exec("UPDATE users SET staff_type = 'counselor' WHERE role = 'counselor'");

  const insEnroll = d.prepare('INSERT INTO enrollments (student_id, term_id, started_at, step_modes) VALUES (?,1,?,?)');
  const insProg = d.prepare('INSERT INTO step_progress (student_id, step_id, status, completed_at, data) VALUES (?,?,?,?,?)');
  const insReq = d.prepare('INSERT INTO course_requests (student_id, course_id) VALUES (?,?)');
  const modesFor = (sid: number) => JSON.stringify(Object.fromEntries(
    (d.prepare('SELECT step_id, mode FROM school_steps WHERE school_id = ?').all(sid) as { step_id: number; mode: string }[]).map((r) => [r.step_id, r.mode])));

  const students: { f: string; l: string; e: string; grade: number; num: string; courses: string[]; days: [string, string?, string?] }[] = [
    { f: 'Maya', l: 'Rivera', e: 'maya.r@student.suhsd.net', grade: 11, num: '0412893', courses: ['ENGL 1A', 'COMM 1'], days: ['2026-10-14T17:10:00Z', '2026-10-28T22:05:00Z', '2026-11-04T03:42:00Z'] },
    { f: 'Ethan', l: 'Brooks', e: 'ethan.b@student.suhsd.net', grade: 12, num: '0412910', courses: ['MATH 13', 'HIST 17'], days: ['2026-10-12T18:00:00Z', '2026-10-25T18:00:00Z', '2026-11-05T18:00:00Z'] },
    { f: 'Sofia', l: 'Nguyen', e: 'sofia.n@student.suhsd.net', grade: 11, num: '0412933', courses: ['PSY 1'], days: ['2026-10-15T18:00:00Z', '2026-10-29T18:00:00Z', '2026-11-05T19:00:00Z'] },
    { f: 'Lucas', l: 'Hart', e: 'lucas.h@student.suhsd.net', grade: 12, num: '0412947', courses: ['ENGL 1A', 'AJ 1'], days: ['2026-10-16T18:00:00Z', '2026-10-30T18:00:00Z', '2026-11-06T18:00:00Z'] },
    { f: 'Ava', l: 'Thompson', e: 'ava.t@student.suhsd.net', grade: 10, num: '0412958', courses: ['COMM 1'], days: ['2026-10-20T18:00:00Z', '2026-11-01T18:00:00Z', '2026-11-07T17:00:00Z'] },
    { f: 'Noah', l: 'Patel', e: 'noah.p@student.suhsd.net', grade: 11, num: '0412966', courses: ['PSY 1', 'COMM 1'], days: ['2026-10-21T18:00:00Z', '2026-11-02T18:00:00Z'] },
    { f: 'Isabella', l: 'Cruz', e: 'isabella.c@student.suhsd.net', grade: 12, num: '0412971', courses: ['ENGL 1A'], days: ['2026-10-22T18:00:00Z', '2026-11-03T18:00:00Z'] },
  ];
  let mayaId = 0;
  for (const s of students) {
    const id = user(s.f, s.l, s.e, 'student', enterprise, { grade: s.grade, num: s.num, counselor: alvarez });
    if (s.f === 'Maya') {
      mayaId = id;
      // Maya has turned on sharing, so her parent sees everything; Jamie (below) hasn't.
      d.prepare('UPDATE users SET share_with_parents = 1 WHERE id = ?').run(id);
    }
    insEnroll.run(id, s.days[0], modesFor(enterprise));
    insProg.run(id, 1, 'complete', s.days[0], JSON.stringify({ confirmation: 'CCC-' + s.num }));
    if (s.days[1]) {
      insProg.run(id, 2, 'complete', s.days[1], null);
      for (const c of s.courses) insReq.run(id, courseIds[c]);
    }
    if (s.days[2]) insProg.run(id, 3, 'complete', s.days[2], JSON.stringify({ method: 'esign', signer: `${s.f === 'Maya' ? 'Laura' : 'Parent of ' + s.f} ${s.l}` }));
    // Maya, Lucas and Ava are waiting on their high school counselor;
    // Ethan and Sofia were approved by the high school and wait in the college admin's Clear units queue.
    if (['Ethan', 'Sofia'].includes(s.f)) {
      const t = new Date(new Date(s.days[2]!).getTime() + 864e5).toISOString();
      insProg.run(id, 4, 'complete', t, JSON.stringify({ counselor_id: alvarez, note: 'Good plan.' }));
    }
  }
  const laura = user('Laura', 'Rivera', 'laura.rivera@gmail.com', 'parent', enterprise);
  d.prepare('INSERT INTO parent_links (parent_id, student_id) VALUES (?,?)').run(laura, mayaId);

  // A not-yet-started student with no parent account yet: they invite one from step 03.
  const jamie = user('Jamie', 'Lee', 'jamie.l@student.andersonhigh.org', 'student', anderson, { grade: 11, num: '0413002' });
  d.prepare('INSERT INTO enrollments (student_id, term_id, started_at, step_modes) VALUES (?,2,NULL,NULL)').run(jamie); // Summer 2027

  // Jordan's primary school is Enterprise HS.
  d.prepare('INSERT INTO admin_schools (admin_id, school_id) VALUES (?,?)').run(jordan, enterprise);

  // History for the Reports page: students whose units were already cleared.
  const done: { f: string; l: string; school: string; by: number; ready: string; cleared: string }[] = [
    { f: 'Olivia', l: 'Park', school: 'Enterprise High School', by: jordan, ready: '2026-10-20T17:00:00Z', cleared: '2026-10-22T19:00:00Z' },
    { f: 'Daniel', l: 'Ortega', school: 'Enterprise High School', by: jordan, ready: '2026-10-27T17:00:00Z', cleared: '2026-10-28T01:00:00Z' },
    { f: 'Mason', l: 'Reed', school: 'Foothill High School', by: jordan, ready: '2026-10-23T17:00:00Z', cleared: '2026-10-26T17:00:00Z' },
    { f: 'Chloe', l: 'Diaz', school: 'Shasta High School', by: dana, ready: '2026-10-26T17:00:00Z', cleared: '2026-10-27T17:00:00Z' },
  ];
  let n = 500;
  for (const x of done) {
    const sid = schoolIds[x.school];
    const id = user(x.f, x.l, `${x.f.toLowerCase()}.${x.l[0].toLowerCase()}@student.example.org`, 'student', sid, { grade: 12, num: `0413${n++}` });
    const t0 = new Date(new Date(x.ready).getTime() - 20 * 864e5).toISOString();
    insEnroll.run(id, t0, modesFor(sid));
    insProg.run(id, 1, 'complete', t0, JSON.stringify({ confirmation: 'CCC-' + n }));
    insProg.run(id, 2, 'complete', new Date(new Date(x.ready).getTime() - 10 * 864e5).toISOString(), null);
    insReq.run(id, courseIds['ENGL 1A']);
    insProg.run(id, 3, 'complete', new Date(new Date(x.ready).getTime() - 5 * 864e5).toISOString(), JSON.stringify({ method: 'esign', signer: `Parent of ${x.f} ${x.l}` }));
    // The last step before Clear units finishes at `ready`; Clear units at `cleared`.
    const hs = (d.prepare('SELECT mode FROM school_steps WHERE school_id = ? AND step_id = 4').get(sid) as { mode: string }).mode;
    if (hs !== 'off') insProg.run(id, 4, 'complete', x.ready, JSON.stringify({ counselor_id: alvarez }));
    else d.prepare('UPDATE step_progress SET completed_at = ? WHERE student_id = ? AND step_id = 3').run(x.ready, id);
    insProg.run(id, 7, 'complete', x.cleared, JSON.stringify({ admin_id: x.by, school_id: sid }));
  }

  // Examples for the admin flags: two accounts with the same Shasta College ID,
  // and a student asking to change high school.
  d.prepare("UPDATE users SET student_number = '0412971' WHERE email = 'daniel.o@student.example.org'").run();
  const ava = (d.prepare("SELECT id FROM users WHERE email = 'ava.t@student.suhsd.net'").get() as { id: number }).id;
  d.prepare('INSERT INTO school_change_requests (student_id, from_school_id, to_school_id, note) VALUES (?,?,?,?)')
    .run(ava, enterprise, schoolIds['Shasta High School'], 'I transferred to Shasta High in October.');
  // Some students picked Enterprise's Dual Enrollment sections (taught on campus) instead of the college's.
  for (const [email, from, to] of [['maya.r@student.suhsd.net', 'ENGL 1A', 'ENGL C1000'], ['lucas.h@student.suhsd.net', 'ENGL 1A', 'ENGL C1000']]) {
    d.prepare(`UPDATE course_requests SET course_id = (SELECT id FROM courses WHERE kind = 'de' AND school_id = ? AND code = ?)
      WHERE student_id = (SELECT id FROM users WHERE email = ?) AND course_id = ?`).run(enterprise, to, email, courseIds[from]);
  }

  // Graduation years (2026–27 school year: seniors are the class of 2027), plus alumni to retire.
  d.exec("UPDATE users SET grad_year = 2027 + (12 - grade) WHERE role = 'student' AND grade IS NOT NULL");
  d.prepare("UPDATE users SET grade_confirmed_year = ? WHERE role = 'student' AND grade IS NOT NULL").run(schoolYearEnd());
  for (const [f, l, year] of [['Grace', 'Holt', 2022], ['Owen', 'Price', 2022], ['Lily', 'Shaw', 2023]] as [string, string, number][]) {
    const id = user(f, l, `${f.toLowerCase()}.${l.toLowerCase()}@alumni.example.org`, 'student', enterprise, { counselor: alvarez });
    d.prepare('UPDATE users SET grad_year = ? WHERE id = ?').run(year, id);
    d.prepare('INSERT INTO enrollments (student_id, term_id) VALUES (?,1)').run(id);
  }
  d.exec('COMMIT');
}

/**
 * Named accounts that must exist on every database, including a freshly reset one.
 * Created only if missing, so a changed password is never overwritten.
 */
function ensureAccounts(d: DatabaseSync) {
  const accounts = [
    { first: 'Tabitha', last: 'Miller', email: 'tmiller@shastacollege.edu', password: 'ShastaDE2027', level: 'super' },
  ];
  for (const a of accounts) {
    if (d.prepare('SELECT 1 FROM users WHERE email = ?').get(a.email)) continue;
    d.prepare("INSERT INTO users (first_name, last_name, email, role, status, password_hash, admin_level) VALUES (?,?,?,'admin','active',?,?)")
      .run(a.first, a.last, a.email, hashPassword(a.password), a.level);
  }
}

export function cryptoToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/** Classes of students whose (old, whole-plan) high school approval was done count as approved. */
function approveFromStepFour(d: DatabaseSync) {
  const rows = d.prepare("SELECT student_id, completed_at, data FROM step_progress WHERE step_id = 4 AND status = 'complete'").all() as { student_id: number; completed_at: string; data: string | null }[];
  const up = d.prepare(`UPDATE course_requests SET hs_status = 'approved', hs_by = ?, hs_at = ?, hs_signed_name = ?, hs_signature_file_id = ?, hs_sign_method = ?
    WHERE student_id = ? AND hs_status = 'pending'`);
  for (const r of rows) {
    const x = r.data ? JSON.parse(r.data) : {};
    up.run(x.counselor_id ?? x.admin_id ?? null, x.signed_at ?? r.completed_at, x.signed_name ?? null, x.signature_file_id ?? null, x.sign_method ?? null, r.student_id);
  }
}

/** Adds columns introduced after a database was first created. */
function migrate(d: DatabaseSync) {
  const cols = (d.prepare('PRAGMA table_info(users)').all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('disabled')) d.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('retired_at')) d.exec('ALTER TABLE users ADD COLUMN retired_at TEXT');
  if (!cols.includes('signature_file_id')) d.exec('ALTER TABLE users ADD COLUMN signature_file_id INTEGER');
  if (!cols.includes('is_young_approver')) d.exec('ALTER TABLE users ADD COLUMN is_young_approver INTEGER NOT NULL DEFAULT 0');
  if (!cols.includes('grade_confirmed_year')) {
    d.exec('ALTER TABLE users ADD COLUMN grade_confirmed_year INTEGER');
    // Students already here count as confirmed for this school year; they're asked again next July.
    d.prepare("UPDATE users SET grade_confirmed_year = ? WHERE role = 'student' AND grade IS NOT NULL").run(schoolYearEnd());
  }
  // GPA is no longer kept on student accounts.
  if (cols.includes('gpa')) d.exec('UPDATE users SET gpa = NULL WHERE gpa IS NOT NULL');
  if (!cols.includes('grad_year')) {
    d.exec('ALTER TABLE users ADD COLUMN grad_year INTEGER');
    // Best guess from grade, for the 2026–27 school year (seniors graduate in 2027).
    d.exec("UPDATE users SET grad_year = 2027 + (12 - grade) WHERE role = 'student' AND grade IS NOT NULL");
  }
  if (!cols.includes('share_with_parents')) {
    d.exec('ALTER TABLE users ADD COLUMN share_with_parents INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.includes('admin_level')) {
    d.exec("ALTER TABLE users ADD COLUMN admin_level TEXT CHECK (admin_level IN ('college','super'))");
    // Existing admins keep full access.
    d.exec("UPDATE users SET admin_level = 'super' WHERE role = 'admin'");
  }
  if (!cols.includes('staff_type')) {
    d.exec("ALTER TABLE users ADD COLUMN staff_type TEXT CHECK (staff_type IN ('counselor','admin','teacher','other'))");
    d.exec("UPDATE users SET staff_type = 'counselor' WHERE role = 'counselor'");
  }
  if (!cols.includes('is_college_counselor')) {
    d.exec('ALTER TABLE users ADD COLUMN is_college_counselor INTEGER NOT NULL DEFAULT 0');
  }
  const termCols = (d.prepare('PRAGMA table_info(terms)').all() as { name: string }[]).map((c) => c.name);
  if (!termCols.includes('summer')) {
    d.exec('ALTER TABLE terms ADD COLUMN summer INTEGER NOT NULL DEFAULT 0');
    d.exec("UPDATE terms SET summer = 1 WHERE name LIKE '%summer%'");
  }
  const reqCols = (d.prepare('PRAGMA table_info(course_requests)').all() as { name: string }[]).map((c) => c.name);
  if (!reqCols.includes('term_id')) d.exec('ALTER TABLE course_requests ADD COLUMN term_id INTEGER REFERENCES terms(id)');
  if (!reqCols.includes('hs_status')) {
    // High school approval moved from one step to each class per term: rebuild the table (its key now includes the term).
    d.exec(`
      CREATE TABLE course_requests_new (
        student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL REFERENCES courses(id),
        term_id INTEGER REFERENCES terms(id),
        hs_status TEXT NOT NULL DEFAULT 'pending' CHECK (hs_status IN ('pending','approved')),
        hs_by INTEGER REFERENCES users(id), hs_at TEXT, hs_signed_name TEXT, hs_signature_file_id INTEGER, hs_sign_method TEXT,
        PRIMARY KEY (student_id, course_id, term_id)
      );
      INSERT INTO course_requests_new (student_id, course_id, term_id) SELECT student_id, course_id, term_id FROM course_requests;
      DROP TABLE course_requests;
      ALTER TABLE course_requests_new RENAME TO course_requests;
    `);
    approveFromStepFour(d);
  }
  const courseCols = (d.prepare('PRAGMA table_info(courses)').all() as { name: string }[]).map((c) => c.name);
  if (!courseCols.includes('prerequisite')) d.exec('ALTER TABLE courses ADD COLUMN prerequisite TEXT');
  // Courses split into Concurrent (college) and Dual (per high school). Existing courses become Concurrent.
  if (!courseCols.includes('kind')) {
    d.exec("ALTER TABLE courses ADD COLUMN kind TEXT NOT NULL DEFAULT 'ce' CHECK (kind IN ('ce','de'))");
    d.exec('ALTER TABLE courses ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE CASCADE');
    d.exec('ALTER TABLE courses ADD COLUMN period TEXT');
    d.exec('ALTER TABLE courses ADD COLUMN teacher TEXT');
    d.exec('ALTER TABLE courses ADD COLUMN active INTEGER NOT NULL DEFAULT 1');
  }
  // Steps 7 (Clear units), 8 (Prerequisite review), 9 + 10 (young students) arrived after launch: add them, on for every school.
  if (d.prepare('SELECT 1 FROM steps WHERE id = 1').get()) {
    for (const id of [7, 8, 9, 10]) {
      if (d.prepare('SELECT 1 FROM steps WHERE id = ?').get(id)) continue;
      const def = STEP_DEFS.find((x) => x.id === id)!;
      d.prepare('INSERT INTO steps (id, name, short_name, description) VALUES (?,?,?,?)').run(def.id, def.name, def.short, def.description);
      d.prepare("INSERT OR IGNORE INTO school_steps (school_id, step_id, mode) SELECT id, ?, 'required' FROM schools").run(id);
    }
  }
}

/** Steps in workflow order (step ids aren't in order, since Clear units was added later). */
export const STEP_ORDER = STEP_DEFS.map((s) => s.id);
export const stepIndex = (id: number) => STEP_ORDER.indexOf(id);

/** The June that ends the current school year (Pacific time). Kept here so db.ts doesn't import workflow.ts. */
function schoolYearEnd(): number {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).format(new Date()).split('-').map(Number);
  return m >= 7 ? y + 1 : y;
}
