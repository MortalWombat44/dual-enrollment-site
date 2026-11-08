import Link from 'next/link';
import { requireAdmin, type User } from '@/lib/auth';
import { db } from '@/lib/db';
import { TermCourses } from '@/components/TermCourses';
import { classLabel, currentGrade, GRADES, isYoung, ordinal, allTerms, nextRegistration, daysSince, openIdChange, openSchoolChange, sharedStudentIds, youngRecommendation, type Term, fmt, getProgress, pad, schoolCourses, type StudentProgress } from '@/lib/workflow';
import {
  adminAddCourse, adminCompleteStep, decideYoung, recommendYoung, adminRemoveCourse, adminReopenStep, adminSetCourseTerm, clearUnits, decidePrerequisites, approveSchoolChange, declineSchoolChange, approveIdChange, declineIdChange, reassignSchool, sendBackToStudent, setGradYear, setStudentNumber,
} from '@/lib/admin-student-actions';
import { AdminShell } from '@/components/AdminShell';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Flash } from '@/components/chrome';
import { primarySchoolIds } from '@/lib/access';

export const dynamic = 'force-dynamic';

type Tab = 'units' | 'prereq' | 'young' | 'school' | 'idreq' | 'ids' | 'all';
type SP = { tab?: string; school?: string; term?: string; q?: string; student?: string; done?: string; error?: string };

const DONE: Record<string, string> = {
  cleared: 'Units cleared. The student moves to the next step.',
  sent_back: 'Sent back. The student will see your note on Course selection.',
  prereq: 'Prerequisite decisions saved.',
  moved: 'Step marked complete.',
  reopened: 'Step reopened, along with every step after it.',
  course_added: 'Class added to the request.',
  young_rec: 'Recommendation saved. A Young Student Approver makes the final decision.',
  young_approved: 'Approved. The student moves on to Clear units.',
  young_declined: 'Declined. The student sees your note on Course selection.',
  course_removed: 'Class removed from the request.',
  moved_school: 'Student moved to the new school.',
  course_term: 'Class moved to the new term.',
  school_change_approved: 'Moved to the requested school.',
  school_change_declined: 'School change request declined.',
  id_saved: 'Shasta College ID saved.',
  grad_saved: 'Graduation year saved.',
  id_change_approved: 'Shasta College ID changed.',
  id_change_declined: 'ID change request declined.',
};
const ERR: Record<string, string> = {
  ce: 'A concurrent class needs a course code (like PSYC C1000) and units.',
  note: 'Add a note so the student knows what to change.',
  decide: 'Approve or decline every class with a prerequisite.',
  not_counselor: 'Only admins designated as college counselors can approve prerequisites.',
  not_counselor_young: 'Only admins designated as college counselors can give the recommendation.',
  not_young_approver: 'Only Young Student Approvers can make the final decision.',
  same_person: 'The final decision has to come from a different admin than the one who gave the recommendation.',
  feedback: 'Add your feedback for the approver.',
  id: 'A Shasta College ID uses only letters, numbers and dashes.',
};

export default async function AdminStudents({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireAdmin('college');
  const sp = await searchParams;
  const term = nextRegistration();
  const terms = allTerms();
  const termId = Number(sp.term) || 0;
  const schools = db().prepare('SELECT id, name FROM schools ORDER BY name').all() as { id: number; name: string }[];
  const schoolId = Number(sp.school) || 0;
  const ids = (db()
    .prepare(`SELECT id FROM users WHERE role = 'student' ${schoolId ? 'AND school_id = ?' : ''} ORDER BY last_name, first_name`)
    .all(...(schoolId ? [schoolId] : [])) as { id: number }[]).map((r) => r.id);
  // A student is "in" a term if any of their classes is, or (no classes yet) it's their default term.
  const inTerm = (p: StudentProgress) => !termId || p.requestTerms.some((t) => t.id === termId) || (p.courses.length === 0 && p.term.id === termId);
  const all = ids.map(getProgress).filter((p): p is StudentProgress => !!p && inTerm(p));
  const waitingOn = (p: StudentProgress, id: number) => p.steps.find((s) => s.id === id)?.status === 'in_review';
  const shared = sharedStudentIds();
  const groups: Record<Tab, StudentProgress[]> = {
    units: all.filter((p) => waitingOn(p, 7)),
    prereq: all.filter((p) => waitingOn(p, 8)),
    young: all.filter((p) => waitingOn(p, 10)),
    school: all.filter((p) => !!openSchoolChange(p.student.id)),
    idreq: all.filter((p) => !!openIdChange(p.student.id)),
    ids: all.filter((p) => !!p.student.student_number && shared.has(p.student.student_number)),
    all,
  };
  const tab: Tab = (['prereq', 'young', 'school', 'idreq', 'ids', 'all'] as const).find((t) => t === sp.tab) ?? 'units';
  const q = (sp.q ?? '').trim().toLowerCase();
  // The admin's primary schools go to the top of their to-do.
  const primary = new Set(primarySchoolIds(me.id));
  const isMine = (p: StudentProgress) => primary.has(p.school.id);
  const rows = groups[tab]
    .filter((p) => !q || `${p.student.first_name} ${p.student.last_name} ${p.student.student_number ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => Number(isMine(b)) - Number(isMine(a)));
  const mineCount = rows.filter(isMine).length;
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
    if (termId) u.set('term', String(termId));
    if (sp.q) u.set('q', sp.q);
    if (o.student) u.set('student', String(o.student));
    const s = u.toString();
    return '/admin/students' + (s ? '?' + s : '');
  };
  const keep = { tab: tab === 'units' ? '' : tab, school: schoolId ? String(schoolId) : '', term: termId ? String(termId) : '', q: sp.q ?? '' };

  return (
    <AdminShell me={me} current="students">
      <div className="admin-head pad-sm">
        <div><div className="kicker accent700">{me.admin_level === 'super' ? 'Super admin' : 'College admin'}</div><h1>Students</h1></div>
        <form action="/admin/students" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab !== 'units' && <input type="hidden" name="tab" value={tab} />}
          <select name="school" className="input" defaultValue={schoolId || ''} style={{ width: 200 }}>
            <option value="">All schools</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select name="term" className="input" defaultValue={termId || ''} style={{ width: 160 }}>
            <option value="">All terms</option>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input className="input" name="q" defaultValue={sp.q} placeholder="Name or student ID" style={{ width: 180 }} />
          <button className="btn btn-secondary">Filter</button>
        </form>
      </div>
      <Flash msg={sp.done ? DONE[sp.done] : null} />
      <Flash error msg={sp.error ? ERR[sp.error] : null} />
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '2px solid var(--color-text)' }}>
        <Stat label={primary.size ? `Clear units · ${groups.units.filter(isMine).length} at your schools` : 'Clear units · waiting on you'} value={String(groups.units.length)} hero />
        <Stat label="Prerequisite review" value={String(groups.prereq.length)} />
        <Stat label="Waiting on parent" value={String(waitingParent)} />
        <Stat label={`Next registration · ${term.name}`} value={fmt(term.registration_opens)} last />
      </div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', flex: 1 }}>
        <div className="pad-sm noborder-sm" style={{ padding: '24px 32px 40px', borderRight: '2px solid var(--color-text)', minWidth: 0 }}>
          <div className="seg" style={{ marginBottom: 14 }}>
            <Link className="seg-opt" href={href({ tab: 'units' })} aria-current={tab === 'units'}>Clear units · {groups.units.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'prereq' })} aria-current={tab === 'prereq'}>Prerequisites · {groups.prereq.length}</Link>
            {(groups.young.length > 0 || tab === 'young') && (
              <Link className="seg-opt" href={href({ tab: 'young' })} aria-current={tab === 'young'}>Young students · {groups.young.length}</Link>
            )}
            <Link className="seg-opt" href={href({ tab: 'school' })} aria-current={tab === 'school'}>School changes · {groups.school.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'idreq' })} aria-current={tab === 'idreq'}>ID changes · {groups.idreq.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'ids' })} aria-current={tab === 'ids'}>Shared IDs · {groups.ids.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'all' })} aria-current={tab === 'all'}>All students · {groups.all.length}</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Student</th><th>School</th><th>Courses</th><th>Step</th><th>Waiting</th></tr></thead>
              <tbody>
                {rows.map((p, i) => {
                  const link = href({ student: p.student.id });
                  const header = primary.size > 0 && (i === 0 || isMine(rows[i - 1]) !== isMine(p))
                    ? <tr key={`h${i}`}><td colSpan={5} className="kicker-sm" style={{ paddingTop: i === 0 ? 8 : 20, color: isMine(p) ? 'var(--color-accent-700)' : 'var(--ink-60)' }}>{isMine(p) ? `Your schools · ${mineCount}` : `Other schools · ${rows.length - mineCount}`}</td></tr>
                    : null;
                  return [header,
                    <tr key={p.student.id} className={sel?.student.id === p.student.id ? 'sel' : undefined}>
                      <td><Link className="rowa" href={link}><strong>{p.student.first_name} {p.student.last_name}</strong>
                        {isYoung(p.student) && <span className="tag" style={{ marginLeft: 6, background: '#e8f0fb', color: '#1d3f6e' }} title="8th grade or below">Young student</span>}
                        {p.student.student_number && shared.has(p.student.student_number) && <span className="tag" style={{ marginLeft: 6, background: '#fdecea', color: '#6b1a12' }}>Shared ID</span>}
                      </Link></td>
                      <td><Link className="rowa" href={link}>{p.school.name.replace(' High School', ' HS')}</Link></td>
                      <td><Link className="rowa" href={link}>{p.courses.map((c) => c.code).join(', ') || '—'}</Link></td>
                      <td><Link className="rowa" href={link}>{p.next ? `${pad(p.next.num)} ${p.next.short}` : 'Done'}</Link></td>
                      <td><Link className="rowa" href={link}>{daysSince(waitingSince(p)) || '—'}</Link></td>
                    </tr>,
                  ];
                })}
                {rows.length === 0 && <tr><td colSpan={5} className="ink60" style={{ padding: '20px 8px' }}>{q ? 'No students match.' : tab === 'all' ? 'No students yet.' : 'Nothing waiting. Nice.'}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        {sel ? <Panel p={sel} me={me} schools={schools} terms={terms} keep={keep} sharedWith={(sel.student.student_number && shared.get(sel.student.student_number)?.filter((x) => x.id !== sel.student.id)) || []} /> : <div className="pad-sm ink60" style={{ padding: '28px 32px', fontSize: 14 }}>Pick a student to see their record.</div>}
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

function Panel({ p, me, schools, terms, keep, sharedWith }: { p: StudentProgress; me: User; schools: { id: number; name: string }[]; terms: Term[]; keep: Record<string, string>; sharedWith: { id: number; name: string }[] }) {
  const change = openSchoolChange(p.student.id);
  const idChange = openIdChange(p.student.id);
  const units = p.courses.reduce((n, c) => n + c.units, 0);
  const s7 = p.steps.find((s) => s.id === 7);
  const s8 = p.steps.find((s) => s.id === 8);
  const s9 = p.steps.find((s) => s.id === 9);
  const s10 = p.steps.find((s) => s.id === 10);
  const rec = s10?.status === 'in_review' ? youngRecommendation(p.student.id) : null;
  const recBy = rec ? (db().prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(rec.rec_by) as { first_name: string; last_name: string } | undefined) : undefined;
  const offered = schoolCourses(p.school.id);
  const consent = p.steps.find((s) => s.id === 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="pad-sm" style={{ padding: '24px 32px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker accent700">{p.next ? `Step ${pad(p.next.num)} · ${p.next.short}` : 'All steps done'}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{p.student.first_name} {p.student.last_name}{isYoung(p.student) && <span className="tag" style={{ marginLeft: 6, background: '#e8f0fb', color: '#1d3f6e' }} title="8th grade or below">Young student</span>}</div>
        <div style={{ fontSize: 14, marginTop: 2 }}>{p.termLabel} · {p.school.name} · {classLabel(p.student)} · ID {p.student.student_number ?? '—'}</div>
      </div>

      {change && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <div className="kicker accent700">School change requested</div>
          <div style={{ fontSize: 14 }}>{p.student.first_name} asked to move from <strong>{p.school.name}</strong> to <strong>{change.to_name}</strong>.</div>
          {change.note && <div style={{ fontSize: 14 }}>“{change.note}”</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button formAction={approveSchoolChange} className="btn btn-primary" style={{ flex: 1, justifyContent: 'space-between' }}>Move to {change.to_name.replace(' High School', ' HS')} <span>→</span></button>
            <button formAction={declineSchoolChange} className="btn btn-secondary">Decline</button>
          </div>
        </form>
      )}

      {idChange && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <div className="kicker accent700">Shasta College ID change requested</div>
          <div style={{ fontSize: 14 }}>
            {idChange.by_name} (high school staff) asked to change the ID from <strong>{idChange.current_number ?? 'none'}</strong> to <strong>{idChange.new_number}</strong>.
            {idChange.note && <> “{idChange.note}”</>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button formAction={approveIdChange} className="btn btn-primary" style={{ flex: 1, justifyContent: 'space-between' }}>Change ID to {idChange.new_number} <span>→</span></button>
            <button formAction={declineIdChange} className="btn btn-secondary">Decline</button>
          </div>
        </form>
      )}

      {sharedWith.length > 0 && (
        <form className="pad-sm" style={{ ...section, background: '#fdecea' }}>
          <Hidden p={p} keep={keep} />
          <div className="kicker" style={{ color: '#6b1a12' }}>Shared Shasta College ID</div>
          <div style={{ fontSize: 14, color: '#6b1a12' }}>
            ID {p.student.student_number} is also on: {sharedWith.map((x, i) => <span key={x.id}>{i > 0 && ', '}<a href={`/admin/students?tab=ids&student=${x.id}`}>{x.name}</a></span>)}. Check which account it belongs to.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input name="student_number" className="input" defaultValue={p.student.student_number ?? ''} aria-label="Shasta College ID" />
            <button formAction={setStudentNumber} className="btn btn-secondary">Save ID</button>
          </div>
        </form>
      )}

      {s7?.status === 'in_review' && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <input type="hidden" name="stepId" value={7} />
          <div className="kicker accent700">Clear units</div>
          <TermCourses courses={p.courses} terms={p.requestTerms} designation={p.school.designation} compact />
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
              <div style={{ fontSize: 14 }}><strong>{c.code}</strong> · {c.title} <span className="ink60">· {c.term_name ?? 'No term'}</span></div>
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

      {s10?.status === 'in_review' && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <div className="kicker accent700">Young student review · {classLabel(p.student)}</div>
          <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Documents:</span>
            {s9?.data?.transcript_file_id ? <a href={`/files/${s9.data.transcript_file_id}`} target="_blank" rel="noreferrer">Transcript / report card</a> : <span className="ink60">No transcript on file</span>}
            {s9?.data?.letter_file_id ? <a href={`/files/${s9.data.letter_file_id}`} target="_blank" rel="noreferrer">Principal's letter</a> : <span className="ink60">No principal letter on file</span>}
          </div>
          <TermCourses courses={p.courses} terms={p.requestTerms} designation={p.school.designation} compact showUnits={false} />
          {!rec ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 14 }}>1 · College counselor recommendation</div>
              {!me.is_college_counselor && <div style={{ fontSize: 13 }}>Waiting on a college counselor. Only admins designated as college counselors can give the recommendation.</div>}
              <div className="seg seg-modes" role="radiogroup" aria-label="Recommendation" style={{ alignSelf: 'flex-start' }}>
                <label className="seg-opt" data-v="required"><input type="radio" name="rec" value="recommend" disabled={!me.is_college_counselor} />Recommend</label>
                <label className="seg-opt" data-v="off"><input type="radio" name="rec" value="not_recommend" disabled={!me.is_college_counselor} />Don't recommend</label>
              </div>
              <div className="field"><label htmlFor="n10r">Feedback for the approver (required)</label><textarea id="n10r" name="note" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} disabled={!me.is_college_counselor} /></div>
              <button formAction={recommendYoung} className="btn btn-primary" disabled={!me.is_college_counselor} style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>Save recommendation <span>→</span></button>
            </>
          ) : (
            <>
              <div style={{ fontSize: 14, borderLeft: '4px solid var(--color-accent)', paddingLeft: 10 }}>
                <strong>{rec.rec === 'recommend' ? 'Recommended' : 'Not recommended'}</strong> by {recBy ? `${recBy.first_name} ${recBy.last_name}` : 'a college counselor'} · {fmt(rec.rec_at)}
                <div style={{ marginTop: 4 }}>“{rec.rec_note}”</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>2 · Final decision</div>
              {!me.is_young_approver ? <div style={{ fontSize: 13 }}>Waiting on a Young Student Approver.</div>
                : rec.rec_by === me.id ? <div style={{ fontSize: 13 }}>You gave the recommendation, so another Young Student Approver makes the final decision.</div> : null}
              {me.is_young_approver && rec.rec_by !== me.id && (
                <>
                  <div className="seg seg-modes" role="radiogroup" aria-label="Final decision" style={{ alignSelf: 'flex-start' }}>
                    <label className="seg-opt" data-v="required"><input type="radio" name="decision" value="approve" />Approve</label>
                    <label className="seg-opt" data-v="off"><input type="radio" name="decision" value="decline" />Decline</label>
                  </div>
                  <div className="field"><label htmlFor="n10d">Note to student (required if you decline)</label><textarea id="n10d" name="note" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} /></div>
                  <button formAction={decideYoung} className="btn btn-primary" style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>Save decision <span>→</span></button>
                </>
              )}
            </>
          )}
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
              <ConfirmButton formAction={adminReopenStep} message={s.id === 3 ? `Remove ${p.student.first_name}'s parent consent? Consent is one-time, so only do this if the parent revoked it.` : `Reopen “${s.short}” and every step after it? (Parent consent stays on file.)`} style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>
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
          <form key={`${c.id}-${c.term_id}`} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto auto', gap: 6, alignItems: 'center', fontSize: 14 }}>
            <Hidden p={p} keep={keep} />
            <input type="hidden" name="courseId" value={c.id} />
            <input type="hidden" name="fromTermId" value={c.term_id ?? ''} />
            <span><strong>{c.code}</strong> · {c.units} units</span>
            <select name="termId" className="input" defaultValue={c.term_id ?? ''} aria-label={`Term for ${c.code}`} style={{ minHeight: 30, padding: '2px 6px', fontSize: 13 }}>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_current === 1 ? '' : ' (closed)'}</option>)}
            </select>
            <button formAction={adminSetCourseTerm} className="btn btn-ghost" style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>Save</button>
            <ConfirmButton formAction={adminRemoveCourse} message={`Remove ${c.code} from ${p.student.first_name}'s request?`} style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>Remove</ConfirmButton>
          </form>
        ))}
        {offered.length > 0 && (
          <form style={{ display: 'flex', gap: 8 }}>
            <Hidden p={p} keep={keep} />
            <select name="courseId" className="input" required defaultValue="">
              <option value="" disabled>Request a Dual Enrollment class…</option>
              {offered.map((c) => <option key={c.id} value={c.id}>DE · {c.code} · {c.title} ({c.units})</option>)}
            </select>
            <select name="termId" className="input" defaultValue={p.term.id} aria-label="Term" style={{ width: 140 }}>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_current === 1 ? '' : ' (closed)'}</option>)}
            </select>
            <button formAction={adminAddCourse} className="btn btn-secondary">Add</button>
          </form>
        )}
        <form style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Hidden p={p} keep={keep} />
          <input name="ce_code" className="input" placeholder="Concurrent class, e.g. PSYC C1000" aria-label="Concurrent course code" required maxLength={20} style={{ flex: '1 1 180px' }} />
          <input name="ce_units" className="input" type="number" min={0.5} max={20} step={0.5} placeholder="Units" aria-label="Concurrent units" required style={{ width: 90 }} />
          <select name="termId" className="input" defaultValue={p.term.id} aria-label="Term for concurrent class" style={{ width: 140 }}>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}{t.is_current === 1 ? '' : ' (closed)'}</option>)}
          </select>
          <button formAction={adminAddCourse} className="btn btn-secondary">Add concurrent</button>
        </form>
      </div>

      <form className="pad-sm" style={section}>
        <Hidden p={p} keep={keep} />
        <div className="kicker">Grade and graduation year</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select name="grade" className="input" defaultValue={currentGrade(p.student) ?? ''} aria-label="Grade" style={{ width: 140 }}>
            <option value="">Grade…</option>
            {GRADES.map((g) => <option key={g} value={g}>{ordinal(g)} grade</option>)}
          </select>
          <input name="grad_year" type="number" min={2000} max={2100} className="input" defaultValue={p.student.grad_year ?? ''} aria-label="Graduation year" style={{ width: 120 }} />
          <button formAction={setGradYear} className="btn btn-secondary">Save</button>
        </div>
      </form>

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

      {me.admin_level === 'super' && (
        <div className="pad-sm" style={{ padding: '16px 32px 0', fontSize: 14 }}><a href={`/admin/audit.pdf?student=${p.student.id}`}>Download audit PDF (consent + course requests)</a></div>
      )}
      {consent?.status === 'complete' && (
        <div className="pad-sm" style={{ padding: '16px 32px', fontSize: 14 }}><a href={`/consent/${p.student.id}`} target="_blank" rel="noreferrer">View parent consent</a></div>
      )}
    </div>
  );
}
