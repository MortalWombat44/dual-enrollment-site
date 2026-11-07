import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { sharesWithParents } from '@/lib/access';
import { displayName, fmt, getProgress, pad, studentsForParent } from '@/lib/workflow';
import { upNextLine } from '@/lib/stepcopy';
import { TopBar, SegBar, Flash } from '@/components/chrome';
import { StepGrid } from '@/components/StepGrid';

export const dynamic = 'force-dynamic';

/** Parent home, built on the 1a dashboard layout (4-up step grid + contact cell). */
export default async function ParentHome({ searchParams }: { searchParams: Promise<{ student?: string; signed?: string }> }) {
  const me = await requireRole('parent');
  const sp = await searchParams;
  const kids = studentsForParent(me.id);
  if (kids.length === 0) {
    return (
      <div className="frame">
        <TopBar user={me} right={<span className="tag tag-neutral">Parent / guardian</span>} />
        <div style={{ padding: 40 }}><h1>No students linked yet</h1><p>Ask Shasta College Outreach to link your student to your account.</p></div>
      </div>
    );
  }
  const kid = kids.find((k) => k.id === Number(sp.student ?? sp.signed)) ?? kids[0];
  const p = getProgress(kid.id)!;
  if (!sharesWithParents(kid.id)) {
    // Not shared: the parent only learns whether their consent is needed, nothing else.
    const consentNeeded = p.steps.find((s) => s.id === 3)?.status === 'waiting_parent';
    const signedByMe = p.steps.find((s) => s.id === 3)?.data?.parent_id === me.id;
    return (
      <div className="frame">
        <TopBar
          user={me}
          nav={kids.length > 1 ? kids.map((k) => ({ href: `/parent?student=${k.id}`, label: k.first_name })) : []}
          current={kids.length > 1 ? `/parent?student=${kid.id}` : undefined}
          right={<><span className="hide-sm">Student: <strong>{kid.first_name} {kid.last_name}</strong></span><span className="tag tag-neutral">Parent / guardian</span></>}
        />
        <Flash msg={sp.signed ? `Thanks, ${me.first_name}. Your consent for ${kid.first_name} is in.` : null} />
        <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', borderBottom: '2px solid var(--color-text)' }}>
          <div className="pad-sm noborder-sm" style={{ padding: 40, borderRight: '2px solid var(--color-divider)' }}>
            <div className="kicker accent700">{p.term.name} · Dual Enrollment</div>
            <h1 className="h-sm" style={{ fontSize: 56, lineHeight: 1.02, margin: '14px 0 0', letterSpacing: '-0.03em' }}>{kid.first_name}'s progress<br />is private.</h1>
            <p style={{ fontSize: 17, maxWidth: 560, margin: '18px 0 0', textWrap: 'pretty' }}>
              {kid.first_name} hasn't shared their dual enrollment records with you. If they turn on sharing in their account, you'll see their steps, courses and counselor review here.
            </p>
            {signedByMe && (
              <p style={{ fontSize: 15, margin: '18px 0 0' }}><a href={`/consent/${kid.id}`}>View the consent you signed</a></p>
            )}
          </div>
          <div className="pad-sm" style={{ padding: 40, background: consentNeeded ? 'var(--color-accent)' : 'var(--color-surface)', color: consentNeeded ? '#fff' : undefined, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
            {consentNeeded ? (
              <>
                <div>
                  <div className="kicker" style={{ opacity: 0.85 }}>Waiting on you</div>
                  <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginTop: 10, letterSpacing: '-0.02em' }}>Parent consent form</div>
                  <p style={{ fontSize: 15, margin: '12px 0 0', color: 'var(--color-accent-100)' }}>{kid.first_name} needs your permission to take Shasta College courses. You'll see the courses before you sign.</p>
                </div>
                <Link href={`/parent/consent?student=${kid.id}`} className="btn btn-white">Review &amp; sign <span>→</span></Link>
              </>
            ) : (
              <div>
                <div className="kicker">Nothing needed from you</div>
                <p style={{ fontSize: 15, margin: '12px 0 0' }}>We'll show a consent request here when {kid.first_name} is ready for your signature.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  const consent = p.steps.find((s) => s.id === 3);
  const needsYou = consent?.status === 'waiting_parent';
  const n = needsYou ? consent! : p.next;
  const contact = db().prepare("SELECT first_name, last_name, email FROM users WHERE role = 'admin' AND title = 'Outreach' AND status = 'active' LIMIT 1").get() as
    | { first_name: string; last_name: string; email: string } | undefined;
  const cleared = [...p.steps].reverse().find((s) => s.status === 'complete');
  const pct = Math.round((p.complete / p.total) * 100);
  const inFlight = p.next && (p.next.status === 'in_review' || p.next.status === 'waiting_parent') ? 1 : 0;
  const line = p.done
    ? `${kid.first_name} has finished every required step for ${p.term.name}.`
    : needsYou
      ? `${kid.first_name}'s courses are picked. Your consent is the next step.`
      : `${kid.first_name} is cleared through ${cleared?.short.toLowerCase() ?? 'the first step'}.${p.next ? ` ${p.next.short} is next.` : ''}`;

  return (
    <div className="frame">
      <TopBar
        user={me}
        nav={kids.length > 1 ? kids.map((k) => ({ href: `/parent?student=${k.id}`, label: k.first_name })) : []}
        current={kids.length > 1 ? `/parent?student=${kid.id}` : undefined}
        right={<><span className="hide-sm">Student: <strong>{kid.first_name} {kid.last_name}</strong></span><span className="tag tag-neutral">Parent / guardian</span></>}
      />
      <Flash msg={sp.signed ? `Thanks, ${me.first_name}. Your consent for ${kid.first_name} is in.` : null} />
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', borderBottom: '2px solid var(--color-text)' }}>
        <div className="pad-sm noborder-sm" style={{ padding: 40, borderRight: '2px solid var(--color-divider)' }}>
          <div className="kicker accent700">{p.term.name} · {p.school.name}</div>
          <h1 className="h-sm" style={{ fontSize: 64, lineHeight: 1, margin: '14px 0 0', letterSpacing: '-0.03em' }}>{p.complete} of {p.total} steps<br />complete.</h1>
          <p style={{ fontSize: 17, maxWidth: 520, margin: '18px 0 0', textWrap: 'pretty' }}>{line}</p>
          <SegBar total={p.total} on={p.complete} half={inFlight} style={{ marginTop: 32 }} />
          <div className="ink60" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 8 }}>
            <span>{p.startedAt ? `Started ${fmt(p.startedAt)}` : 'Not started yet'}</span><span>{pct}%</span>
          </div>
        </div>
        <div className="pad-sm" style={{ padding: 40, background: 'var(--color-accent)', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 24 }}>
          {n ? (
            <>
              <div>
                <div className="kicker" style={{ opacity: 0.85 }}>{needsYou ? 'Waiting on you' : 'Up next'} · Step {pad(n.num)}</div>
                <div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginTop: 10, letterSpacing: '-0.02em' }}>{n.name}</div>
                <p style={{ fontSize: 15, margin: '12px 0 0', color: 'var(--color-accent-100)' }}>
                  {needsYou ? 'Sign online with your finger or mouse, or upload a signed copy. It takes about two minutes.' : upNextLine(p, n).replace(/\byour\b/g, `${kid.first_name}'s`)}
                </p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, borderTop: '2px solid rgba(255,255,255,.35)', paddingTop: 10 }}>
                  <span>Registration opens</span><span style={{ fontWeight: 700 }}>{fmt(p.term.registration_opens)}</span>
                </div>
                {needsYou && <Link href={`/parent/consent?student=${kid.id}`} className="btn btn-white">Review &amp; sign <span>→</span></Link>}
              </div>
            </>
          ) : (
            <div><div className="kicker" style={{ opacity: 0.85 }}>All done</div><div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1, marginTop: 10 }}>{kid.first_name} is set for {p.term.name}</div></div>
          )}
        </div>
      </div>
      <div className="pad-sm" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '28px 40px 16px' }}>
        <h3 style={{ margin: 0, fontSize: 20 }}>All steps</h3>
        <span className="ink60" style={{ fontSize: 13 }}>Steps unlock in order</span>
      </div>
      <div className="pad-sm" style={{ margin: '0 40px 40px' }}>
        <StepGrid
          p={p}
          cols={4}
          big
          extraCell={
            <div style={{ padding: '22px 20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 10, background: 'var(--color-surface)', minHeight: 180 }}>
              <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                Questions about a step? {contact ? <>Your DE contact is <strong>{contact.first_name} {contact.last_name}</strong>, Shasta College Outreach.</> : 'Contact Shasta College Outreach.'}
                {p.counselor && <> {kid.first_name}'s counselor is {displayName(p.counselor, true)}.</>}
              </div>
              {contact && <a href={`mailto:${contact.email}`} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>Message {contact.first_name}</a>}
            </div>
          }
        />
      </div>
    </div>
  );
}
