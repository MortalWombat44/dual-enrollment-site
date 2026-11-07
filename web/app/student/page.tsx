import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { getProgress, fmt, pad, displayName } from '@/lib/workflow';
import { dashboardLine, upNextLine, completionCopy } from '@/lib/stepcopy';
import { TopBar, SegBar } from '@/components/chrome';
import { StepGrid } from '@/components/StepGrid';
import { STUDENT_NAV } from './nav';

export const dynamic = 'force-dynamic';

export default async function StudentDashboard() {
  const me = await requireRole('student');
  const p = getProgress(me.id);
  if (!p) return <NoSchool />;
  const n = p.next;
  const inFlight = n && (n.status === 'in_review' || n.status === 'waiting_parent') ? 1 : 0;
  const pct = Math.round((p.complete / p.total) * 100);
  const unseen = p.steps.filter((s) => s.status === 'complete' && !s.seen);
  const prev = n ? p.steps[n.num - 2] : null;

  return (
    <div className="frame">
      <TopBar nav={STUDENT_NAV} current="/student" user={me} right={<span className="tag tag-neutral hide-sm">Student</span>} />
      {unseen.map((s) => (
        <Link key={s.id} href={`/student/steps/${s.id}/complete`} className="flash unlink" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span><strong>Step {pad(s.num)} complete.</strong> {completionCopy(p, s).poster}</span><span>See details →</span>
        </Link>
      ))}
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', borderBottom: '2px solid var(--color-text)' }}>
        <div className="pad-sm noborder-sm" style={{ padding: 40, borderRight: '2px solid var(--color-divider)' }}>
          <div className="kicker accent700">{p.term.name} · {p.school.name}</div>
          <h1 className="h-sm" style={{ fontSize: 64, lineHeight: 1, margin: '14px 0 0', letterSpacing: '-0.03em' }}>
            {p.complete} of {p.total} steps<br />complete.
          </h1>
          <p style={{ fontSize: 17, maxWidth: 520, margin: '18px 0 0', textWrap: 'pretty' }}>{dashboardLine(p)}</p>
          <SegBar total={p.total} on={p.complete} half={inFlight} style={{ marginTop: 32 }} />
          <div className="ink60" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
            <span>{p.startedAt ? `Started ${fmt(p.startedAt)}` : 'Not started yet'}</span><span>{pct}%</span>
          </div>
        </div>
        <div className="pad-sm" style={{ padding: 40, background: 'var(--color-accent)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
          {n ? (
            <>
              <div>
                <div className="kicker" style={{ color: 'var(--color-accent-200)' }}>Up next · Step {pad(n.num)}</div>
                <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginTop: 10 }}>{n.name}</div>
                <p style={{ fontSize: 15, margin: '12px 0 0', color: 'var(--color-accent-100)' }}>{upNextLine(p, n)}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {n.status === 'scheduled' ? (
                  <Row label="Opens" value={fmt(p.term.registration_opens)} />
                ) : prev?.completedAt && (n.status === 'in_review' || n.status === 'waiting_parent') ? (
                  <Row label="Submitted" value={fmt(prev.completedAt)} />
                ) : n.status === 'changes' ? (
                  <Row label="Counselor" value={p.counselor ? displayName(p.counselor, true) : '—'} />
                ) : (
                  <Row label="Term" value={p.term.name} />
                )}
                <Link href={`/student/steps/${n.id}`} className="btn btn-white">
                  {n.status === 'current' || n.status === 'changes' ? 'Start step' : 'View status'} <span>→</span>
                </Link>
              </div>
            </>
          ) : (
            <div>
              <div className="kicker" style={{ color: 'var(--color-accent-200)' }}>All done</div>
              <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginTop: 10 }}>You're set for {p.term.name}</div>
            </div>
          )}
        </div>
      </div>
      <div className="pad-sm" style={{ margin: '32px 40px 40px' }}>
        <StepGrid p={p} hrefBase="/student/steps" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '2px solid rgba(255,255,255,.35)', paddingTop: 10 }}>
      <span>{label}</span><span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  );
}

function NoSchool() {
  return (
    <div className="frame"><div style={{ padding: 40 }}><h1>No school on file</h1><p>Ask your Shasta College DE contact to add you to your high school.</p></div></div>
  );
}
