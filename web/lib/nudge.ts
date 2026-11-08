import 'server-only';
import { db } from './db';
import { notifyUsers } from './notify';

export type Nudge = { id: number; student_id: number; nudged_by: number | null; by_name: string | null; note: string | null; created_at: string };

/** Open nudges on prerequisite review (step 8), by student. */
export function openNudges(): Map<number, Nudge> {
  const rows = db().prepare(`SELECT n.id, n.student_id, n.nudged_by, u.first_name || ' ' || u.last_name AS by_name, n.note, n.created_at
    FROM nudges n LEFT JOIN users u ON u.id = n.nudged_by WHERE n.step_id = 8 AND n.cleared_at IS NULL ORDER BY n.id`).all() as Nudge[];
  return new Map(rows.map((r) => [r.student_id, r]));
}

/** A prerequisite decision (or override) clears the student's nudge. */
export function clearNudges(studentId: number) {
  db().prepare('UPDATE nudges SET cleared_at = ? WHERE student_id = ? AND step_id = 8 AND cleared_at IS NULL').run(new Date().toISOString(), studentId);
}

/**
 * Nudge: tell college counselors to prioritize this student's prerequisite review. Counselors with the student's
 * school as a primary school get it; if none, every college counselor does.
 */
export async function nudgePrereq(studentId: number, by: { id: number; name: string }, note: string | null) {
  const d = db();
  if (d.prepare('SELECT 1 FROM nudges WHERE student_id = ? AND step_id = 8 AND cleared_at IS NULL').get(studentId)) {
    d.prepare('UPDATE nudges SET note = COALESCE(?, note), nudged_by = ?, created_at = ? WHERE student_id = ? AND step_id = 8 AND cleared_at IS NULL')
      .run(note, by.id, new Date().toISOString(), studentId);
  } else {
    d.prepare('INSERT INTO nudges (student_id, step_id, nudged_by, note, created_at) VALUES (?, 8, ?, ?, ?)').run(studentId, by.id, note, new Date().toISOString());
  }
  const active = "u.role = 'admin' AND u.disabled = 0 AND u.status = 'active' AND u.is_college_counselor = 1";
  const school = (d.prepare('SELECT school_id FROM users WHERE id = ?').get(studentId) as { school_id: number | null }).school_id;
  let ids = (d.prepare(`SELECT u.id FROM admin_schools a JOIN users u ON u.id = a.admin_id WHERE a.school_id = ? AND ${active}`).all(school) as { id: number }[]).map((r) => r.id);
  if (!ids.length) ids = (d.prepare(`SELECT u.id FROM users u WHERE ${active}`).all() as { id: number }[]).map((r) => r.id);
  const s = d.prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(studentId) as { first_name: string; last_name: string };
  await notifyUsers(ids.filter((id) => id !== by.id), 'nudge', studentId,
    `${by.name} nudged ${s.first_name} ${s.last_name}'s prerequisite review: please prioritize it.${note ? ` “${note}”` : ''}`);
}
