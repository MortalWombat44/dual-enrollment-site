import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { db, stepIndex } from '@/lib/db';
import { classLabel, currentGrade, GRADES, isYoung, openIdChange, ordinal, nextRegistration, daysSince, fmt, getProgress, getSchool, schoolModes, type StudentProgress } from '@/lib/workflow';
import { approve, requestIdChange, staffSetGrade } from '@/lib/counselor-actions';
import { TopBar, Flash } from '@/components/chrome';
import { TermCourses } from '@/components/TermCourses';
import { ApproveSignForm } from '@/components/ApproveSignForm';
import type { User } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type Tab = 'ready' | 'incomplete' | 'approved';

export default async function CounselorQueue({ searchParams }: { searchParams: Promise<{ tab?: string; student?: string; q?: string; done?: string; name?: string; error?: string }> }) {
  const me = await requireRole('counselor');
  const sp = await searchParams;
  const school = me.school_id ? getSchool(me.school_id) : null;
  const term = nextRegistration();
  const ids = (db().prepare("SELECT id FROM users WHERE role = 'student' AND school_id = ? ORDER BY last_name, first_name").all(me.school_id) as { id: number }[]).map((r) => r.id);
  const all = ids.map(getProgress).filter((p): p is StudentProgress => !!p);
  const s4 = (p: StudentProgress) => p.steps.find((s) => s.id === 4);
  const groups: Record<Tab, StudentProgress[]> = {
    ready: all.filter((p) => s4(p)?.status === 'in_review'),
    incomplete: all.filter((p) => { const s = s4(p); return s && (s.status === 'locked' || s.status === 'changes'); }),
    approved: all.filter((p) => s4(p)?.status === 'complete'),
  };
  // Oldest submissions first in the review queue.
  const submittedAt = (p: StudentProgress) => [...p.steps].reverse().find((s) => stepIndex(s.id) < stepIndex(4) && s.completedAt)?.completedAt ?? '';
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
  const flash = sp.done === 'approved' ? `Approved ${sp.name}'s courses. Shasta College clears their units next.` : sp.done === 'changes' ? `Sent ${sp.name}'s plan back with your note.`
    : sp.done === 'grade' ? 'Grade and graduation year saved.' : sp.done === 'id_request' ? 'ID change request sent to Shasta College.' : null;

  return (
    <div className="frame">
      <TopBar user={me} nav={[{ href: '/counselor', label: 'Review queue' }]} current="/counselor" right={<span className="tag tag-neutral">Counselor · {school?.name.replace('High School', 'HS') ?? '—'}</span>} />
      <Flash msg={flash} />
      <Flash msg={sp.error === 'note' ? 'Add a note so the student knows why a class was declined.' : sp.error === 'decide' ? 'Approve or decline every class.' : sp.error === 'signature' ? 'Sign (saved, drawn or typed) before approving.' : sp.error === 'grade' ? 'Pick a grade and a graduation year.' : sp.error === 'id' ? 'A Shasta College ID uses only letters, numbers and dashes.' : null} error />
      {counselorOff && <Flash msg={`High school approval is turned off for ${school?.name}. New students skip this step.`} />}
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '2px solid var(--color-text)' }}>
        <Stat label="Waiting on you" value={String(groups.ready.length)} hero />
        <Stat label="Missing parent consent" value={String(missingConsent)} />
        <Stat label="Approved this term" value={String(groups.approved.length)} />
        <Stat label={`Next registration · ${term.name}`} value={fmt(term.registration_opens)} last />
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
            <thead><tr><th>Student</th><th>Class</th><th>Courses</th><th>Steps</th><th>{tab === 'ready' ? 'Waiting' : tab === 'approved' ? 'Approved' : 'Next'}</th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const link = href({ student: p.student.id });
                return (
                  <tr key={p.student.id} className={sel?.student.id === p.student.id ? 'sel' : undefined}>
                    <td><Link className="rowa" href={link}><strong>{p.student.first_name} {p.student.last_name}</strong>{isYoung(p.student) && <span className="tag" style={{ marginLeft: 6, background: '#e8f0fb', color: '#1d3f6e' }} title="8th grade or below">Young student</span>}</Link></td>
                    <td><Link className="rowa" href={link}>{p.student.grad_year ?? p.student.grade ?? '—'}</Link></td>
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
        <ReviewPanel p={sel} me={me} />
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

function ReviewPanel({ p, me }: { p: StudentProgress | null; me: User }) {
  if (!p) return <div className="pad-sm ink60" style={{ padding: '28px 32px', fontSize: 14 }}>Pick a student to see their plan.</div>;
  const s4 = p.steps.find((s) => s.id === 4);
  const canAct = s4?.status === 'in_review';
  const before = p.steps.filter((s) => stepIndex(s.id) < stepIndex(4));
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="pad-sm" style={{ padding: '28px 32px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker accent700">{canAct ? 'Reviewing' : s4?.status === 'complete' ? 'Approved' : 'In progress'}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{p.student.first_name} {p.student.last_name}</div>
        <div style={{ fontSize: 14, marginTop: 2 }}>{classLabel(p.student)} · ID {p.student.student_number ?? '—'}</div>
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
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Courses requested</div>
        {p.courses.length ? <TermCourses courses={p.courses} terms={p.requestTerms} designation={p.school.designation} compact /> : <div className="ink60" style={{ fontSize: 14, marginTop: 6 }}>None yet</div>}
      </div>
      {canAct ? (
        <ApproveSignForm
          key={`${p.student.id}-${p.courses.map((c) => `${c.id}:${c.term_id}:${c.hs_status}`).join(',')}`}
          studentId={p.student.id}
          staffName={`${me.first_name} ${me.last_name}`}
          savedUrl={me.signature_file_id ? `/files/${me.signature_file_id}` : null}
          pending={p.courses.filter((c) => c.hs_status === 'pending').map((c) => ({ id: c.id, term_id: c.term_id, code: c.code, title: c.title, term_name: c.term_name }))}
          approve={approve}
        />
      ) : s4?.status === 'complete' && s4.data?.note ? (
        <div className="pad-sm" style={{ padding: '20px 32px', fontSize: 14 }}>Your note: “{String(s4.data.note)}”</div>
      ) : null}
      <StudentRecord p={p} />
    </div>
  );
}

/** High school staff can update grade + graduation year, and ask Shasta College to change a student's ID. */
function StudentRecord({ p }: { p: StudentProgress }) {
  const pending = openIdChange(p.student.id);
  const box: React.CSSProperties = { padding: '20px 32px', borderTop: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 10 };
  return (
    <>
      <form action={staffSetGrade} className="pad-sm" style={box}>
        <input type="hidden" name="studentId" value={p.student.id} />
        <div className="kicker">Grade and graduation year</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select name="grade" className="input" defaultValue={currentGrade(p.student) ?? ''} required aria-label="Grade" style={{ width: 140 }}>
            <option value="" disabled>Grade…</option>
            {GRADES.map((g) => <option key={g} value={g}>{ordinal(g)} grade</option>)}
          </select>
          <input name="grad_year" type="number" min={2000} max={2100} className="input" defaultValue={p.student.grad_year ?? ''} required aria-label="Graduation year" style={{ width: 110 }} />
          <button className="btn btn-secondary">Save</button>
        </div>
      </form>
      <form action={requestIdChange} className="pad-sm" style={box}>
        <input type="hidden" name="studentId" value={p.student.id} />
        <div className="kicker">Shasta College ID</div>
        <div style={{ fontSize: 14 }}>Current: <strong>{p.student.student_number ?? 'not added yet'}</strong></div>
        {pending ? (
          <div style={{ fontSize: 14, background: 'var(--color-accent-100)', padding: '8px 12px' }}>
            Change to <strong>{pending.new_number}</strong> requested by {pending.by_name}. Waiting for Shasta College to approve it.
          </div>
        ) : (
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 14, color: 'var(--color-accent-700)' }}>Request a Shasta College ID change</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <input name="new_number" className="input" required placeholder="Correct Shasta College ID" aria-label="New Shasta College ID" />
              <input name="note" className="input" placeholder="Why? (optional)" aria-label="Reason" />
              <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>Send request to Shasta College</button>
            </div>
          </details>
        )}
      </form>
    </>
  );
}
