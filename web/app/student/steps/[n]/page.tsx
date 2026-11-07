import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { activeTerms, displayName, fmt, getProgress, pad, schoolCourses, type StudentProgress, type StudentStep } from '@/lib/workflow';
import { TermCourses } from '@/components/TermCourses';
import { completionCopy, stepTag } from '@/lib/stepcopy';
import { submitCccapply, submitCourses, confirmRegistered, finishTextbooks } from '@/lib/student-actions';
import { unitLimit } from '@/lib/constants';
import { CoursePicker } from '@/components/CoursePicker';
import { PacketTable } from '@/components/PacketTable';
import { ParentInvite } from '@/components/ParentInvite';
import { logout } from '@/lib/session-actions';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  confirmation: 'Enter the confirmation number from your CCCApply email (letters, numbers and dashes).',
  none: 'Pick at least one course.',
  term: 'Pick an open term for every class.',
};

export default async function StepPage({ params, searchParams }: { params: Promise<{ n: string }>; searchParams: Promise<{ error?: string; invited?: string; invite_error?: string }> }) {
  const me = await requireRole('student');
  const { n } = await params;
  const { error, invited, invite_error } = await searchParams;
  const p = getProgress(me.id);
  const s = p?.steps.find((x) => x.id === Number(n));
  if (!p || !s) notFound();
  const next = p.steps.find((x) => x.num > s.num && x.status !== 'complete') ?? null;

  return (
    <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '100vh', maxWidth: 1280, margin: '0 auto', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
      <Sidebar p={p} current={s.id} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {s.status === 'complete' ? <CompleteView p={p} s={s} /> : <OpenView p={p} s={s} error={error ? ERRORS[error] : undefined} invited={Number(invited) || undefined} inviteError={invite_error} />}
        <div className="pad-sm" style={{ marginTop: 'auto', borderTop: '2px solid var(--color-text)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 48px', gap: 12, flexWrap: 'wrap' }}>
          {s.id === 3 && s.status === 'complete' ? (
            <a href={`/consent/${p.student.id}`} className="btn btn-ghost" style={{ color: 'var(--color-accent-700)' }}>View signed consent</a>
          ) : (
            <Link href="/student" className="btn btn-ghost" style={{ color: 'var(--color-accent-700)' }}>Back to my steps</Link>
          )}
          {next && (
            <Link href={`/student/steps/${next.id}`} className="btn btn-primary bigbtn full-sm" style={{ minWidth: 320 }}>
              Next: {next.short} <span>→</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function Sidebar({ p, current }: { p: StudentProgress; current: number }) {
  return (
    <div className="only-desktop" style={{ borderRight: '2px solid var(--color-text)', padding: '28px 0', display: 'flex', flexDirection: 'column' }}>
      <Link href="/student" className="unlink" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 28px 24px', borderBottom: '2px solid var(--color-divider)' }}>
        <div style={{ width: 22, height: 22, background: 'var(--color-accent)' }} />
        <div style={{ fontWeight: 800, fontSize: 15 }}>Shasta DE</div>
      </Link>
      <div className="kicker-sm ink60" style={{ padding: '22px 28px 10px' }}>Your steps</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {p.steps.map((s) => {
          const on = s.id === current;
          const dim = s.status === 'locked' || s.status === 'scheduled';
          return (
            <Link key={s.id} href={`/student/steps/${s.id}`} className="unlink" style={{
              display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, padding: on ? '12px 28px 12px 24px' : '12px 28px', alignItems: 'center', fontSize: 14,
              fontWeight: on ? 700 : undefined, background: on ? 'var(--color-accent-100)' : undefined, borderLeft: on ? '4px solid var(--color-accent)' : undefined,
              color: dim ? 'var(--ink-50)' : undefined,
            }}>
              {s.status === 'complete' ? (
                <span className="check" style={{ width: 22, height: 22, fontSize: 12 }}>✓</span>
              ) : (
                <span className="num-box" style={{ borderColor: dim ? 'var(--color-divider)' : undefined }}>{s.num}</span>
              )}
              {s.short}
            </Link>
          );
        })}
      </div>
      <form action={logout} style={{ marginTop: 'auto', padding: '20px 28px 0' }}>
        <button className="btn btn-ghost" style={{ color: 'var(--color-accent-700)' }}>Sign out</button>
      </form>
    </div>
  );
}

function Hero({ num, filled, tag, title, body }: { num: number; filled: boolean; tag: React.ReactNode; title: string; body: string }) {
  return (
    <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', borderBottom: '2px solid var(--color-text)' }}>
      <div className="only-desktop" style={{ width: 220, background: filled ? 'var(--color-accent)' : 'var(--color-surface)', color: filled ? '#fff' : 'var(--ink-35)', display: 'flex', alignItems: 'flex-end', padding: 28, fontSize: 120, fontWeight: 800, lineHeight: 0.8, letterSpacing: '-0.05em', borderRight: filled ? undefined : '2px solid var(--color-divider)' }}>
        {pad(num)}
      </div>
      <div className="pad-sm" style={{ padding: '44px 48px 40px' }}>
        {tag}
        <h1 className="h-sm" style={{ fontSize: 52, lineHeight: 1.02, margin: '16px 0 0', letterSpacing: '-0.03em', whiteSpace: 'pre-line' }}>{title}</h1>
        <p style={{ fontSize: 17, margin: '16px 0 0', maxWidth: 560, textWrap: 'pretty' }}>{body}</p>
      </div>
    </div>
  );
}

function Cells({ cells }: { cells: [string, string, string][] }) {
  return (
    <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length},1fr)`, borderBottom: '2px solid var(--color-divider)' }}>
      {cells.map(([k, v, sub], i) => (
        <div key={k} className="noborder-sm pad-sm" style={{ padding: i === 0 ? '24px 28px 24px 48px' : '24px 28px', borderRight: i < cells.length - 1 ? '2px solid var(--color-divider)' : undefined }}>
          <div className="ink60" style={{ fontSize: 12 }}>{k}</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{v}</div>
          <div style={{ fontSize: 13, marginTop: 2 }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

function CompleteView({ p, s }: { p: StudentProgress; s: StudentStep }) {
  const copy = completionCopy(p, s);
  const units = p.courses.reduce((n, c) => n + c.units, 0);
  const d = s.data ?? {};
  let cells: [string, string, string][];
  if (s.id === 3) {
    cells = [
      ['Signed by', String(d.signer ?? '—'), 'Parent / guardian'],
      ['Signed on', fmt(s.completedAt, 'mdy'), `${fmt(s.completedAt, 'time')} · ${d.method === 'upload' ? 'uploaded form' : d.method === 'office' ? 'marked complete by Shasta College' : 'e-signature'}`],
      ['Units requested', String(units || '—'), p.termLabel],
    ];
  } else if (s.id === 4 || s.id === 7 || s.id === 8) {
    cells = [
      s.id === 4 ? ['Approved by', p.counselor ? displayName(p.counselor, true) : '—', `${p.school.name} · ${fmt(s.completedAt)}`]
        : [s.id === 7 ? 'Cleared by' : 'Approved by', s.id === 7 ? 'Shasta College' : 'College counselor', fmt(s.completedAt)],
      ['Note', d.note ? `“${String(d.note)}”` : '—', ''],
      ['Units approved', String(units), p.termLabel],
    ];
  } else {
    cells = [
      ['Completed on', fmt(s.completedAt, 'mdy'), fmt(s.completedAt, 'time')],
      [s.id === 1 ? 'Confirmation' : s.id === 2 ? 'Courses' : 'Term', s.id === 1 ? String(d.confirmation ?? '') : s.id === 2 ? p.courses.map((c) => c.code).join(', ') : p.termLabel, s.id === 2 ? `${units} units` : ''],
      ['School', p.school.name, p.school.designation === 'CCAP' ? 'CCAP partner' : 'Special admit'],
    ];
  }
  return (
    <>
      <Hero num={s.num} filled tag={<span className="tag tag-accent">Step complete</span>} title={copy.title} body={copy.body} />
      <Cells cells={cells} />
      <div className="pad-sm" style={{ padding: '32px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h4 style={{ margin: 0, fontSize: 15 }}>Included in your packet</h4>
        <PacketTable p={p} />
      </div>
    </>
  );
}

function OpenView({ p, s, error, invited, inviteError }: { p: StudentProgress; s: StudentStep; error?: string; invited?: number; inviteError?: string }) {
  const tag = stepTag(s)!;
  const counselor = p.counselor ? displayName(p.counselor, true) : 'your counselor';
  const prevReq = [...p.steps].reverse().find((x) => x.num < s.num && x.mode === 'required' && x.status !== 'complete');
  const live = s.status !== 'locked' && s.status !== 'scheduled';
  const body =
    s.status === 'locked' ? `Finish step ${pad(prevReq?.num ?? s.num - 1)}, ${prevReq?.short.toLowerCase() ?? 'the step before this one'}, first.` :
    s.status === 'scheduled' ? `Registration for ${p.term.name} opens ${fmt(p.term.registration_opens, 'wmd')} at ${fmt(p.term.registration_opens, 'time')}.` :
    s.status === 'in_review' ? (
      s.id === 7 ? 'Shasta College is checking your courses and unit load. Usually 1–2 days.' :
      s.id === 8 ? 'A Shasta College counselor is reviewing the classes you picked that have a prerequisite.' :
      `${counselor} is reviewing your course plan. Usually 2–3 school days.`) :
    s.status === 'waiting_parent' ? (
      p.parents.some((x) => x.status === 'active') ? `${displayName(p.parents.find((x) => x.status === 'active')!)} can sign online or upload a signed form from their own account.` :
      p.parents[0] ? `${displayName(p.parents[0])} hasn't accepted your invite yet. Send them the link below again if they need it.` :
      'Invite your parent or guardian to sign. They get their own account, and it takes them about two minutes.') :
    s.status === 'changes' ? `${p.changeBy === 'college' ? 'Shasta College' : counselor} asked for changes to your course plan.` :
    s.description + '.';
  return (
    <>
      <Hero num={s.num} filled={live} tag={<span className={`tag tag-${tag.kind}`}>{tag.label}</span>} title={s.name} body={body} />
      {error && <div className="flash flash-err pad-sm" style={{ padding: '12px 48px' }}>{error}</div>}
      <div className="pad-sm" style={{ padding: '32px 48px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
        {s.id === 1 && s.status === 'current' && (
          <form action={submitCccapply} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Go to <a href="https://www.cccapply.org" target="_blank" rel="noreferrer">CCCApply</a> and pick Shasta College.</li>
              <li>Choose <strong>{p.termLabel}</strong> and “Dual enrollment / special admit” as your enrollment status.</li>
              <li>Copy the confirmation number from the email CCCApply sends you.</li>
            </ol>
            <div className="field" style={{ maxWidth: 360 }}><label htmlFor="conf">CCCApply confirmation number</label><input id="conf" name="confirmation" className="input" required placeholder="e.g. 18234567" /></div>
            <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Mark step complete <span>→</span></button></div>
          </form>
        )}
        {s.id === 2 && (s.status === 'current' || s.status === 'changes') && (
          <form action={submitCourses} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {p.changeNote && (
              <div style={{ borderLeft: '4px solid var(--color-accent)', background: 'var(--color-accent-100)', padding: '14px 18px' }}>
                <div className="kicker-sm accent700">Note from {p.changeBy === 'college' ? 'Shasta College' : counselor}</div>
                <div style={{ fontSize: 15, marginTop: 4 }}>“{p.changeNote}”</div>
              </div>
            )}
            <CoursePicker
              courses={schoolCourses(p.school.id)}
              initial={p.courses.map((c) => ({ id: c.id, term_id: c.term_id }))}
              terms={activeTerms().map((t) => ({ id: t.id, name: t.name, opens: fmt(t.registration_opens, 'mdy'), limit: unitLimit(p.school.designation, t.summer === 1) }))}
              ccap={p.school.designation === 'CCAP'}
              schoolName={p.school.name}
            />
            <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>{s.status === 'changes' ? 'Resubmit courses' : 'Submit courses'} <span>→</span></button></div>
          </form>
        )}
        {s.id === 3 && s.status !== 'complete' && <ParentInvite studentId={p.student.id} studentFirst={p.student.first_name} invited={invited} error={inviteError} />}
        {(s.status === 'in_review' || s.status === 'waiting_parent' || s.status === 'locked' || s.status === 'scheduled' || (s.id === 5 && s.status === 'current')) && p.courses.length > 0 && (
          <div>
            <div className="kicker-sm" style={{ paddingBottom: 8 }}>Your classes by term</div>
            <TermCourses courses={p.courses} terms={p.requestTerms} designation={p.school.designation} />
          </div>
        )}
        {s.id === 5 && s.status === 'current' && (
          <form action={confirmRegistered} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 15 }}>Register in myShasta for your approved sections: <strong>{p.courses.map((c) => c.code).join(', ')}</strong>.{p.school.designation === 'CCAP' ? ' For CCAP cohorts, Admissions & Records may register you; confirm here once you see the classes in myShasta.' : ''}</p>
            <div className="field" style={{ maxWidth: 360 }}><label htmlFor="crns">Section numbers (CRNs), optional</label><input id="crns" name="crns" className="input" placeholder="e.g. 40211, 40388" /></div>
            <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>I'm registered <span>→</span></button></div>
          </form>
        )}
        {s.id === 5 && s.status === 'scheduled' && (
          <div><a href="/student/calendar.ics" className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Add to calendar <span>→</span></a></div>
        )}
        {s.id === 6 && s.status === 'current' && (
          <form action={finishTextbooks} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li>Textbooks for dual enrollment sections are provided. Pick them up from your high school or the Shasta College bookstore.</li>
              <li>Log in to <a href="https://shastacollege.instructure.com" target="_blank" rel="noreferrer">Canvas</a> with your myShasta account. Courses show up a week before the term starts.</li>
            </ul>
            <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Mark as done <span>→</span></button></div>
          </form>
        )}
      </div>
    </>
  );
}

