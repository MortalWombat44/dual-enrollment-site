'use server';
import { redirect } from 'next/navigation';
import { db, tx } from './db';
import { currentTerm } from './workflow';
import { createSession, destroySession, HOME, type Role } from './auth';
import { hashPassword, verifyPassword } from './password';

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const u = db().prepare("SELECT id, role, password_hash, status FROM users WHERE email = ?").get(email) as
    | { id: number; role: Role; password_hash: string | null; status: string }
    | undefined;
  if (!u || u.status !== 'active' || !verifyPassword(password, u.password_hash)) {
    redirect('/login?error=1&email=' + encodeURIComponent(email));
  }
  await createSession(u.id);
  redirect(HOME[u.role]);
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  const u = db().prepare("SELECT id, role FROM users WHERE invite_token = ? AND status = 'invited'").get(token) as
    | { id: number; role: Role }
    | undefined;
  if (!u) redirect('/login?error=invite');
  if (password.length < 8 || password !== confirm) redirect(`/invite/${token}?error=1`);
  db().prepare("UPDATE users SET password_hash = ?, status = 'active', invite_token = NULL WHERE id = ?").run(hashPassword(password), u.id);
  await createSession(u.id);
  redirect(HOME[u.role]);
}

/** Students create their own account and pick their high school. */
export async function signUp(formData: FormData) {
  const first = String(formData.get('first') || '').trim().slice(0, 60);
  const last = String(formData.get('last') || '').trim().slice(0, 60);
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 200);
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  const schoolId = Number(formData.get('school'));
  const num = String(formData.get('student_number') || '').trim().slice(0, 20) || null;
  const keep = new URLSearchParams({ first, last, email, school: String(schoolId || ''), id: num ?? '' });
  const fail = (e: string) => redirect(`/signup?error=${e}&${keep}`);
  if (!first || !last) fail('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email');
  if (password.length < 8 || password !== confirm) fail('password');
  if (!schoolId || !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(schoolId)) fail('school');
  if (num && !/^[A-Za-z0-9-]+$/.test(num)) fail('id');
  if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail('exists');
  const id = tx(() => {
    const counselor = db()
      .prepare("SELECT id FROM users WHERE role = 'counselor' AND school_id = ? ORDER BY status = 'active' DESC, id LIMIT 1")
      .get(schoolId) as { id: number } | undefined;
    // A Shasta College ID already on another account is allowed here; college admins see it flagged.
    const uid = Number(db()
      .prepare("INSERT INTO users (first_name, last_name, email, role, school_id, status, password_hash, student_number, counselor_id) VALUES (?,?,?,'student',?,'active',?,?,?)")
      .run(first, last, email, schoolId, hashPassword(password), num, counselor?.id ?? null).lastInsertRowid);
    db().prepare('INSERT INTO enrollments (student_id, term_id) VALUES (?,?)').run(uid, currentTerm().id);
    return uid;
  });
  await createSession(id);
  redirect('/student');
}
