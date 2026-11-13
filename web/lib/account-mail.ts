import 'server-only';
import { db } from './db';
import { mailConfigured, sendMail } from './mail';
import { createResetToken, RESET_MINUTES } from './security';
import { siteOrigin } from './site';

const SIGN = '\n\nShasta College Dual Enrollment';

/**
 * Make a one-time password reset link and email it to the address ON FILE for the account (read from the database
 * here, never taken from a form). Returns whether it was emailed, and the link (callers only show it in demo mode).
 */
export async function sendResetLink(userId: number): Promise<{ emailed: boolean; link: string; email: string } | null> {
  const u = db().prepare("SELECT id, first_name, email FROM users WHERE id = ? AND status = 'active' AND disabled = 0").get(userId) as
    { id: number; first_name: string; email: string } | undefined;
  if (!u) return null;
  const link = `${await siteOrigin()}/reset/${createResetToken(u.id)}`;
  const emailed = await sendMail({
    to: u.email,
    subject: 'Reset your Shasta College Dual Enrollment password',
    text: `Hi ${u.first_name},\n\nUse this link to set a new password. It works once and expires in ${RESET_MINUTES} minutes:\n\n${link}\n\nIf you didn't ask for this, you can ignore this email.${SIGN}`,
  });
  if (!emailed) console.log(`[password reset] email not sent (not set up, or it failed); link for ${u.email}: ${link}`);
  return { emailed, link, email: u.email };
}

/** Email an invited user (staff, admin, student or parent) their link to set a password. False when email isn't set up. */
export async function sendInvite(userId: number, from?: string): Promise<boolean> {
  if (!mailConfigured()) return false;
  const u = db().prepare("SELECT first_name, email, role, invite_token FROM users WHERE id = ? AND status = 'invited' AND disabled = 0").get(userId) as
    { first_name: string; email: string; role: string; invite_token: string | null } | undefined;
  if (!u?.invite_token) return false;
  const link = `${await siteOrigin()}/invite/${u.invite_token}`;
  const why = u.role === 'parent'
    ? `${from ?? 'Your student'} needs your permission to take Shasta College classes through dual enrollment. Make your account and sign the consent form here:`
    : 'An account was made for you on the Shasta College Dual Enrollment portal. Set your password here:';
  return sendMail({ to: u.email, subject: u.role === 'parent' ? `${from ?? 'Your student'} needs your consent for Shasta College classes` : 'Your Shasta College Dual Enrollment account', text: `Hi ${u.first_name},\n\n${why}\n\n${link}${SIGN}` });
}

/** A test message to an admin's own address, to check that email is connected. */
export async function sendTestEmail(to: string): Promise<boolean> {
  return sendMail({ to, subject: 'Test email from the Dual Enrollment portal', text: `This is a test. Email is connected, and links in emails will point to ${await siteOrigin()}.${SIGN}` });
}
