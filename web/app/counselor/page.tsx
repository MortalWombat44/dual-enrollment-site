import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { currentTerm, daysSince, fmt, getProgress, getSchool, schoolModes, type StudentProgress } from '@/lib/workflow';
import { approve, sendBack } from '@/lib/counselor-actions';
import { TopBar, Flash } from '@/components/chrome';

export const dynamic = 'force-dynamic';

type Tab = 'ready' | 'incomplete' | 'approved';

export default async function CounselorQueue({ searchParams }: { searchParams: Promise<{ tab?: string; student?: string; q?: string; done?: string; name?: string; error?: string }> }) {
  const me = await requireRole('counselor');
  const sp = await searchParams;
  const school = me.school_id ? getSchool(me.school_id) : null;
  const term = currentTerm();
  const ids = (db().prepare("SELECT id FROM users WHERE role = 'student' AND school_id = ? ORDER BY last_name, first_name").all(me.school_id) as { id: number }[]).map((r) => r.id);
  const all = ids.map(getProgress).filter((p): p is StudentProgress => !!p);
  const s4 = (p: StudentProgress) => p.steps.find((s) => s.id === 4);
  const groups: Record<Tab, StudentProgress[]> = {
    ready: all.filter((p) => s4(p)?.status === 'in_review'),
    incomplete: all.filter((p) => { const s = s4(p); return s && (s.status === 'locked' || s.status === 'changes'); }),
    approved: all.filter((p) => s4(p)?.status === 'complete'),
  };
  // Oldest submissions first in the review queue.
  const submittedAt = (p: StudentProgress) => [...p.steps].reverse().find((s) => s.id < 4 && s.completedAt)?.completedAt ?? '';
  groups.ready.sort((a, b) => submittedAt(a).localeCompare(submittedAt(b)));
  const missingConsent = all.filter((p) => p.steps.find((s) => s.id === 3)?.status === 'waiting_parent').length;
  const tab: Tab = sp.tab === 'incomplete' || sp.tab === 'approved' ? sp.tab : 'ready';
  const q = (sp.q ?? '').trim().toLowerCase();
  const rows = groups[tab].filter((p) => !q || `${p.student.first_name} ${p.student.last_name}`.toLowerCase().includes(q));
  const sel = all.find((p) => p.student.id === Number(sp.student)) ?? rows[0] ?? null;
  const counselorOff = school ? schoolModes(school.id)[4] === 'off' : false;
  const href = (o: Partial<{ tab: Tab; student: number; q: string }>) => {
    const u = new URLSearchParams();
    const t = o.tab ?? tab; if (t !== 'ready') u.set('tab', t);
    const qq = o.q ?? sp.q; if (qq) u.set('q', qq);
    if (o.student) u.set('student', String(o.student));
    const s = u.toString();
    return '/counselor' + (s ? '?' + s : '');
  };
  const flash = sp.done === 'approved' ? `Approved ${sp.name}'s courses. They can register when registration opens.` : sp.done === 'changes' ? `Sent ${sp.name}'s plan back with your note.` : null;

  return (
    <div className="frame">
      <TopBar user={me} nav={[{ href: '/counselor', label: 'Review queue' }]} current="/counselor" right={<span className="tag tag-neutral">Counselor · {school?.name.replace('High School', 'HS') ?? '—'}</span>} />
      <Flash msg={flash} />
      <Flash msg={sp.error === 'note' ? 'Add a note so the student knows what to change.' : null} error />
      {counselorOff && <Flash msg={`Counselor approval is turned off for ${school?.name}. New students skip this step.`} />}
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '2px solid var(--color-text)' }}>
        <Stat label="Waiting on you" value={String(groups.ready.length)} hero />
        <Stat label="Missing parent consent" value={String(missingConsent)} />
        <Stat label="Approved this term" value={String(groups.approved.length)} />
        <Stat label="Registration opens" value={fmt(term.registration_opens)} last />
      </div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', flex: 1 }}>
        <div className="pad-sm noborder-sm" style={{ padding: '24px 40px 40px', borderRight: '2px solid var(--color-text)', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
            <div className="seg">
              <Link className="seg-opt" href={href({ tab: 'ready' })} aria-current={tab === 'ready'}>Ready to review · {groups.ready.length}</Link>
              <Link className="seg-opt" href={href({ tab: 'incomplete' })} aria-current={tab === 'incomplete'}>Incomplete · {groups.incomplete.length}</Link>
              <Link className="seg-opt" href={href({ tab: 'approved' })} aria-current={tab === 'approved'}>Approved</Link>
            </div>
            <form action="/counselor">
              {tab !== 'ready' && <input type="hidden" name="tab" value={tab} />}
              <input className="input" name="q" defaultValue={sp.q} placeholder="Search students" style={{ width: 240 }} />
            </form>
          </div>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Student</th><th>Grade</th><th>Courses</th><th>Steps</th><th>{tab === 'ready' ? 'Waiting' : tab === 'approved' ? 'Approved' : 'Next'}</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const link = href({ student: p.student.id });
                return (
                  <tr key={p.student.id} className={sel?.student.id === p.student.id ? 'sel' : undefined}>
                    <td><Link className="rowa" href={link}><strong>{p.student.first_name} {p.student.last_name}</strong></Link></td>
                    <td><Link className="rowa" href={link}>{p.student.grade ?? '—'}</Link></td>
                    <td><Link className="rowa" href={link}>{p.courses.map((c) => c.code).join(', ') || '—'}</Link></td>
                    <td><Link className="rowa" href={link}>{p.complete} / {p.total}</Link></td>
                    <td><Link className="rowa" href={link}>{tab === 'ready' ? daysSince(submittedAt(p)) : tab === 'approved' ? fmt(s4(p)?.completedAt) : p.next?.short ?? '—'}</Link></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={5} className="ink60" style={{ padding: '20px 8px' }}>{q ? 'No students match that search.' : tab === 'ready' ? 'Nothing waiting on you. Nice.' : 'No students here yet.'}</td></tr>}
            </tbody>
          </table>
        </div>
        <ReviewPanel p={sel} />
      </div>
    </div>
  );
}

function Stat({ label, value, hero, last }: { label: string; value: string; hero?: boolean; last?: boolean }) {
  return (
    <div className="pad-sm noborder-sm" style={{ padding: hero ? '28px 40px' : '28px 32px', borderRight: last ? undefined : '2px solid var(--color-divider)', background: hero ? 'var(--color-accent)' : undefined, color: hero ? '#fff' : undefined }}>
      <div style={{ fontSize: 13, color: hero ? 'var(--color-accent-100)' : 'var(--ink-60)' }}>{label}</div>
      <div style={{ fontSize: 52, fontWeight: 800, lineHeight: 1, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function ReviewPanel({ p }: { p: StudentProgress | null }) {
  if (!p) return <div className="pad-sm ink60" style={{ padding: '28px 32px', fontSize: 14 }}>Pick a student to see their plan.</div>;
  const s4 = p.steps.find((s) => s.id === 4);
  const canAct = s4?.status === 'in_review';
  const before = p.steps.filter((s) => s.id < 4);
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="pad-sm" style={{ padding: '28px 32px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker accent700">{canAct ? 'Reviewing' : s4?.status === 'complete' ? 'Approved' : 'In progress'}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{p.student.first_name} {p.student.last_name}</div>
        <div style={{ fontSize: 14, marginTop: 2 }}>Grade {p.student.grade ?? '—'} · GPA {p.student.gpa?.toFixed(1) ?? '—'} · ID {p.student.student_number ?? '—'}</div>
      </div>
      <div className="pad-sm" style={{ padding: '20px 32px', borderBottom: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {before.map((s) => (
          <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
            <span>{s.short}</span>
            {s.status === 'complete' ? (
              <span style={{ color: 'var(--color-accent-700)', fontWeight: 700 }}>✓ {fmt(s.completedAt)}{s.id === 3 && <> · <a href={`/consent/${p.student.id}`} target="_blank" rel="noreferrer">View</a></>}</span>
            ) : (
              <span className="ink60">{s.status === 'waiting_parent' ? 'Waiting on parent' : s.status === 'changes' ? 'Changes requested' : 'Not done'}</span>
            )}
          </div>
        ))}
      </div>
      <div className="pad-sm" style={{ padding: '20px 32px', borderBottom: '2px solid var(--color-divider)' }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>Courses requested</div>
        {p.courses.length ? p.courses.map((c) => <div key={c.id} style={{ fontSize: 14, marginTop: 6 }}>{c.code} · {c.units} units · {c.schedule}</div>) : <div className="ink60" style={{ fontSize: 14, marginTop: 6 }}>None yet</div>}
      </div>
      {canAct ? (
        <form style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <input type="hidden" name="studentId" value={p.student.id} />
          <div className="field pad-sm" style={{ padding: '20px 32px' }}>
            <label htmlFor="note">Note to student (optional for approval, required for changes)</label>
            <textarea id="note" name="note" className="input" maxLength={1000} style={{ minHeight: 72, resize: 'none' }} />
          </div>
          <div className="pad-sm" style={{ marginTop: 'auto', padding: '20px 32px 28px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '2px solid var(--color-text)' }}>
            <button formAction={approve} className="btn btn-primary" style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>Approve courses <span>→</span></button>
            <button formAction={sendBack} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>Request changes</button>
          </div>
        </form>
      ) : s4?.status === 'complete' && s4.data?.note ? (
        <div className="pad-sm" style={{ padding: '20px 32px', fontSize: 14 }}>Your note: “{String(s4.data.note)}”</div>
      ) : null}
    </div>
  );
}
