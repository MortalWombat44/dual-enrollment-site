import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { displayName, fmt, getProgress, markSeen, pad } from '@/lib/workflow';
import { completionCopy, stepSub } from '@/lib/stepcopy';
import { TopBar, SegBar } from '@/components/chrome';

export const dynamic = 'force-dynamic';

export default async function CompletePage({ params }: { params: Promise<{ n: string }> }) {
  const me = await requireRole('student');
  const { n } = await params;
  const p = getProgress(me.id);
  const s = p?.steps.find((x) => x.id === Number(n));
  if (!p || !s) notFound();
  if (s.status !== 'complete') redirect(`/student/steps/${s.id}`);
  if (!s.seen) markSeen(me.id, s.id);

  const copy = completionCopy(p, s);
  const next = p.steps.find((x) => x.status !== 'complete') ?? null;
  const remaining = p.steps.filter((x) => x.status !== 'complete');
  const nextIsScheduled = next?.status === 'scheduled' || (next?.id === 5 && next.status === 'locked');
  const d = s.data ?? {};
  const by =
    s.id === 3 ? { k: 'Signed by', v: String(d.signer ?? '—'), sub: `Parent / guardian · ${fmt(s.completedAt)}` } :
    s.id === 4 ? { k: 'Approved by', v: p.counselor ? displayName(p.counselor, true) : '—', sub: `${p.school.name} · ${fmt(s.completedAt)}` } :
    s.id === 7 ? { k: 'Cleared by', v: 'Shasta College', sub: fmt(s.completedAt) } :
    s.id === 8 ? { k: 'Approved by', v: 'College counselor', sub: `Shasta College · ${fmt(s.completedAt)}` } :
    { k: 'Completed', v: fmt(s.completedAt, 'mdy'), sub: fmt(s.completedAt, 'time') };
  const note =
    s.id === 4 || s.id === 7 || s.id === 8 ? (d.note ? `“${String(d.note)}”` : 'No note.') :
    s.id === 2 ? p.courses.map((c) => `${c.code} · ${c.units} units`).join(' · ') :
    s.id === 1 ? `Confirmation ${String(d.confirmation ?? '')}` :
    s.id === 3 ? (d.method === 'upload' ? 'Signed form uploaded.' : d.method === 'office' ? 'Consent on file with Shasta College.' : 'Signed online.') :
    `${p.termLabel} · ${p.school.name}`;

  return (
    <>
      {/* 2d · desktop */}
      <div className="frame only-desktop">
        <TopBar user={me} right={<span className="tag tag-neutral">Student</span>} />
        <div style={{ display: 'grid', gridTemplateColumns: '480px 1fr', borderBottom: '2px solid var(--color-text)' }}>
          <div style={{ background: 'var(--color-accent)', color: '#fff', padding: 40, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: 400, overflow: 'hidden' }}>
            <div className="kicker" style={{ color: 'var(--color-accent-200)' }}>Step complete</div>
            <div style={{ fontSize: 240, fontWeight: 800, lineHeight: 0.76, letterSpacing: '-0.06em', marginLeft: -10 }}>{pad(s.num)}</div>
          </div>
          <div style={{ padding: 48, display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'flex-end' }}>
            <h1 style={{ fontSize: 56, lineHeight: 1.02, margin: 0, letterSpacing: '-0.03em', whiteSpace: 'pre-line' }}>{copy.title}</h1>
            <p style={{ fontSize: 17, margin: 0, maxWidth: 560, textWrap: 'pretty' }}>{copy.body}</p>
            <SegBar total={p.total} on={p.complete} style={{ maxWidth: 560, marginTop: 8 }} />
            <div className="ink60" style={{ fontSize: 12 }}>{p.complete} of {p.total} complete</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          <div style={{ padding: '28px 40px', borderRight: '2px solid var(--color-divider)' }}>
            <div className="ink60" style={{ fontSize: 12 }}>{by.k}</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{by.v}</div>
            <div style={{ fontSize: 13, marginTop: 2 }}>{by.sub}</div>
          </div>
          <div style={{ padding: '28px 32px', borderRight: '2px solid var(--color-divider)' }}>
            <div className="ink60" style={{ fontSize: 12 }}>{s.id === 4 || s.id === 7 || s.id === 8 ? 'Note' : 'Details'}</div>
            <div style={{ fontSize: 15, marginTop: 4 }}>{note}</div>
          </div>
          <div style={{ padding: '28px 32px', background: 'var(--color-accent-100)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {next ? (
              <div>
                <div className="kicker accent700">Next · Step {pad(next.num)}</div>
                <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>{next.name}</div>
              </div>
            ) : (
              <div><div className="kicker accent700">All steps done</div><div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>See you in class</div></div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              {next && (nextIsScheduled ? (
                <a href="/student/calendar.ics" className="btn btn-primary" style={{ flex: 1, justifyContent: 'space-between' }}>Add to calendar <span>→</span></a>
              ) : (
                <Link href={`/student/steps/${next.id}`} className="btn btn-primary" style={{ flex: 1, justifyContent: 'space-between' }}>Go to step <span>→</span></Link>
              ))}
              <Link href="/student" className="btn btn-secondary">Dashboard</Link>
            </div>
          </div>
        </div>
      </div>

      {/* 1c · mobile */}
      <div className="only-mobile" style={{ minHeight: '100dvh', flexDirection: 'column' }}>
        <div style={{ background: 'var(--color-accent)', color: '#fff', padding: '14px 22px 0', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, fontSize: 13 }}>
            <span style={{ fontWeight: 800 }}>Shasta College DE</span>
            <Link href="/student" className="unlink" aria-label="Close" style={{ fontSize: 16, padding: 4 }}>✕</Link>
          </div>
          <div style={{ fontSize: 168, fontWeight: 800, lineHeight: 0.78, letterSpacing: '-0.06em', margin: '36px 0 0 -6px' }}>{pad(s.num)}</div>
          <div style={{ borderTop: '2px solid rgba(255,255,255,.4)', marginTop: 20, padding: '16px 0 22px' }}>
            <div className="kicker" style={{ color: 'var(--color-accent-200)' }}>Step complete</div>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1.05, marginTop: 6, letterSpacing: '-0.02em' }}>{copy.poster}</div>
          </div>
        </div>
        <SegBar total={p.total} on={p.complete} height={6} gap={3} style={{ padding: '16px 22px 0' }} />
        <div className="ink60" style={{ fontSize: 12, padding: '6px 22px 0' }}>{p.complete} of {p.total} complete</div>
        {remaining.length > 0 && (
          <div style={{ padding: '20px 22px 0', display: 'flex', flexDirection: 'column' }}>
            <div className="kicker-sm" style={{ paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>Still to do</div>
            {remaining.map((r) => {
              const isNext = r.id === next?.id;
              return (
                <Link key={r.id} href={`/student/steps/${r.id}`} className="unlink" style={{ display: 'grid', gridTemplateColumns: '36px 1fr auto', alignItems: 'center', padding: '14px 0', borderBottom: '2px solid var(--color-divider)', gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: isNext ? 'var(--color-accent)' : 'var(--ink-35)' }}>{pad(r.num)}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{r.short}</div>
                    <div className="ink60" style={{ fontSize: 12 }}>{stepSub(p, r)}{r.id === 5 && p.courses.length ? ` · ${p.courses.map((c) => c.code).join(', ')}` : ''}</div>
                  </div>
                  <span className={`tag ${isNext ? 'tag-accent' : 'tag-outline'}`}>{isNext ? 'Next' : 'Locked'}</span>
                </Link>
              );
            })}
          </div>
        )}
        <div style={{ marginTop: 'auto', padding: '16px 22px 26px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {next && (nextIsScheduled ? (
            <a href="/student/calendar.ics" className="btn btn-primary" style={{ width: '100%', justifyContent: 'space-between', padding: '16px 18px', fontSize: 16, minHeight: 52 }}>Remind me {fmt(p.term.registration_opens)} <span>→</span></a>
          ) : (
            <Link href={`/student/steps/${next.id}`} className="btn btn-primary" style={{ width: '100%', justifyContent: 'space-between', padding: '16px 18px', fontSize: 16, minHeight: 52 }}>Next: {next.short} <span>→</span></Link>
          ))}
          <Link href="/student" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', padding: '14px 18px', minHeight: 48 }}>Back to my steps</Link>
        </div>
      </div>
    </>
  );
}
