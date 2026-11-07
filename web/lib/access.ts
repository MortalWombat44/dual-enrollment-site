import 'server-only';
import { db } from './db';
import type { User } from './auth';

/** Can this user see this student's records (consent, files)? */
export function canSeeStudent(u: User, studentId: number): boolean {
  if (u.role === 'admin') return true;
  if (u.role === 'student') return u.id === studentId;
  if (u.role === 'parent') {
    return !!db().prepare('SELECT 1 FROM parent_links WHERE parent_id = ? AND student_id = ?').get(u.id, studentId);
  }
  if (u.role === 'counselor') {
    return !!db().prepare("SELECT 1 FROM users WHERE id = ? AND role = 'student' AND school_id = ?").get(studentId, u.school_id);
  }
  return false;
}
