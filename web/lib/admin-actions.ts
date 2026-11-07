'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { cryptoToken, db, DEFAULT_MODES, STEP_DEFS, tx } from './db';
import { currentTerm } from './workflow';

const ROLES = ['student', 'counselor', 'admin'] as const; // parents are invited by their student
const MODES = ['required', 'optional', 'off'] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function addUser(formData: FormData) {
  await requireRole('admin');
  const first = String(formData.get('first') || '').trim();
  const last = String(formData.get('last') || '').trim();
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const role = String(formData.get('role') || '') as (typeof ROLES)[number];
  const schoolId = Number(formData.get('school')) || null;
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
      .prepare("INSERT INTO users (first_name, last_name, email, role, school_id, status, invite_token, counselor_id) VALUES (?,?,?,?,?,'invited',?,?)")
      .run(first, last, email, role, role === 'admin' ? null : schoolId, token, counselor);
    const uid = Number(r.lastInsertRowid);
    if (role === 'student') db().prepare('INSERT INTO enrollments (student_id, term_id) VALUES (?,?)').run(uid, currentTerm().id);
    return uid;
  });
  redirect(`/admin/users?invited=${id}`);
}

export async function addSchool(formData: FormData) {
  await requireRole('admin');
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
  await requireRole('admin');
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
