import 'server-only';

/**
 * Sends email through Resend (https://resend.com) when RESEND_API_KEY and MAIL_FROM are set
 * (e.g. MAIL_FROM="Shasta College Dual Enrollment <de@yourdomain.edu>"). Returns true if it was sent.
 * With no key configured nothing is sent, and callers fall back (demo mode shows links on screen).
 */
export function mailConfigured() {
  return !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<boolean> {
  if (!mailConfigured()) return false;
  try {
    // RESEND_API_URL is only for automated tests (a stand-in mail server). Leave it unset on the live site.
    const res = await fetch(process.env.RESEND_API_URL || 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text }),
    });
    if (!res.ok) console.error('sendMail failed', res.status, await res.text().catch(() => ''));
    return res.ok;
  } catch (e) {
    console.error('sendMail error', e);
    return false;
  }
}

/** Demo mode shows links on screen (never in production unless SHOW_DEMO_ACCOUNTS=1). */
export const demoMode = () => process.env.NODE_ENV !== 'production' || process.env.SHOW_DEMO_ACCOUNTS === '1';
