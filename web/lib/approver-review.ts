import 'server-only';
import { db, tx } from './db';
import { logEvent, type Actor } from './audit';
import { adminsForStudent, notifyUsers } from './notify';

/**
 * The person a student names to approve their classes ("Other" schools and homeschool). A college admin reviews
 * who it is: they confirm it, or change it (students sometimes name office staff when it has to be the administrator).
 * The approval link goes out right away; this review runs alongside. College review can't be cleared until it's done.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const validApprover = (name: string, email: string) => !!name && EMAIL.test(email);

/** Students whose named approver is waiting for a college admin's review. */
export function approverPendingIds(): Set<number> {
  return new Set((db().prepare(`SELECT u.id FROM users u JOIN schools s ON s.id = u.school_id
    WHERE u.role = 'student' AND s.kind IN ('other','homeschool') AND u.hs_approver_email IS NOT NULL AND u.hs_approver_status = 'pending'`).all() as { id: number }[]).map((r) => r.id));
}

/**
 * Set a student's approver. From the student (or a school change): it waits for review, and admins are told.
 * From a college admin: it counts as reviewed. When an admin changes the email, classes the previous person already
 * approved by link go back to "waiting" (unless the student already registered for that term), and old links stop working.
 */
export async function setApprover(studentId: number, name: string, email: string, by: Actor, asAdmin: number | null): Promise<{ changed: boolean; reset: string[] }> {
  const d = db();
  const cur = d.prepare('SELECT first_name, last_name, hs_approver_name AS name, hs_approver_email AS email, hs_approver_status AS status FROM users WHERE id = ?').get(studentId) as
    { first_name: string; last_name: string; name: string | null; email: string | null; status: string | null };
  const emailChanged = (cur.email ?? '').toLowerCase() !== email;
  const changed = emailChanged || (cur.name ?? '') !== name;
  const at = new Date().toISOString();
  let reset: string[] = [];
  tx(() => {
    if (asAdmin) {
      d.prepare("UPDATE users SET hs_approver_name = ?, hs_approver_email = ?, hs_approver_status = 'approved', hs_approver_reviewed_by = ?, hs_approver_reviewed_at = ? WHERE id = ?").run(name, email, asAdmin, at, studentId);
    } else {
      d.prepare(`UPDATE users SET hs_approver_name = ?, hs_approver_email = ?, hs_approver_status = CASE WHEN ? = 1 OR hs_approver_status IS NULL THEN 'pending' ELSE hs_approver_status END,
        hs_approver_reviewed_by = CASE WHEN ? = 1 THEN NULL ELSE hs_approver_reviewed_by END, hs_approver_reviewed_at = CASE WHEN ? = 1 THEN NULL ELSE hs_approver_reviewed_at END WHERE id = ?`)
        .run(name, email, changed ? 1 : 0, changed ? 1 : 0, changed ? 1 : 0, studentId);
    }
    if (emailChanged && cur.email) {
      d.prepare('DELETE FROM approver_links WHERE student_id = ?').run(studentId);
      if (asAdmin) {
        const rows = d.prepare(`SELECT r.course_id, r.term_id, c.code FROM course_requests r JOIN courses c ON c.id = r.course_id
          WHERE r.student_id = ? AND r.archived_at IS NULL AND r.hs_status = 'approved' AND lower(r.hs_signer_email) = lower(?)
            AND NOT EXISTS (SELECT 1 FROM registrations g WHERE g.student_id = r.student_id AND g.term_id = r.term_id)`).all(studentId, cur.email) as { course_id: number; term_id: number | null; code: string }[];
        const undo = d.prepare(`UPDATE course_requests SET hs_status = 'pending', hs_by = NULL, hs_at = NULL, hs_signed_name = NULL, hs_signature_file_id = NULL, hs_sign_method = NULL, hs_signer_email = NULL
          WHERE student_id = ? AND course_id = ? AND term_id IS ?`);
        for (const r of rows) {
          undo.run(studentId, r.course_id, r.term_id);
          logEvent(studentId, by, `High school approval of ${r.code} set back to waiting`, `It was approved by ${cur.name ?? cur.email} (${cur.email}), who is no longer the approver.`, [r.term_id]);
        }
        reset = rows.map((r) => r.code);
        if (rows.length) d.prepare('DELETE FROM step_progress WHERE student_id = ? AND step_id = 4').run(studentId);
      }
    }
  });
  const who = `${name} (${email})`;
  if (asAdmin) logEvent(studentId, by, changed ? 'High school approver changed and confirmed' : 'High school approver confirmed', changed && cur.email ? `${cur.name ?? ''} (${cur.email}) → ${who}` : who);
  else if (changed) {
    logEvent(studentId, by, cur.email ? 'High school approver changed (waiting for Shasta College review)' : 'High school approver named (waiting for Shasta College review)', who);
    await notifyUsers(adminsForStudent(studentId), 'approver', studentId, `${cur.first_name} ${cur.last_name} named ${who} as their high school approver. Check it's the right person.`);
  }
  return { changed, reset };
}
