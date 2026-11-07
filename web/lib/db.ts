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
  gpa REAL,
  student_number TEXT,
  counselor_id INTEGER REFERENCES users(id),
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
  is_current INTEGER NOT NULL DEFAULT 0
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
  schedule TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS school_courses (
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  PRIMARY KEY (school_id, course_id)
);
CREATE TABLE IF NOT EXISTS course_requests (
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES courses(id),
  PRIMARY KEY (student_id, course_id)
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
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
`;

type Mode = 'required' | 'optional' | 'off';
export const STEP_DEFS: { id: number; name: string; short: string; description: string }[] = [
  { id: 1, name: 'Apply on CCCApply', short: 'CCCApply', description: 'Creates the Shasta College student record' },
  { id: 2, name: 'Course selection', short: 'Course selection', description: "Student picks from this school's approved sections" },
  { id: 3, name: 'Parent consent form', short: 'Parent consent', description: 'E-signature or uploaded signed form' },
  { id: 4, name: 'Counselor approval', short: 'Counselor approval', description: 'High school counselor reviews the course plan' },
  { id: 5, name: 'Register for classes', short: 'Register', description: 'Opens on the term registration date' },
  { id: 6, name: 'Textbooks & Canvas access', short: 'Textbooks & Canvas', description: "Shown to students, doesn't block completion" },
];

export const DEFAULT_MODES: Record<'CCAP' | 'NON_CCAP', Record<number, Mode>> = {
  CCAP: { 1: 'required', 2: 'required', 3: 'required', 4: 'off', 5: 'required', 6: 'optional' },
  NON_CCAP: { 1: 'required', 2: 'required', 3: 'required', 4: 'required', 5: 'required', 6: 'required' },
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
    const count = conn.prepare('SELECT COUNT(*) AS n FROM steps').get() as { n: number };
    if (count.n === 0) seed(conn);
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

  d.prepare("INSERT INTO terms (id, name, registration_opens, is_current) VALUES (1, 'Spring 2027', '2026-12-02T16:00:00Z', 1)").run();

  const schools: [string, string, 'CCAP' | 'NON_CCAP', string | null, string | null][] = [
    ['Anderson High School', 'Anderson Union HSD', 'CCAP', 'CCAP-AUHSD-2025', '2028-06-30'],
    ['Enterprise High School', 'Shasta Union HSD', 'CCAP', 'CCAP-SUHSD-2024', '2027-06-30'],
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
      let mode = DEFAULT_MODES[des][s.id];
      // Enterprise HS keeps counselor approval on (matches the student/counselor screens).
      if (name === 'Enterprise High School' && s.id === 4) mode = 'required';
      if (name === 'Shasta High School' && s.id === 4) mode = 'required';
      const note =
        s.id === 4 && mode === 'off' ? 'Pre-approved under the CCAP agreement' :
        s.id === 5 && des === 'CCAP' ? 'Done by Admissions & Records for CCAP cohorts' : null;
      insMode.run(id, s.id, mode, note);
    }
  }
  const enterprise = schoolIds['Enterprise High School'];
  const anderson = schoolIds['Anderson High School'];

  const courses: [string, string, number, string][] = [
    ['ENGL 1A', 'College Composition', 3, 'Tu/Th 3:30 PM'],
    ['COMM 1', 'Public Speaking', 3, 'Online'],
    ['MATH 13', 'Introduction to Statistics', 4, 'M/W 3:30 PM'],
    ['HIST 17', 'United States History', 3, 'Online'],
    ['PSY 1', 'General Psychology', 3, 'Online'],
    ['AJ 1', 'Introduction to Administration of Justice', 3, 'Tu/Th 4:00 PM'],
  ];
  const insCourse = d.prepare('INSERT INTO courses (code, title, units, schedule) VALUES (?,?,?,?)');
  const courseIds: Record<string, number> = {};
  for (const c of courses) courseIds[c[0]] = Number(insCourse.run(...c).lastInsertRowid);
  const insSC = d.prepare('INSERT INTO school_courses (school_id, course_id) VALUES (?,?)');
  for (const sid of Object.values(schoolIds)) for (const cid of Object.values(courseIds)) insSC.run(sid, cid);

  const pw = hashPassword('shasta2027');
  const insUser = d.prepare(`INSERT INTO users (first_name, last_name, email, role, school_id, status, title, password_hash, invite_token, grade, gpa, student_number, counselor_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const user = (f: string, l: string, e: string, role: string, school: number | null, extra: Partial<{ status: string; title: string; grade: number; gpa: number; num: string; counselor: number }> = {}) =>
    Number(insUser.run(f, l, e, role, school, extra.status ?? 'active', extra.title ?? null,
      extra.status === 'invited' ? null : pw, extra.status === 'invited' ? cryptoToken() : null,
      extra.grade ?? null, extra.gpa ?? null, extra.num ?? null, extra.counselor ?? null).lastInsertRowid);

  user('Dana', 'Ortiz', 'dortiz@shastacollege.edu', 'admin', null, { title: 'Super admin' });
  user('Jordan', 'Kim', 'jkim@shastacollege.edu', 'admin', null, { title: 'Outreach' });
  const alvarez = user('Rosa', 'Alvarez', 'ralvarez@suhsd.net', 'counselor', enterprise, { title: 'Ms.' });
  user('Tom', 'Becker', 'tbecker@andersonhigh.org', 'counselor', anderson, { status: 'invited', title: 'Mr.' });

  const insEnroll = d.prepare('INSERT INTO enrollments (student_id, term_id, started_at, step_modes) VALUES (?,1,?,?)');
  const insProg = d.prepare('INSERT INTO step_progress (student_id, step_id, status, completed_at, data) VALUES (?,?,?,?,?)');
  const insReq = d.prepare('INSERT INTO course_requests (student_id, course_id) VALUES (?,?)');
  const modesFor = (sid: number) => JSON.stringify(Object.fromEntries(
    (d.prepare('SELECT step_id, mode FROM school_steps WHERE school_id = ?').all(sid) as { step_id: number; mode: string }[]).map((r) => [r.step_id, r.mode])));

  const students: { f: string; l: string; e: string; grade: number; gpa: number; num: string; courses: string[]; days: [string, string?, string?] }[] = [
    { f: 'Maya', l: 'Rivera', e: 'maya.r@student.suhsd.net', grade: 11, gpa: 3.7, num: '0412893', courses: ['ENGL 1A', 'COMM 1'], days: ['2026-10-14T17:10:00Z', '2026-10-28T22:05:00Z', '2026-11-04T03:42:00Z'] },
    { f: 'Ethan', l: 'Brooks', e: 'ethan.b@student.suhsd.net', grade: 12, gpa: 3.4, num: '0412910', courses: ['MATH 13', 'HIST 17'], days: ['2026-10-12T18:00:00Z', '2026-10-25T18:00:00Z', '2026-11-05T18:00:00Z'] },
    { f: 'Sofia', l: 'Nguyen', e: 'sofia.n@student.suhsd.net', grade: 11, gpa: 3.9, num: '0412933', courses: ['PSY 1'], days: ['2026-10-15T18:00:00Z', '2026-10-29T18:00:00Z', '2026-11-05T19:00:00Z'] },
    { f: 'Lucas', l: 'Hart', e: 'lucas.h@student.suhsd.net', grade: 12, gpa: 3.1, num: '0412947', courses: ['ENGL 1A', 'AJ 1'], days: ['2026-10-16T18:00:00Z', '2026-10-30T18:00:00Z', '2026-11-06T18:00:00Z'] },
    { f: 'Ava', l: 'Thompson', e: 'ava.t@student.suhsd.net', grade: 10, gpa: 3.8, num: '0412958', courses: ['COMM 1'], days: ['2026-10-20T18:00:00Z', '2026-11-01T18:00:00Z', '2026-11-07T17:00:00Z'] },
    { f: 'Noah', l: 'Patel', e: 'noah.p@student.suhsd.net', grade: 11, gpa: 3.5, num: '0412966', courses: ['PSY 1', 'COMM 1'], days: ['2026-10-21T18:00:00Z', '2026-11-02T18:00:00Z'] },
    { f: 'Isabella', l: 'Cruz', e: 'isabella.c@student.suhsd.net', grade: 12, gpa: 3.6, num: '0412971', courses: ['ENGL 1A'], days: ['2026-10-22T18:00:00Z', '2026-11-03T18:00:00Z'] },
  ];
  let mayaId = 0;
  for (const s of students) {
    const id = user(s.f, s.l, s.e, 'student', enterprise, { grade: s.grade, gpa: s.gpa, num: s.num, counselor: alvarez });
    if (s.f === 'Maya') mayaId = id;
    insEnroll.run(id, s.days[0], modesFor(enterprise));
    insProg.run(id, 1, 'complete', s.days[0], JSON.stringify({ confirmation: 'CCC-' + s.num }));
    if (s.days[1]) {
      insProg.run(id, 2, 'complete', s.days[1], null);
      for (const c of s.courses) insReq.run(id, courseIds[c]);
    }
    if (s.days[2]) insProg.run(id, 3, 'complete', s.days[2], JSON.stringify({ method: 'esign', signer: `${s.f === 'Maya' ? 'Laura' : 'Parent of ' + s.f} ${s.l}` }));
  }
  const laura = user('Laura', 'Rivera', 'laura.rivera@gmail.com', 'parent', enterprise);
  d.prepare('INSERT INTO parent_links (parent_id, student_id) VALUES (?,?)').run(laura, mayaId);

  // A not-yet-started student whose parent can try the consent flow end to end.
  const jamie = user('Jamie', 'Lee', 'jamie.l@student.andersonhigh.org', 'student', anderson, { grade: 11, gpa: 3.3, num: '0413002' });
  d.prepare('INSERT INTO enrollments (student_id, term_id, started_at, step_modes) VALUES (?,1,NULL,NULL)').run(jamie);
  const chris = user('Chris', 'Lee', 'chris.lee@gmail.com', 'parent', anderson);
  d.prepare('INSERT INTO parent_links (parent_id, student_id) VALUES (?,?)').run(chris, jamie);
  d.exec('COMMIT');
}

export function cryptoToken() {
  return crypto.randomBytes(24).toString('base64url');
}
