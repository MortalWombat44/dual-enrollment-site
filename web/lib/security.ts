import 'server-only';
import crypto from 'node:crypto';
import { db } from './db';

/** Lockout: this many wrong passwords within the window locks the account for LOCK_MINUTES. */
export const MAX_FAILED = 5;
export const WINDOW_MINUTES = 15;
export const LOCK_MINUTES = 15;
/** Reset links last this long and can be used once. */
export const RESET_MINUTES = 60;
/** At most this many reset emails per account per hour. */
export const MAX_RESETS_PER_HOUR = 3;

type Attempt = { failed_count: number; first_failed_at: string | null; locked_until: string | null };
const norm = (email: string) => email.trim().toLowerCase();

/** Minutes left on a lock, or 0 if not locked. */
export function lockedMinutes(email: string): number {
  const a = db().prepare('SELECT locked_until FROM login_attempts WHERE email = ?').get(norm(email)) as Attempt | undefined;
  if (!a?.locked_until) return 0;
  const ms = new Date(a.locked_until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/** Records a wrong password. Returns minutes locked if this attempt triggered (or is under) a lock, else 0. */
export function recordFailure(email: string): number {
  const e = norm(email);
  const now = new Date();
  const a = db().prepare('SELECT failed_count, first_failed_at, locked_until FROM login_attempts WHERE email = ?').get(e) as Attempt | undefined;
  const windowStart = new Date(now.getTime() - WINDOW_MINUTES * 60000);
  const fresh = !a?.first_failed_at || new Date(a.first_failed_at) < windowStart;
  const count = fresh ? 1 : a!.failed_count + 1;
  const lockUntil = count >= MAX_FAILED ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : null;
  db().prepare(`INSERT INTO login_attempts (email, failed_count, first_failed_at, locked_until) VALUES (?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET failed_count = excluded.failed_count, first_failed_at = excluded.first_failed_at, locked_until = excluded.locked_until`)
    .run(e, lockUntil ? 0 : count, fresh || lockUntil ? now.toISOString() : a!.first_failed_at, lockUntil);
  return lockUntil ? LOCK_MINUTES : 0;
}

export function clearFailures(email: string) {
  db().prepare('DELETE FROM login_attempts WHERE email = ?').run(norm(email));
}

/** Locked accounts right now (for the super admin Users page). */
export function lockedEmails(): Set<string> {
  const rows = db().prepare('SELECT email FROM login_attempts WHERE locked_until > ?').all(new Date().toISOString()) as { email: string }[];
  return new Set(rows.map((r) => r.email));
}

const sha256 = (t: string) => crypto.createHash('sha256').update(t).digest('hex');

/** Makes a one-time reset token for a user. Only its hash is stored; the raw token goes in the link. */
export function createResetToken(userId: number): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  db().prepare('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(sha256(token), userId, now.toISOString(), new Date(now.getTime() + RESET_MINUTES * 60000).toISOString());
  return token;
}

/** How many reset links were made for this user in the last hour. */
export function recentResets(userId: number): number {
  const since = new Date(Date.now() - 3600000).toISOString();
  return (db().prepare('SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?').get(userId, since) as { n: number }).n;
}

/** The user a valid, unused, unexpired reset token belongs to. */
export function resetTokenUser(token: string): { user_id: number; email: string; first_name: string } | null {
  return (db().prepare(`SELECT r.user_id, u.email, u.first_name FROM password_resets r JOIN users u ON u.id = r.user_id
    WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.status = 'active' AND u.disabled = 0`)
    .get(sha256(token), new Date().toISOString()) as { user_id: number; email: string; first_name: string } | undefined) ?? null;
}

/** Marks every outstanding reset link for the user as used (after a successful reset). */
export function useResetTokens(userId: number) {
  db().prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at IS NULL').run(new Date().toISOString(), userId);
}
