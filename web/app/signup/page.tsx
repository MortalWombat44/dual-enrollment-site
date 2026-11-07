import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentUser, HOME } from '@/lib/auth';
import { db } from '@/lib/db';
import { signUp } from '@/lib/session-actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  name: 'Enter your first and last name.',
  email: 'Enter a valid email address.',
  password: 'Passwords need at least 8 characters and must match.',
  school: 'Pick your high school.',
  id: 'A Shasta College ID uses only letters, numbers and dashes.',
  exists: 'There is already an account with that email. Sign in instead.',
};

type SP = { error?: string; first?: string; last?: string; email?: string; school?: string; id?: string };

export default async function SignUp({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await currentUser();
  if (u) redirect(HOME[u.role]);
  const sp = await searchParams;
  const schools = db().prepare('SELECT id, name, district FROM schools ORDER BY name').all() as { id: number; name: string; district: string }[];
  return (
    <div className="frame">
      <div className="topbar"><Link href="/login" className="brand unlink"><div className="brand-mark" /><div className="brand-name">Shasta College</div><div className="brand-sep only-desktop" /><div className="only-desktop" style={{ fontSize: 14 }}>Dual Enrollment</div></Link></div>
      <div className="pad-sm" style={{ padding: '40px 48px', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <div className="kicker accent700">Students</div>
          <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Create your account</h1>
          <p style={{ fontSize: 16, margin: '12px 0 0' }}>Parents and guardians don't sign up here. You'll invite them later, when it's time for their consent.</p>
        </div>
        {sp.error && ERRORS[sp.error] && <div className="flash flash-err" style={{ padding: '12px 16px' }}>{ERRORS[sp.error]}</div>}
        <form action={signUp} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label htmlFor="first">First name</label><input id="first" name="first" className="input" required defaultValue={sp.first} autoComplete="given-name" /></div>
            <div className="field"><label htmlFor="last">Last name</label><input id="last" name="last" className="input" required defaultValue={sp.last} autoComplete="family-name" /></div>
          </div>
          <div className="field"><label htmlFor="email">Email</label><input id="email" name="email" type="email" className="input" required defaultValue={sp.email} autoComplete="email" /></div>
          <div className="field">
            <label htmlFor="school">Your high school</label>
            <select id="school" name="school" className="input" required defaultValue={sp.school ?? ''}>
              <option value="" disabled>Pick your high school…</option>
              {schools.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.district}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="sid">Shasta College ID (if you have one)</label>
            <input id="sid" name="student_number" className="input" defaultValue={sp.id} placeholder="You get this after applying on CCCApply" style={{ maxWidth: 360 }} />
          </div>
          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label htmlFor="pw">Password</label><input id="pw" name="password" type="password" minLength={8} className="input" required autoComplete="new-password" /></div>
            <div className="field"><label htmlFor="pw2">Confirm password</label><input id="pw2" name="confirm" type="password" minLength={8} className="input" required autoComplete="new-password" /></div>
          </div>
          <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Create account <span>→</span></button>
            <Link href="/login">I already have an account</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
