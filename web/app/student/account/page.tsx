import { requireRole } from '@/lib/auth';
import { sharesWithParents } from '@/lib/access';
import { classLabel, currentGrade, fmt, getProgress, openSchoolChange, namesApprover } from '@/lib/workflow';
import { listedSchools, SCHOOL_ERRORS } from '@/lib/schools';
import { PROFILE_ERRORS } from '@/lib/profile';
import { SchoolPicker } from '@/components/SchoolPicker';
import { ProfileFields } from '@/components/ProfileFields';
import { cancelSchoolChange, requestSchoolChange, saveHsApprover, saveProfile, setMyStudentNumber, setParentSharing } from '@/lib/student-actions';
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
  profile: 'Saved your contact information.',
  approver: 'Saved your high school approver.',
};
const ERRORS: Record<string, string> = {
  id: 'A Shasta College ID uses only letters, numbers and dashes.',
  school: 'Pick a different high school.',
  ...SCHOOL_ERRORS,
  ...PROFILE_ERRORS,
};

export default async function Account({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireRole('student');
  const sp = await searchParams;
  const p = getProgress(me.id);
  const shared = sharesWithParents(me.id);
  const parents = p?.parents ?? [];
  const names = parents.map((x) => `${x.first_name} ${x.last_name}`);
  const change = openSchoolChange(me.id);
  const schools = listedSchools().filter((x) => x.id !== p?.school.id);

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
              <SchoolPicker schools={schools} label="The high school you go to now" />
              <div className="field"><label htmlFor="snote">Anything staff should know? (optional)</label><textarea id="snote" name="note" className="input" maxLength={500} style={{ minHeight: 60 }} /></div>
              <div><button className="btn btn-primary" style={{ minWidth: 240, justifyContent: 'space-between', padding: '12px 16px' }}>Send request to college staff <span>→</span></button></div>
            </form>
          </details>
        )}
      </div>
      {p && namesApprover(p.school) && (
        <form id="approver" action={saveHsApprover} className="pad-sm" style={{ padding: '24px 40px', borderBottom: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 820 }}>
          <div className="kicker">Who approves your classes{p.school.kind === 'homeschool' ? '' : ` at ${p.school.name}`}</div>
          <div className="ink60" style={{ fontSize: 13 }}>
            {p.school.kind === 'homeschool' ? 'The administrator of your home school (usually the parent or guardian on your Private School Affidavit).' : 'The administrator at your high school who approves dual enrollment classes (for example the principal, not office staff).'}
            {' '}Shasta College checks that it&apos;s the right person{me.hs_approver_status === 'approved' ? ' (confirmed)' : ''}. If you change it, they check again.
          </div>
          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label htmlFor="approver_name">Name</label><input id="approver_name" name="approver_name" className="input" required defaultValue={me.hs_approver_name ?? ''} /></div>
            <div className="field"><label htmlFor="approver_email">Email</label><input id="approver_email" name="approver_email" type="email" className="input" required defaultValue={me.hs_approver_email ?? ''} /></div>
          </div>
          <div><button className="btn btn-secondary">Save approver</button></div>
        </form>
      )}
      <details className="pad-sm" style={{ padding: '24px 40px', borderBottom: '2px solid var(--color-divider)', maxWidth: 820 }}>
        <summary style={{ cursor: 'pointer' }}><span className="kicker">Contact information</span> <span className="ink60" style={{ fontSize: 13 }}>· {me.phone ?? 'no phone'} · {me.city ?? 'no address'}</span></summary>
        <form action={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
          <input type="hidden" name="from" value="account" />
          <ProfileFields
            senior={currentGrade(me) === 12}
            values={{ dob: me.date_of_birth, phone: me.phone, address: me.address_line, city: me.city, state: me.state, zip: me.zip, plans: me.plans_shasta }}
          />
          <div><button className="btn btn-primary" style={{ minWidth: 200, justifyContent: 'space-between' }}>Save <span>→</span></button></div>
        </form>
      </details>
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
