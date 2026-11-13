import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';
import { sendMail } from './mail';
import { getProgress, namesApprover } from './workflow';
import { siteOrigin } from './site';

/** Links for outside high school approvers (students at an unlisted school). Only a hash of the token is stored. */
const DAYS = 90;
const hash = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** A new link for the student's named approver (older links stop working). */
export function createApproverLink(studentId: number): string | null {
  const u = db().prepare('SELECT hs_approver_email FROM users WHERE id = ?').get(studentId) as { hs_approver_email: string | null } | undefined;
  if (!u?.hs_approver_email) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  db().prepare('DELETE FROM approver_links WHERE student_id = ?').run(studentId);
  db().prepare('INSERT INTO approver_links (student_id, token_hash, email, created_at, expires_at) VALUES (?,?,?,?,?)')
    .run(studentId, hash(token), u.hs_approver_email, new Date().toISOString(), new Date(Date.now() + DAYS * 864e5).toISOString());
  return `/hs-approve/${token}`;
}

/** The student a link is for, while it's valid and still goes to the student's current approver at an unlisted school. */
export function studentForApproverLink(token: string): { studentId: number; email: string } | null {
  const r = db().prepare(`SELECT l.student_id, l.email, u.hs_approver_email, s.kind FROM approver_links l JOIN users u ON u.id = l.student_id
    LEFT JOIN schools s ON s.id = u.school_id WHERE l.token_hash = ? AND l.expires_at > ?`).get(hash(token), new Date().toISOString()) as
    { student_id: number; email: string; hs_approver_email: string | null; kind: string | null } | undefined;
  if (!r || !namesApprover({ kind: r.kind ?? '' }) || r.hs_approver_email !== r.email) return null;
  return { studentId: r.student_id, email: r.email };
}

/** Email the approver a fresh link when classes are waiting on them. Returns the link (to show), and whether it was emailed. */
export async function sendApproverLink(studentId: number): Promise<{ link: string; emailed: boolean } | null> {
  const p = getProgress(studentId);
  if (!p || !namesApprover(p.school) || !p.student.hs_approver_email) return null;
  const path = createApproverLink(studentId);
  if (!path) return null;
  const link = `${await siteOrigin()}${path}`;
  const pending = p.courses.filter((c) => c.hs_status === 'pending').map((c) => `${c.code} (${c.term_name ?? 'no term'})`);
  const emailed = pending.length > 0 && await sendMail({
    to: p.student.hs_approver_email,
    subject: `${p.student.first_name} ${p.student.last_name} needs high school approval for Shasta College classes`,
    text: `Hello ${p.student.hs_approver_name ?? ''},\n\n${p.student.first_name} ${p.student.last_name} (${p.school.name}) named you as the person who approves their dual enrollment classes${p.school.kind === 'homeschool' ? ' (as the administrator of their home school)' : ' at their high school'}. They've asked to take: ${pending.join(', ')}.\n\nReview and approve or decline each class here (no account needed). The link works for ${DAYS} days:\n${link}\n\nShasta College Dual Enrollment`,
  });
  return { link, emailed };
}
