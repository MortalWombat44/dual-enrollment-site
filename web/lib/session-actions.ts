'use server';
import { redirect } from 'next/navigation';
import { db, tx } from './db';
import { currentTerm } from './workflow';
import { createSession, destroySession, HOME, type Role } from './auth';
import { hashPassword, verifyPassword } from './password';
import { clearFailures, createResetToken, lockedMinutes, MAX_RESETS_PER_HOUR, recentResets, recordFailure, resetTokenUser, RESET_MINUTES, useResetTokens } from './security';
import { demoMode, sendMail } from './mail';
import { headers } from 'next/headers';

export async function login(formData: FormData) {
  const email = String(formData.get('email') || '').trim();
  const password = String(formData.get('password') || '');
  const u = db().prepare("SELECT id, role, password_hash, status, disabled FROM users WHERE email = ?").get(email) as
    | { id: number; role: Role; password_hash: string | null; status: string; disabled: number }
    | undefined;
  const back = (q: string) => redirect(`/login?${q}&email=${encodeURIComponent(email)}`);
  // Locked after too many wrong passwords: don't even check the password.
  const locked = lockedMinutes(email);
  if (locked) back(`error=locked&mins=${locked}`);
  const ok = !!u && verifyPassword(password, u.password_hash);
  if (!ok || !u || u.status !== 'active') {
    // Count failures for unknown emails too, so the response doesn't reveal which emails exist.
    const nowLocked = recordFailure(email);
    if (nowLocked) back(`error=locked&mins=${nowLocked}`);
    back('error=1');
  }
  if (u!.disabled) back('error=disabled');
  clearFailures(email);
  await createSession(u!.id);
  redirect(HOME[u!.role]);
}

export async function logout() {
  await destroySession();
  redirect('/login');
}

export async function acceptInvite(formData: FormData) {
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  const u = db().prepare("SELECT id, role FROM users WHERE invite_token = ? AND status = 'invited' AND disabled = 0").get(token) as
    | { id: number; role: Role }
    | undefined;
  if (!u) redirect('/login?error=invite');
  if (password.length < 8 || password !== confirm) redirect(`/invite/${token}?error=1`);
  db().prepare("UPDATE users SET password_hash = ?, status = 'active', invite_token = NULL WHERE id = ?").run(hashPassword(password), u.id);
  await createSession(u.id);
  redirect(HOME[u.role]);
}

/** Students create their own account and pick their high school. */
export async function signUp(formData: FormData) {
  const first = String(formData.get('first') || '').trim().slice(0, 60);
  const last = String(formData.get('last') || '').trim().slice(0, 60);
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 200);
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  const schoolId = Number(formData.get('school'));
  const num = String(formData.get('student_number') || '').trim().slice(0, 20) || null;
  const keep = new URLSearchParams({ first, last, email, school: String(schoolId || ''), id: num ?? '' });
  const fail = (e: string) => redirect(`/signup?error=${e}&${keep}`);
  if (!first || !last) fail('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email');
  if (password.length < 8 || password !== confirm) fail('password');
  if (!schoolId || !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(schoolId)) fail('school');
  if (num && !/^[A-Za-z0-9-]+$/.test(num)) fail('id');
  if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail('exists');
  const id = tx(() => {
    const counselor = db()
      .prepare("SELECT id FROM users WHERE role = 'counselor' AND school_id = ? ORDER BY status = 'active' DESC, id LIMIT 1")
      .get(schoolId) as { id: number } | undefined;
    // A Shasta College ID already on another account is allowed here; college admins see it flagged.
    const uid = Number(db()
      .prepare("INSERT INTO users (first_name, last_name, email, role, school_id, status, password_hash, student_number, counselor_id) VALUES (?,?,?,'student',?,'active',?,?,?)")
      .run(first, last, email, schoolId, hashPassword(password), num, counselor?.id ?? null).lastInsertRowid);
    db().prepare('INSERT INTO enrollments (student_id, term_id) VALUES (?,?)').run(uid, currentTerm().id);
    return uid;
  });
  await createSession(id);
  redirect('/student');
}

async function origin() {
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

/** Forgot password: email a one-time link. Always answers the same way, so it never reveals which emails have accounts. */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect('/forgot?error=email');
  const u = db().prepare("SELECT id, first_name FROM users WHERE email = ? AND status = 'active' AND disabled = 0").get(email) as
    | { id: number; first_name: string } | undefined;
  let demoLink = '';
  if (u && recentResets(u.id) < MAX_RESETS_PER_HOUR) {
    const link = `${await origin()}/reset/${createResetToken(u.id)}`;
    const sent = await sendMail({
      to: email,
      subject: 'Reset your Shasta College Dual Enrollment password',
      text: `Hi ${u.first_name},\n\nUse this link to set a new password. It works once and expires in ${RESET_MINUTES} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.`,
    });
    if (!sent) {
      console.log(`[password reset] email not configured; link for ${email}: ${link}`);
      if (demoMode()) demoLink = link;
    }
  }
  redirect('/forgot?sent=1' + (demoLink ? `&demo=${encodeURIComponent(demoLink)}` : ''));
}

export async function resetPassword(formData: FormData) {
  const token = String(formData.get('token') || '');
  const password = String(formData.get('password') || '');
  const confirm = String(formData.get('confirm') || '');
  const u = resetTokenUser(token);
  if (!u) redirect('/forgot?error=expired');
  if (password.length < 8 || password !== confirm) redirect(`/reset/${token}?error=1`);
  tx(() => {
    db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), u!.user_id);
    useResetTokens(u!.user_id);
    // Sign out everywhere: anyone holding an old session loses it.
    db().prepare('DELETE FROM sessions WHERE user_id = ?').run(u!.user_id);
  });
  clearFailures(u!.email);
  redirect('/login?reset=1&email=' + encodeURIComponent(u!.email));
}
