import Link from 'next/link';
import { requireAdmin, type User } from '@/lib/auth';
import { db } from '@/lib/db';
import { MAX_UNITS } from '@/lib/constants';
import { currentTerm, daysSince, fmt, getProgress, pad, schoolCourses, type StudentProgress } from '@/lib/workflow';
import {
  adminAddCourse, adminCompleteStep, adminRemoveCourse, adminReopenStep, clearUnits, decidePrerequisites, reassignSchool, sendBackToStudent,
} from '@/lib/admin-student-actions';
import { AdminShell } from '@/components/AdminShell';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Flash } from '@/components/chrome';

export const dynamic = 'force-dynamic';

type Tab = 'units' | 'prereq' | 'all';
type SP = { tab?: string; school?: string; q?: string; student?: string; done?: string; error?: string };

const DONE: Record<string, string> = {
  cleared: 'Units cleared. The student moves to the next step.',
  sent_back: 'Sent back. The student will see your note on Course selection.',
  prereq: 'Prerequisite decisions saved.',
  moved: 'Step marked complete.',
  reopened: 'Step reopened, along with every step after it.',
  course_added: 'Class added to the request.',
  course_removed: 'Class removed from the request.',
  moved_school: 'Student moved to the new school.',
};
const ERR: Record<string, string> = {
  note: 'Add a note so the student knows what to change.',
  decide: 'Approve or decline every class with a prerequisite.',
  not_counselor: 'Only admins designated as college counselors can approve prerequisites.',
};

export default async function AdminStudents({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireAdmin('college');
  const sp = await searchParams;
  const term = currentTerm();
  const schools = db().prepare('SELECT id, name FROM schools ORDER BY name').all() as { id: number; name: string }[];
  const schoolId = Number(sp.school) || 0;
  const ids = (db()
    .prepare(`SELECT id FROM users WHERE role = 'student' ${schoolId ? 'AND school_id = ?' : ''} ORDER BY last_name, first_name`)
    .all(...(schoolId ? [schoolId] : [])) as { id: number }[]).map((r) => r.id);
  const all = ids.map(getProgress).filter((p): p is StudentProgress => !!p);
  const waitingOn = (p: StudentProgress, id: number) => p.steps.find((s) => s.id === id)?.status === 'in_review';
  const groups: Record<Tab, StudentProgress[]> = {
    units: all.filter((p) => waitingOn(p, 7)),
    prereq: all.filter((p) => waitingOn(p, 8)),
    all,
  };
  const tab: Tab = sp.tab === 'prereq' || sp.tab === 'all' ? sp.tab : 'units';
  const q = (sp.q ?? '').trim().toLowerCase();
  const rows = groups[tab].filter((p) => !q || `${p.student.first_name} ${p.student.last_name} ${p.student.student_number ?? ''}`.toLowerCase().includes(q));
  const sel = (sp.student && getProgress(Number(sp.student))) || rows[0] || null;
  const waitingParent = all.filter((p) => p.steps.find((s) => s.id === 3)?.status === 'waiting_parent').length;
  const waitingSince = (p: StudentProgress) => {
    const i = p.next ? p.steps.indexOf(p.next) : -1;
    return i > 0 ? p.steps[i - 1].completedAt : null;
  };
  const href = (o: Partial<{ tab: Tab; student: number }>) => {
    const u = new URLSearchParams();
    const t = o.tab ?? tab; if (t !== 'units') u.set('tab', t);
    if (schoolId) u.set('school', String(schoolId));
    if (sp.q) u.set('q', sp.q);
    if (o.student) u.set('student', String(o.student));
    const s = u.toString();
    return '/admin/students' + (s ? '?' + s : '');
  };
  const keep = { tab: tab === 'units' ? '' : tab, school: schoolId ? String(schoolId) : '', q: sp.q ?? '' };

  return (
    <AdminShell me={me} current="students">
      <div className="admin-head pad-sm">
        <div><div className="kicker accent700">{me.admin_level === 'super' ? 'Super admin' : 'College admin'}</div><h1>Students</h1></div>
        <form action="/admin/students" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab !== 'units' && <input type="hidden" name="tab" value={tab} />}
          <select name="school" className="input" defaultValue={schoolId || ''} style={{ width: 220 }}>
            <option value="">All schools</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input className="input" name="q" defaultValue={sp.q} placeholder="Name or student ID" style={{ width: 200 }} />
          <button className="btn btn-secondary">Filter</button>
        </form>
      </div>
      <Flash msg={sp.done ? DONE[sp.done] : null} />
      <Flash error msg={sp.error ? ERR[sp.error] : null} />
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '2px solid var(--color-text)' }}>
        <Stat label="Clear units · waiting on you" value={String(groups.units.length)} hero />
        <Stat label="Prerequisite review" value={String(groups.prereq.length)} />
        <Stat label="Waiting on parent" value={String(waitingParent)} />
        <Stat label="Registration opens" value={fmt(term.registration_opens)} last />
      </div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', flex: 1 }}>
        <div className="pad-sm noborder-sm" style={{ padding: '24px 32px 40px', borderRight: '2px solid var(--color-text)', minWidth: 0 }}>
          <div className="seg" style={{ marginBottom: 14 }}>
            <Link className="seg-opt" href={href({ tab: 'units' })} aria-current={tab === 'units'}>Clear units · {groups.units.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'prereq' })} aria-current={tab === 'prereq'}>Prerequisites · {groups.prereq.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'all' })} aria-current={tab === 'all'}>All students · {groups.all.length}</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Student</th><th>School</th><th>Courses</th><th>Step</th><th>Waiting</th></tr></thead>
              <tbody>
                {rows.map((p) => {
                  const link = href({ student: p.student.id });
                  return (
                    <tr key={p.student.id} className={sel?.student.id === p.student.id ? 'sel' : undefined}>
                      <td><Link className="rowa" href={link}><strong>{p.student.first_name} {p.student.last_name}</strong></Link></td>
                      <td><Link className="rowa" href={link}>{p.school.name.replace(' High School', ' HS')}</Link></td>
                      <td><Link className="rowa" href={link}>{p.courses.map((c) => c.code).join(', ') || '—'}</Link></td>
                      <td><Link className="rowa" href={link}>{p.next ? `${pad(p.next.num)} ${p.next.short}` : 'Done'}</Link></td>
                      <td><Link className="rowa" href={link}>{daysSince(waitingSince(p)) || '—'}</Link></td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={5} className="ink60" style={{ padding: '20px 8px' }}>{q ? 'No students match.' : tab === 'all' ? 'No students yet.' : 'Nothing waiting. Nice.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {sel ? <Panel p={sel} me={me} schools={schools} keep={keep} /> : <div className="pad-sm ink60" style={{ padding: '28px 32px', fontSize: 14 }}>Pick a student to see their record.</div>}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, hero, last }: { label: string; value: string; hero?: boolean; last?: boolean }) {
  return (
    <div className="pad-sm noborder-sm" style={{ padding: hero ? '24px 32px' : '24px 28px', borderRight: last ? undefined : '2px solid var(--color-divider)', background: hero ? 'var(--color-accent)' : undefined, color: hero ? '#fff' : undefined }}>
      <div style={{ fontSize: 13, color: hero ? 'var(--color-accent-100)' : 'var(--ink-60)' }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, marginTop: 6 }}>{value}</div>
    </div>
  );
}

function Hidden({ p, keep }: { p: StudentProgress; keep: Record<string, string> }) {
  return (
    <>
      <input type="hidden" name="studentId" value={p.student.id} />
      {Object.entries(keep).map(([k, v]) => v && <input key={k} type="hidden" name={k} value={v} />)}
    </>
  );
}

const section: React.CSSProperties = { padding: '20px 32px', borderBottom: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 10 };

function Panel({ p, me, schools, keep }: { p: StudentProgress; me: User; schools: { id: number; name: string }[]; keep: Record<string, string> }) {
  const units = p.courses.reduce((n, c) => n + c.units, 0);
  const s7 = p.steps.find((s) => s.id === 7);
  const s8 = p.steps.find((s) => s.id === 8);
  const offered = schoolCourses(p.school.id).filter((c) => !p.courses.some((r) => r.id === c.id));
  const consent = p.steps.find((s) => s.id === 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="pad-sm" style={{ padding: '24px 32px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker accent700">{p.next ? `Step ${pad(p.next.num)} · ${p.next.short}` : 'All steps done'}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{p.student.first_name} {p.student.last_name}</div>
        <div style={{ fontSize: 14, marginTop: 2 }}>{p.school.name} · Grade {p.student.grade ?? '—'} · GPA {p.student.gpa?.toFixed(1) ?? '—'} · ID {p.student.student_number ?? '—'}</div>
      </div>

      {s7?.status === 'in_review' && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <input type="hidden" name="stepId" value={7} />
          <div className="kicker accent700">Clear units</div>
          {p.courses.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}><span><strong>{c.code}</strong> · {c.title}</span><span>{c.units} units</span></div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, fontWeight: 800, borderTop: '2px solid var(--color-text)', paddingTop: 8, color: units > MAX_UNITS ? '#b3261e' : undefined }}>
            <span>Total</span><span>{units} of {MAX_UNITS} units{units > MAX_UNITS ? ' · over the limit' : ''}</span>
          </div>
          <div className="field"><label htmlFor="n7">Note to student (required to send back)</label><textarea id="n7" name="note" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} /></div>
          <button formAction={clearUnits} className="btn btn-primary" style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>Clear units <span>→</span></button>
          <button formAction={sendBackToStudent} className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>Send back to student</button>
        </form>
      )}

      {s8?.status === 'in_review' && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <input type="hidden" name="stepId" value={8} />
          <div className="kicker accent700">Prerequisite review</div>
          {!me.is_college_counselor && <div style={{ fontSize: 13 }}>Only admins designated as college counselors can approve or decline these.</div>}
          {p.courses.filter((c) => c.prerequisite).map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--color-divider)' }}>
              <div style={{ fontSize: 14 }}><strong>{c.code}</strong> · {c.title}</div>
              <div className="ink60" style={{ fontSize: 13 }}>Prerequisite: {c.prerequisite}</div>
              <div className="seg seg-modes" role="radiogroup" aria-label={`${c.code} decision`} style={{ alignSelf: 'flex-start' }}>
                <label className="seg-opt" data-v="required"><input type="radio" name={`course_${c.id}`} value="approve" disabled={!me.is_college_counselor} />Approve</label>
                <label className="seg-opt" data-v="off"><input type="radio" name={`course_${c.id}`} value="decline" disabled={!me.is_college_counselor} />Decline</label>
              </div>
            </div>
          ))}
          <div className="field"><label htmlFor="n8">Note to student (required if you decline)</label><textarea id="n8" name="note" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} disabled={!me.is_college_counselor} /></div>
          <button formAction={decidePrerequisites} className="btn btn-primary" disabled={!me.is_college_counselor} style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>Save decisions <span>→</span></button>
        </form>
      )}

      <div className="pad-sm" style={section}>
        <div className="kicker">Steps · move forward or back</div>
        {p.steps.map((s) => (
          <form key={s.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <Hidden p={p} keep={keep} />
            <input type="hidden" name="stepId" value={s.id} />
            <span style={{ fontWeight: 800, color: s.status === 'complete' ? 'var(--color-accent)' : 'var(--ink-35)' }}>{pad(s.num)}</span>
            <span>
              {s.short}
              <span className="ink60" style={{ fontSize: 12 }}> · {s.status === 'complete' ? `✓ ${fmt(s.completedAt)}` : s.status === 'in_review' ? 'In review' : s.status === 'waiting_parent' ? 'Waiting on parent' : s.status === 'changes' ? 'Changes requested' : s.status === 'locked' ? 'Locked' : s.status === 'scheduled' ? 'Not open yet' : 'Student to do'}</span>
            </span>
            {s.status === 'complete' ? (
              <ConfirmButton formAction={adminReopenStep} message={`Reopen “${s.short}” and every step after it?`} style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>
                Move back
              </ConfirmButton>
            ) : (
              <ConfirmButton formAction={adminCompleteStep} message={`Mark “${s.short}” complete for ${p.student.first_name}?`} style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>
                Mark complete
              </ConfirmButton>
            )}
          </form>
        ))}
      </div>

      <div className="pad-sm" style={section}>
        <div className="kicker">Classes requested · {units} units</div>
        {p.courses.map((c) => (
          <form key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14 }}>
            <Hidden p={p} keep={keep} />
            <input type="hidden" name="courseId" value={c.id} />
            <span><strong>{c.code}</strong> · {c.units} units · {c.schedule}</span>
            <ConfirmButton formAction={adminRemoveCourse} message={`Remove ${c.code} from ${p.student.first_name}'s request?`} style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>Remove</ConfirmButton>
          </form>
        ))}
        {offered.length > 0 && (
          <form style={{ display: 'flex', gap: 8 }}>
            <Hidden p={p} keep={keep} />
            <select name="courseId" className="input" required defaultValue="">
              <option value="" disabled>Request a class for this student…</option>
              {offered.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.title} ({c.units})</option>)}
            </select>
            <button formAction={adminAddCourse} className="btn btn-secondary">Add</button>
          </form>
        )}
      </div>

      <form className="pad-sm" style={section}>
        <Hidden p={p} keep={keep} />
        <div className="kicker">School</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select name="schoolId" className="input" defaultValue={p.school.id}>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <ConfirmButton formAction={reassignSchool} className="btn btn-secondary" message={`Move ${p.student.first_name} to the selected school? Their counselor and step rules change to that school's.`}>Move</ConfirmButton>
        </div>
      </form>

      {consent?.status === 'complete' && (
        <div className="pad-sm" style={{ padding: '16px 32px', fontSize: 14 }}><a href={`/consent/${p.student.id}`} target="_blank" rel="noreferrer">View parent consent</a></div>
      )}
    </div>
  );
}
