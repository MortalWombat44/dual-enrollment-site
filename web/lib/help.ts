import 'server-only';
import { db } from './db';
import { adminsForStudent, notifyUsers } from './notify';

export type HelpRequest = { id: number; student_id: number; raised_by: number | null; raised_role: 'student' | 'counselor'; message: string; created_at: string; status: 'open' | 'resolved'; resolved_by: number | null; resolved_at: string | null; reply: string | null; by_name?: string | null };

export function helpRequests(studentId: number): HelpRequest[] {
  return db().prepare(`SELECT h.*, u.first_name || ' ' || u.last_name AS by_name FROM help_requests h LEFT JOIN users u ON u.id = h.raised_by
    WHERE h.student_id = ? ORDER BY h.id DESC LIMIT 20`).all(studentId) as HelpRequest[];
}
export function openHelpStudentIds(): Set<number> {
  return new Set((db().prepare("SELECT DISTINCT student_id FROM help_requests WHERE status = 'open'").all() as { student_id: number }[]).map((r) => r.student_id));
}

/**
 * Raise a help flag. College admins with the student's school as a primary school get it; if no one has that
 * school, every college admin does.
 */
export async function raiseHelp(studentId: number, by: { id: number; role: 'student' | 'counselor'; name: string }, message: string) {
  db().prepare("INSERT INTO help_requests (student_id, raised_by, raised_role, message, created_at) VALUES (?,?,?,?,?)").run(studentId, by.id, by.role, message, new Date().toISOString());
  const s = db().prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(studentId) as { first_name: string; last_name: string };
  const who = by.role === 'student' ? `${s.first_name} ${s.last_name} needs help` : `${by.name} (high school staff) flagged ${s.first_name} ${s.last_name} for help`;
  await notifyUsers(adminsForStudent(studentId), 'help', studentId, `${who}: “${message.slice(0, 200)}”`);
}
