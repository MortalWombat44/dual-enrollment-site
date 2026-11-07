import { requireRole } from '@/lib/auth';
import { sharesWithParents } from '@/lib/access';
import { db } from '@/lib/db';
import { classLabel, fmt, getProgress, openSchoolChange } from '@/lib/workflow';
import { cancelSchoolChange, requestSchoolChange, setMyStudentNumber, setParentSharing } from '@/lib/student-actions';
import { TopBar, Flash } from '@/components/chrome';
import { ShareToggle } from '@/components/ShareToggle';
import { STUDENT_NAV } from '../nav';

export const dynamic = 'force-dynamic';

const SAVED: Record<string, string> = {
  on: 'Saved. Your parents / guardians can now see your progress.',
  off: 'Saved. Your progress is now private from your parents / guardians.',
  id: 'Saved your Shasta College ID.',
  school_request: "Request sent. College staff will update your high school and you'll see it here.",
  school_cancel: 'Request cancelled.',
};
const ERRORS: Record<string, string> = {
  id: 'A Shasta College ID uses only letters, numbers and dashes.',
  school: 'Pick a different high school.',
};

export default async function Account({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole('student');
  const sp = await searchParams;
  const p = getProgress(me.id);
  const shared = sharesWithParents(me.id);
  const parents = p?.parents ?? [];
  const names = parents.map((x) => `${x.first_name} ${x.last_name}`);
  const change = openSchoolChange(me.id);
  const schools = db().prepare('SELECT id, name FROM schools ORDER BY name').all() as { id: number; name: string }[];

  return (
    <div className="frame">
      <TopBar nav={STUDENT_NAV} current="/student/account" user={me} right={<span className="tag tag-neutral hide-sm">Student</span>} />
      <Flash msg={sp.saved ? SAVED[sp.saved] : null} />
      <Flash error msg={sp.error ? ERRORS[sp.error] : null} />
      <div className="pad-sm" style={{ padding: '40px 40px 20px', borderBottom: '2px solid var(--color-text)' }}>
        <div className="kicker accent700">{p ? `${p.termLabel} · ${p.school.name}` : 'Account'}</div>
        <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Your account</h1>
      </div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="pad-sm noborder-sm" style={{ padding: '24px 40px', borderRight: '2px solid var(--color-divider)' }}>
          <div className="ink60" style={{ fontSize: 12 }}>Name</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{me.first_name} {me.last_name}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{me.email}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{classLabel(me)}</div>
        </div>
        <form action={setMyStudentNumber} className="pad-sm" style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label htmlFor="sid" className="ink60" style={{ fontSize: 12 }}>Shasta College ID</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input id="sid" name="student_number" className="input" defaultValue={me.student_number ?? ''} placeholder="From your CCCApply confirmation email" />
            <button className="btn btn-secondary">Save</button>
          </div>
        </form>
      </div>
      <div className="pad-sm" style={{ padding: '24px 40px', borderBottom: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820 }}>
        <div className="kicker">Your high school</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{p?.school.name ?? '—'}</div>
        {change ? (
          <form action={cancelSchoolChange} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', background: 'var(--color-accent-100)', padding: '12px 16px' }}>
            <span style={{ fontSize: 14 }}>You asked college staff to change it to <strong>{change.to_name}</strong> on {fmt(change.created_at.replace(' ', 'T') + 'Z')}. Waiting for them to update it.</span>
            <button className="btn btn-ghost" style={{ color: 'var(--color-accent-700)' }}>Cancel request</button>
          </form>
        ) : (
          <details>
            <summary className="btn btn-secondary" style={{ display: 'inline-flex', listStyle: 'none' }}>Request a high school change</summary>
            <form action={requestSchoolChange} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12, maxWidth: 520 }}>
              <div className="field">
                <label htmlFor="newschool">The high school you go to now</label>
                <select id="newschool" name="school" className="input" required defaultValue="">
                  <option value="" disabled>Pick your high school…</option>
                  {schools.filter((x) => x.id !== p?.school.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              </div>
              <div className="field"><label htmlFor="snote">Anything staff should know? (optional)</label><textarea id="snote" name="note" className="input" maxLength={500} style={{ minHeight: 60 }} /></div>
              <div><button className="btn btn-primary" style={{ minWidth: 240, justifyContent: 'space-between', padding: '12px 16px' }}>Send request to college staff <span>→</span></button></div>
            </form>
          </details>
        )}
      </div>
      <div className="pad-sm" style={{ padding: '32px 40px 40px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
        <div className="kicker">Parent / guardian access</div>
        <div style={{ fontSize: 15 }}>
          {names.length ? <>Linked to your account: <strong>{names.join(', ')}</strong></> : 'No parent or guardian accounts are linked to you yet.'}
        </div>
        <ShareToggle action={setParentSharing} initial={shared} />
        <div className="ink60" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Either way, your parent or guardian can always sign the consent form, and they see the courses they're agreeing to.
          You can change this at any time.
        </div>
      </div>
    </div>
  );
}
