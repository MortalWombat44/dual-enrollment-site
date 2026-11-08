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
  grad_year: number | null;
  grade_confirmed_year: number | null;
  signature_file_id: number | null;
  retired_at: string | null;
  student_number: string | null;
  counselor_id: number | null;
  admin_level: 'college' | 'super' | null;
  is_college_counselor: number;
  /** College admins who make the final call on young students (8th grade and below). */
  is_young_approver: number;
  /** College admins notified about young student / homeschool items to review. */
  is_young_lead: number;
  is_homeschool_lead: number;
  date_of_birth: string | null;
  phone: string | null;
  address_line: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  plans_shasta: 'yes' | 'no' | 'unsure' | null;
  plans_year: number | null;
  hs_approver_name: string | null;
  hs_approver_email: string | null;
};

const COOKIE = 'de_session';
const SESSION_DAYS = 14;

export const HOME: Record<Role, string> = {
  student: '/student',
  parent: '/parent',
  counselor: '/counselor',
  admin: '/admin/students',
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
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.school_id, u.status, u.title, u.grade, u.grad_year, u.grade_confirmed_year, u.signature_file_id, u.retired_at, u.student_number, u.counselor_id, u.admin_level, u.is_college_counselor, u.is_young_approver, u.is_young_lead, u.is_homeschool_lead,
         u.date_of_birth, u.phone, u.address_line, u.city, u.state, u.zip, u.plans_shasta, u.plans_year, u.hs_approver_name, u.hs_approver_email
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.disabled = 0`,
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

/** Any admin. College admins work with students; super admins can also manage users, schools and terms. */
export async function requireAdmin(level: 'college' | 'super' = 'college'): Promise<User> {
  const u = await requireRole('admin');
  if (level === 'super' && u.admin_level !== 'super') redirect('/admin/students');
  return u;
}
