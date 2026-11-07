'use server';
import { redirect } from 'next/navigation';
import { db } from './db';
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
