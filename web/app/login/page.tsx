import { redirect } from 'next/navigation';
import { currentUser, HOME } from '@/lib/auth';
import { login } from '@/lib/session-actions';

export const dynamic = 'force-dynamic';

const DEMO = [
  ['Student', 'maya.r@student.suhsd.net'],
  ['Student (not started)', 'jamie.l@student.andersonhigh.org'],
  ['Parent of Maya', 'laura.rivera@gmail.com'],
  ['Counselor', 'ralvarez@suhsd.net'],
  ['Super admin', 'dortiz@shastacollege.edu'],
  ['College admin + college counselor', 'jkim@shastacollege.edu'],
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; email?: string }> }) {
  const u = await currentUser();
  if (u) redirect(HOME[u.role]);
  const sp = await searchParams;
  return (
    <div className="frame">
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '480px 1fr', flex: 1 }}>
        <div className="pad-sm" style={{ background: 'var(--color-accent)', color: '#fff', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 40 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 28, height: 28, background: '#fff' }} />
            <div className="brand-name">Shasta College</div>
            <div style={{ width: 2, height: 18, background: 'rgba(255,255,255,.4)' }} />
            <div style={{ fontSize: 14 }}>Dual Enrollment</div>
          </div>
          <div>
            <div className="kicker" style={{ color: 'var(--color-accent-200)' }}>High school + college</div>
            <div className="h-sm" style={{ fontSize: 64, fontWeight: 800, lineHeight: 1, letterSpacing: '-0.03em', marginTop: 14 }}>Every step,<br />in one place.</div>
          </div>
        </div>
        <div className="pad-sm" style={{ padding: '64px 48px', display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
          <div>
            <div className="kicker accent700">Sign in</div>
            <h1 style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Welcome back.</h1>
          </div>
          {sp.error && (
            <div className="flash flash-err" style={{ padding: '12px 16px' }}>
              {sp.error === 'invite' ? 'That invite link has already been used or is no longer valid.' : "That email and password don't match an active account."}
            </div>
          )}
          <form action={login} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required defaultValue={sp.email ?? ''} autoComplete="username" /></div>
            <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" className="input" required autoComplete="current-password" /></div>
            <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20 }}>
              <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Sign in <span>→</span></button>
            </div>
          </form>
          <div style={{ fontSize: 15 }}>New student? <a href="/signup">Create your account</a></div>
          {(process.env.NODE_ENV !== 'production' || process.env.SHOW_DEMO_ACCOUNTS === '1') && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="kicker-sm" style={{ paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>Demo accounts · password shasta2027</div>
              {DEMO.map(([role, email]) => (
                <div key={email} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '8px 0', borderBottom: '1px solid var(--color-divider)' }}>
                  <span>{role}</span><code>{email}</code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
