import 'server-only';
import { db } from './db';
import { mailConfigured, sendMail } from './mail';
import { siteOrigin } from './site';

export type NoticeKind = 'young' | 'homeschool' | 'help' | 'nudge' | 'prereq' | 'transcript' | 'approver';
const ACTIVE_ADMIN = "role = 'admin' AND disabled = 0 AND status = 'active'";

/** Add an in-app notification for each admin, and email them when email is set up. */
export async function notifyUsers(userIds: number[], kind: NoticeKind, studentId: number | null, message: string) {
  const ids = [...new Set(userIds)];
  if (!ids.length) return;
  const at = new Date().toISOString();
  const ins = db().prepare('INSERT INTO notifications (user_id, kind, student_id, message, created_at) VALUES (?,?,?,?,?)');
  for (const id of ids) ins.run(id, kind, studentId, message, at);
  if (!mailConfigured()) return;
  const link = `${await siteOrigin()}/admin/students${studentId ? `?tab=all&student=${studentId}` : ''}`;
  const emails = db().prepare(`SELECT email FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as { email: string }[];
  for (const e of emails) await sendMail({ to: e.email, subject: `Dual Enrollment: ${message.slice(0, 80)}`, text: `${message}\n\nOpen it: ${link}\n\nShasta College Dual Enrollment` });
}

/**
 * Young student or homeschool items: notify the admins flagged as that population's lead
 * (Young Student Lead / Homeschool Lead on the Users page). With no lead set, super admins get it so it isn't missed.
 */
export async function notifyLeads(kind: 'young' | 'homeschool', studentId: number, message: string) {
  const col = kind === 'young' ? 'is_young_lead' : 'is_homeschool_lead';
  let ids = (db().prepare(`SELECT id FROM users WHERE ${ACTIVE_ADMIN} AND ${col} = 1`).all() as { id: number }[]).map((r) => r.id);
  if (!ids.length) ids = (db().prepare(`SELECT id FROM users WHERE ${ACTIVE_ADMIN} AND admin_level = 'super'`).all() as { id: number }[]).map((r) => r.id);
  await notifyUsers(ids, kind, studentId, message);
}

/** Admins for a student's school: those with it as a primary school, or every college admin if no one has it. */
export function adminsForStudent(studentId: number): number[] {
  const d = db();
  const school = (d.prepare('SELECT school_id FROM users WHERE id = ?').get(studentId) as { school_id: number | null } | undefined)?.school_id;
  const primary = school ? (d.prepare(`SELECT a.admin_id AS id FROM admin_schools a JOIN users u ON u.id = a.admin_id WHERE a.school_id = ? AND ${ACTIVE_ADMIN.replace(/(role|disabled|status)/g, 'u.$1')}`).all(school) as { id: number }[]) : [];
  if (primary.length) return primary.map((r) => r.id);
  return (d.prepare(`SELECT id FROM users WHERE ${ACTIVE_ADMIN}`).all() as { id: number }[]).map((r) => r.id);
}

export function unreadCount(userId: number): number {
  return (db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId) as { n: number }).n;
}
