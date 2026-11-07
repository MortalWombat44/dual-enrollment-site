import 'server-only';
import { db } from './db';
import type { User } from './auth';

/** Is this parent linked to this student? (Enough to sign consent, not to see records.) */
export function isParentOf(u: User, studentId: number): boolean {
  return u.role === 'parent' && !!db().prepare('SELECT 1 FROM parent_links WHERE parent_id = ? AND student_id = ?').get(u.id, studentId);
}

/** Has the student turned on “Share my progress with my parents / guardians”? */
export function sharesWithParents(studentId: number): boolean {
  const r = db().prepare('SELECT share_with_parents AS s FROM users WHERE id = ?').get(studentId) as { s: number } | undefined;
  return r?.s === 1;
}

/** Can this user see this student's records (progress, consent, files)? */
export function canSeeStudent(u: User, studentId: number): boolean {
  if (u.role === 'admin') return true;
  if (u.role === 'student') return u.id === studentId;
  if (u.role === 'parent') return isParentOf(u, studentId) && sharesWithParents(studentId);
  if (u.role === 'counselor') {
    return !!db().prepare("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND school_id = ?").get(studentId, u.school_id);
  }
  return false;
}

/** The schools an admin is primarily responsible for (set by a super admin). */
export function primarySchoolIds(adminId: number): number[] {
  return (db().prepare('SELECT school_id FROM admin_schools WHERE admin_id = ?').all(adminId) as { school_id: number }[]).map((r) => r.school_id);
}
