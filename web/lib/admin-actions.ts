'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { cryptoToken, db, DEFAULT_MODES, STEP_DEFS, tx } from './db';
import { currentTerm, fromPacificInput } from './workflow';

const ROLES = ['student', 'counselor', 'admin'] as const; // parents are invited by their student
const MODES = ['required', 'optional', 'off'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STAFF_TYPES = ['counselor', 'admin', 'teacher', 'other'];
function staffTypeOf(formData: FormData) {
  const t = String(formData.get('staff_type') || '');
  return STAFF_TYPES.includes(t) ? t : 'counselor';
}

export async function addUser(formData: FormData) {
  await requireAdmin('super');
  const first = String(formData.get('first') || '').trim();
  const last = String(formData.get('last') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || '') as (typeof ROLES)[number];
  const schoolId = Number(formData.get('school')) || null;
  const level = formData.get('admin_level') === 'super' ? 'super' : 'college';
  const collegeCounselor = role === 'admin' && formData.get('college_counselor') === 'on' ? 1 : 0;
  const staffType = role === 'counselor' ? staffTypeOf(formData) : null;
  const fail = (e: string) => redirect(`/admin/users?add=1&error=${e}`);
  if (!first || !last) fail('name');
  if (!EMAIL.test(email)) fail('email');
  if (!ROLES.includes(role)) fail('role');
  if (role !== 'admin' && !schoolId) fail('school');
  if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail('exists');
  if (schoolId && !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(schoolId)) fail('school');

  const token = cryptoToken();
  const id = tx(() => {
    const counselor = role === 'student'
      ? (db().prepare("SELECT id FROM users WHERE role = 'counselor' AND school_id = ? ORDER BY status = 'active' DESC, id LIMIT 1").get(schoolId) as { id: number } | undefined)?.id ?? null
      : null;
    const r = db()
      .prepare("INSERT INTO users (first_name, last_name, email, role, school_id, status, invite_token, counselor_id, admin_level, is_college_counselor, staff_type) VALUES (?,?,?,?,?,'invited',?,?,?,?,?)")
      .run(first, last, email, role, role === 'admin' ? null : schoolId, token, counselor, role === 'admin' ? level : null, collegeCounselor, staffType);
    const uid = Number(r.lastInsertRowid);
    if (role === 'student') {
      const termId = Number(formData.get('term'));
      const term = termId && db().prepare('SELECT id FROM terms WHERE id = ?').get(termId) ? termId : currentTerm().id;
      db().prepare('INSERT INTO enrollments (student_id, term_id) VALUES (?,?)').run(uid, term);
    }
    return uid;
  });
  redirect(`/admin/users?invited=${id}`);
}

export async function addSchool(formData: FormData) {
  await requireAdmin('super');
  const name = String(formData.get('name') || '').trim();
  const district = String(formData.get('district') || '').trim();
  const des = formData.get('designation') === 'NON_CCAP' ? 'NON_CCAP' : 'CCAP';
  if (!name || !district) redirect('/admin/schools?add=1&error=name');
  const id = tx(() => {
    const r = db().prepare('INSERT INTO schools (name, district, designation) VALUES (?,?,?)').run(name, district, des);
    const sid = Number(r.lastInsertRowid);
    const ins = db().prepare('INSERT INTO school_steps (school_id, step_id, mode) VALUES (?,?,?)');
    for (const s of STEP_DEFS) ins.run(sid, s.id, DEFAULT_MODES[des][s.id]);
    const insC = db().prepare('INSERT INTO school_courses (school_id, course_id) SELECT ?, id FROM courses');
    insC.run(sid);
    return sid;
  });
  redirect(`/admin/schools/${id}?created=1`);
}

export async function saveSchool(formData: FormData) {
  await requireAdmin('super');
  const id = Number(formData.get('id'));
  if (!db().prepare('SELECT 1 FROM schools WHERE id = ?').get(id)) redirect('/admin/schools');
  const des = formData.get('designation') === 'NON_CCAP' ? 'NON_CCAP' : 'CCAP';
  const agreement = String(formData.get('agreement_id') || '').trim() || null;
  const expires = String(formData.get('agreement_expires') || '').trim() || null;
  if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires)) redirect(`/admin/schools/${id}?error=date`);
  const modes: Record<number, string> = {};
  for (const s of STEP_DEFS) {
    const m = String(formData.get(`step_${s.id}`) || '');
    modes[s.id] = (MODES as readonly string[]).includes(m) ? m : 'required';
  }
  if (!Object.values(modes).includes('required')) redirect(`/admin/schools/${id}?error=required`);
  tx(() => {
    db().prepare('UPDATE schools SET designation = ?, agreement_id = ?, agreement_expires = ? WHERE id = ?').run(
      des, des === 'CCAP' ? agreement : null, des === 'CCAP' ? expires : null, id);
    const up = db().prepare(
      'INSERT INTO school_steps (school_id, step_id, mode) VALUES (?,?,?) ON CONFLICT(school_id, step_id) DO UPDATE SET mode = excluded.mode');
    for (const s of STEP_DEFS) up.run(id, s.id, modes[s.id]);
  });
  redirect(`/admin/schools/${id}?saved=1`);
}

export async function saveTerm(formData: FormData) {
  await requireAdmin('super');
  const id = Number(formData.get('id'));
  const name = String(formData.get('name') || '').trim().slice(0, 60);
  const iso = fromPacificInput(String(formData.get('opens') || ''));
  const active = formData.get('active') === 'on' ? 1 : 0;
  if (!name || !iso) redirect(`/admin/terms?error=fields&term=${id}`);
  // Keep at least one active term so new students always have somewhere to go.
  if (!active && !db().prepare('SELECT 1 FROM terms WHERE is_current = 1 AND id != ?').get(id)) redirect(`/admin/terms?error=last&term=${id}`);
  db().prepare('UPDATE terms SET name = ?, registration_opens = ?, is_current = ? WHERE id = ?').run(name, iso, active, id);
  redirect(`/admin/terms?saved=${id}`);
}

export async function addTerm(formData: FormData) {
  await requireAdmin('super');
  const name = String(formData.get('name') || '').trim().slice(0, 60);
  const iso = fromPacificInput(String(formData.get('opens') || ''));
  if (!name || !iso) redirect('/admin/terms?error=fields');
  if (db().prepare('SELECT 1 FROM terms WHERE name = ?').get(name)) redirect('/admin/terms?error=exists');
  const id = Number(db().prepare('INSERT INTO terms (name, registration_opens, is_current) VALUES (?,?,1)').run(name, iso).lastInsertRowid);
  redirect(`/admin/terms?saved=${id}`);
}

/** Super admin: change an admin's level or college-counselor flag. */
export async function updateAdmin(formData: FormData) {
  const me = await requireAdmin('super');
  const id = Number(formData.get('id'));
  const u = db().prepare("SELECT id FROM users WHERE id = ? AND role = 'admin'").get(id);
  if (!u) redirect('/admin/users?role=admin');
  const level = formData.get('admin_level') === 'super' ? 'super' : 'college';
  // Don't let a super admin lock everyone out by demoting themselves.
  if (id === me.id && level !== 'super') redirect('/admin/users?role=admin&error=self');
  const primary = formData.getAll('primary').map(Number).filter((n) => n > 0);
  tx(() => {
    db().prepare('UPDATE users SET admin_level = ?, is_college_counselor = ? WHERE id = ?').run(level, formData.get('college_counselor') === 'on' ? 1 : 0, id);
    db().prepare('DELETE FROM admin_schools WHERE admin_id = ?').run(id);
    const ins = db().prepare('INSERT INTO admin_schools (admin_id, school_id) SELECT ?, id FROM schools WHERE id = ?');
    for (const sid of primary) ins.run(id, sid);
  });
  redirect('/admin/users?role=admin&updated=' + id);
}

/** Super admin: record what kind of high school staff someone is (counselor, admin, teacher or other). */
export async function updateStaffType(formData: FormData) {
  await requireAdmin('super');
  const id = Number(formData.get('id'));
  db().prepare("UPDATE users SET staff_type = ? WHERE id = ? AND role = 'counselor'").run(staffTypeOf(formData), id);
  redirect('/admin/users?role=counselor&updated=' + id);
}
