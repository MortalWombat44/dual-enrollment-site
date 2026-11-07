import Link from 'next/link';
import { requestPasswordReset } from '@/lib/session-actions';
import { RESET_MINUTES } from '@/lib/security';

export const dynamic = 'force-dynamic';

const ERR: Record<string, string> = {
  email: 'Enter the email you sign in with.',
  expired: 'That reset link has expired or was already used. Request a new one below.',
};

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; demo?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="frame">
      <div className="topbar"><Link href="/login" className="brand unlink"><div className="brand-mark" /><div className="brand-name">Shasta College</div><div className="brand-sep only-desktop" /><div className="only-desktop" style={{ fontSize: 14 }}>Dual Enrollment</div></Link></div>
      <div className="pad-sm" style={{ padding: '48px 48px', maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="kicker accent700">Forgot password</div>
          <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Reset your password</h1>
        </div>
        {sp.error && ERR[sp.error] && <div className="flash flash-err" style={{ padding: '12px 16px' }}>{ERR[sp.error]}</div>}
        {sp.sent ? (
          <>
            <div className="flash" style={{ padding: '12px 16px' }}>
              If there's an account with that email, we've sent a link to reset the password. It works once and expires in {RESET_MINUTES} minutes. Check your spam folder too.
            </div>
            {sp.demo && (
              <div style={{ fontSize: 14, border: '2px dashed var(--color-divider)', padding: '12px 16px' }}>
                <strong>Test mode:</strong> email isn't set up yet, so here's the link that would have been emailed:
                <div><a href={sp.demo} style={{ wordBreak: 'break-all' }}>{sp.demo}</a></div>
              </div>
            )}
            <Link href="/login">Back to sign in</Link>
          </>
        ) : (
          <form action={requestPasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 16 }}>Enter the email you sign in with and we'll send you a link to set a new password.</p>
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required autoComplete="email" /></div>
            <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Send reset link <span>→</span></button>
              <Link href="/login">Back to sign in</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
