import 'server-only';
import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';

export type Role = 'student' | 'parent' | 'counselor' | 'admin';
export type User = {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: Role;
  school_id: number | null;
  status: 'invited' | 'active';
  title: string | null;
  grade: number | null;
  gpa: number | null;
  student_number: string | null;
  counselor_id: number | null;
};

const COOKIE = 'de_session';
const SESSION_DAYS = 14;

export const HOME: Record<Role, string> = {
  student: '/student',
  parent: '/parent',
  counselor: '/counselor',
  admin: '/admin/users',
};

export async function createSession(userId: number) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db().prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)').run(token, userId, expires.toISOString());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE token = ?').run(token);
  jar.delete(COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = db()
    .prepare(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.school_id, u.status, u.title, u.grade, u.gpa, u.student_number, u.counselor_id
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(token, new Date().toISOString()) as User | undefined;
  return row ?? null;
}

export async function requireRole(...roles: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) redirect('/login');
  if (!roles.includes(u.role)) redirect(HOME[u.role]);
  return u;
}
