'use server';
import { redirect } from 'next/navigation';
import { db, tx } from './db';
import { currentClassYear, currentTerm, GRADES } from './workflow';
import { createSession, destroySession, HOME, type Role } from './auth';
import { resolveSchool, type SchoolChoice } from './schools';
import { parseProfile, type ProfileInput } from './profile';
import { notifyLeads } from './notify';
import { hashPassword, verifyPassword } from './password';
import { clearFailures, lockedMinutes, MAX_RESETS_PER_HOUR, recentResets, recordFailure, resetTokenUser, useResetTokens } from './security';
import { demoMode } from './mail';
import { sendResetLink } from './account-mail';

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
  // Students who skipped their Shasta College ID on step 01 come back to it at every sign-in until it's added.
  if (u!.role === 'student') {
    const pending = db().prepare(`SELECT 1 FROM users u JOIN step_progress p ON p.student_id = u.id AND p.step_id = 1 AND p.status = 'complete'
      WHERE u.id = ? AND (u.student_number IS NULL OR u.student_number = '')`).get(u!.id);
    if (pending) redirect('/student/steps/1');
  }
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

  const num = String(formData.get('student_number') || '').trim().slice(0, 20) || null;
  const gradYear = Number(formData.get('grad_year'));
  const grade = Number(formData.get('grade'));
  const keep = new URLSearchParams({ first, last, email, id: num ?? '', grad: String(gradYear || ''), grade: String(grade || '') });
  const fail = (e: string) => redirect(`/signup?error=${e}&${keep}`);
  if (!first || !last) fail('name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('email');
  if (password.length < 8 || password !== confirm) fail('password');
  const profile = parseProfile(formData, grade === 12);
  if ('error' in profile) fail(profile.error);
  if (num && !/^[A-Za-z0-9-]+$/.test(num)) fail('id');
  const thisClass = currentClassYear();
  if (!Number.isInteger(gradYear) || gradYear < thisClass || gradYear > thisClass + 12) fail('grad');
  if (!GRADES.includes(grade)) fail('grade');
  if (db().prepare('SELECT 1 FROM users WHERE email = ?').get(email)) fail('exists');
  // Last, so a typed-in ("Other") school is only added when the sign-up is going through.
  const school = resolveSchool(formData);
  if ('error' in school) fail(school.error);
  const sc = school as SchoolChoice, pr = profile as ProfileInput;
  const schoolId = sc.schoolId;
  const id = tx(() => {
    const counselor = db()
      .prepare("SELECT id FROM users WHERE role = 'counselor' AND school_id = ? ORDER BY status = 'active' DESC, id LIMIT 1")
      .get(schoolId) as { id: number } | undefined;
    // A Shasta College ID already on another account is allowed here; college admins see it flagged.
    const uid = Number(db()
      .prepare(`INSERT INTO users (first_name, last_name, email, role, school_id, status, password_hash, student_number, counselor_id, grad_year, grade, grade_confirmed_year,
        date_of_birth, phone, address_line, city, state, zip, plans_shasta, plans_year, plans_at, hs_approver_name, hs_approver_email)
        VALUES (?,?,?,'student',?,'active',?,?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?)`)
      .run(first, last, email, schoolId, hashPassword(password), num, counselor?.id ?? null, gradYear, grade, thisClass,
        pr.dob, pr.phone, pr.address, pr.city, pr.state, pr.zip, pr.plans, pr.plans ? thisClass : null, pr.plans ? new Date().toISOString() : null,
        sc.approverName, sc.approverEmail).lastInsertRowid);
    db().prepare('INSERT INTO enrollments (student_id, term_id) VALUES (?,?)').run(uid, currentTerm().id);
    return uid;
  });
  if (db().prepare("SELECT 1 FROM schools WHERE id = ? AND kind = 'homeschool'").get(schoolId)) {
    await notifyLeads('homeschool', id, `New homeschooled student: ${first} ${last}. They'll upload a Private School Affidavit to review.`);
  }
  await createSession(id);
  redirect('/student');
}

/**
 * Forgot password: email a one-time link to the address on file. The typed email is only used to find the account;
 * the link is sent to the address stored on that account. Always answers the same way, so it never reveals which
 * emails have accounts.
 */
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect('/forgot?error=email');
  const u = db().prepare("SELECT id, first_name FROM users WHERE email = ? AND status = 'active' AND disabled = 0").get(email) as
    | { id: number; first_name: string } | undefined;
  let demoLink = '';
  if (u && recentResets(u.id) < MAX_RESETS_PER_HOUR) {
    const r = await sendResetLink(u.id);
    if (r && !r.emailed && demoMode()) demoLink = r.link;
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
