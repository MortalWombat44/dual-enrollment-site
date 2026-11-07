import { notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { acceptInvite } from '@/lib/session-actions';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const u = db().prepare("SELECT first_name, email, role FROM users WHERE invite_token = ? AND status = 'invited'").get(token) as
    | { first_name: string; email: string; role: string }
    | undefined;
  if (!u) notFound();
  return (
    <div className="frame">
      <div className="topbar"><div className="brand"><div className="brand-mark" /><div className="brand-name">Shasta College</div><div className="brand-sep" /><div style={{ fontSize: 14 }}>Dual Enrollment</div></div></div>
      <div className="pad-sm" style={{ padding: '48px 48px', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div className="kicker accent700">You're invited</div>
          <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Set your password, {u.first_name}.</h1>
          <p style={{ fontSize: 16, margin: '12px 0 0' }}>You'll sign in as <strong>{u.email}</strong> ({u.role}).</p>
        </div>
        {sp.error && <div className="flash flash-err" style={{ padding: '12px 16px' }}>Passwords need at least 8 characters and must match.</div>}
        <form action={acceptInvite} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="token" value={token} />
          <div className="field"><label htmlFor="pw">New password</label><input id="pw" name="password" type="password" minLength={8} className="input" required autoComplete="new-password" /></div>
          <div className="field"><label htmlFor="pw2">Confirm password</label><input id="pw2" name="confirm" type="password" minLength={8} className="input" required autoComplete="new-password" /></div>
          <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20 }}>
            <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Set password &amp; continue <span>→</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
