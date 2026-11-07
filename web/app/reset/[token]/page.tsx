import Link from 'next/link';
import { redirect } from 'next/navigation';
import { resetPassword } from '@/lib/session-actions';
import { resetTokenUser } from '@/lib/security';

export const dynamic = 'force-dynamic';

export default async function Reset({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const u = resetTokenUser(token);
  if (!u) redirect('/forgot?error=expired');
  return (
    <div className="frame">
      <div className="topbar"><Link href="/login" className="brand unlink"><div className="brand-mark" /><div className="brand-name">Shasta College</div><div className="brand-sep only-desktop" /><div className="only-desktop" style={{ fontSize: 14 }}>Dual Enrollment</div></Link></div>
      <div className="pad-sm" style={{ padding: '48px 48px', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="kicker accent700">New password</div>
          <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Set a new password, {u.first_name}.</h1>
          <p style={{ fontSize: 16, margin: '12px 0 0' }}>For <strong>{u.email}</strong>. You'll be signed out everywhere else.</p>
        </div>
        {sp.error && <div className="flash flash-err" style={{ padding: '12px 16px' }}>Passwords need at least 8 characters and must match.</div>}
        <form action={resetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input type="hidden" name="token" value={token} />
          <div className="field"><label htmlFor="pw">New password</label><input id="pw" name="password" type="password" minLength={8} className="input" required autoComplete="new-password" /></div>
          <div className="field"><label htmlFor="pw2">Confirm new password</label><input id="pw2" name="confirm" type="password" minLength={8} className="input" required autoComplete="new-password" /></div>
          <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20 }}>
            <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Save new password <span>→</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
