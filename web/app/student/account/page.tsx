import { requireRole } from '@/lib/auth';
import { sharesWithParents } from '@/lib/access';
import { getProgress } from '@/lib/workflow';
import { setParentSharing } from '@/lib/student-actions';
import { TopBar, Flash } from '@/components/chrome';
import { ShareToggle } from '@/components/ShareToggle';
import { STUDENT_NAV } from '../nav';

export const dynamic = 'force-dynamic';

export default async function Account({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireRole('student');
  const sp = await searchParams;
  const p = getProgress(me.id);
  const shared = sharesWithParents(me.id);
  const parents = p?.parents ?? [];
  const names = parents.map((x) => `${x.first_name} ${x.last_name}`);

  return (
    <div className="frame">
      <TopBar nav={STUDENT_NAV} current="/student/account" user={me} right={<span className="tag tag-neutral hide-sm">Student</span>} />
      <Flash msg={sp.saved === 'on' ? 'Saved. Your parents / guardians can now see your progress.' : sp.saved === 'off' ? 'Saved. Your progress is now private from your parents / guardians.' : null} />
      <div className="pad-sm" style={{ padding: '40px 40px 20px', borderBottom: '2px solid var(--color-text)' }}>
        <div className="kicker accent700">{p ? `${p.term.name} · ${p.school.name}` : 'Account'}</div>
        <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Your account</h1>
      </div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="pad-sm noborder-sm" style={{ padding: '24px 40px', borderRight: '2px solid var(--color-divider)' }}>
          <div className="ink60" style={{ fontSize: 12 }}>Name</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{me.first_name} {me.last_name}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{me.email}</div>
        </div>
        <div className="pad-sm" style={{ padding: '24px 40px' }}>
          <div className="ink60" style={{ fontSize: 12 }}>Shasta College ID</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{me.student_number ?? '—'}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{p?.school.name}</div>
        </div>
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
