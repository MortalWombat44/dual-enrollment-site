import Link from 'next/link';
import { requireAdmin, type User } from '@/lib/auth';
import { db } from '@/lib/db';
import { TermCourses } from '@/components/TermCourses';
import { HOLD_LABEL, stepOnLabel, stepStatusLabel, classLabel, currentGrade, GRADES, isYoung, ordinal, allTerms, nextRegistration, daysSince, openIdChange, openSchoolChange, sharedStudentIds, latestAffidavit, maxUnitTerms, youngRecommendation, type Term, fmt, getProgress, pad, schoolCourses, type StudentProgress } from '@/lib/workflow';
import {
  adminAddCourse, adminCompleteStep, adminUploadTranscript, releasePrereqHold, adminFlagPrereq, adminSendApproverLink, nudgePrerequisite, reviewAffidavit, decideYoung, recommendYoung, adminRemoveCourse, adminReopenStep, adminSetCourseTerm, clearUnits, decidePrerequisites, approveSchoolChange, declineSchoolChange, approveIdChange, declineIdChange, reassignSchool, sendBackToStudent, setGradYear, setStudentNumber,
} from '@/lib/admin-student-actions';
import { AdminShell } from '@/components/AdminShell';
import { ConfirmButton } from '@/components/ConfirmButton';
import { StudentContact } from '@/components/StudentContact';
import { Flash } from '@/components/chrome';
import { ArchivedRequests } from '@/components/ArchivedRequests';
import { helpRequests, openHelpStudentIds } from '@/lib/help';
import { resolveHelp } from '@/lib/help-actions';
import { openNudges } from '@/lib/nudge';
import { primarySchoolIds } from '@/lib/access';
import { studentHistory } from '@/lib/audit';
import { TRANSCRIPT_ERRORS, transcriptsFor } from '@/lib/transcripts';

export const dynamic = 'force-dynamic';

type Tab = 'help' | 'overdue' | 'units' | 'prereq' | 'prereqwait' | 'young' | 'homeschool' | 'school' | 'idreq' | 'ids' | 'all';
type SP = { link?: string; emailed?: string; classes?: string; tab?: string; school?: string; term?: string; q?: string; student?: string; done?: string; error?: string };

const DONE: Record<string, string> = {
  cleared: 'Verified and units cleared. The student moves to the next step.',
  sent_back: 'Sent back. The student will see your note on Course selection.',
  prereq: 'Prerequisite decisions saved.',
  prereq_hold: 'Saved. Classes on hold leave the queue (Waiting on student) until the student responds or someone puts them back.',
  hold_released: 'Back in the Prerequisites queue.',
  hold_none: 'That class wasn’t on hold any more.',
  transcript: 'Transcript added. A counselor sees it on Prerequisite review.',
  moved: 'Step marked complete.',
  reopened: 'Step reopened, along with every step after it.',
  course_added: 'Class added to the request.',
  affidavit_ok: 'Private School Affidavit approved.',
  prereq_flagged: 'Sent to prerequisite review. A college counselor decides it (College review isn’t affected).',
  prereq_unflagged: 'Flag removed.',
  nudged: 'Nudged. College counselors are notified, and the student is at the top of the Prerequisites queue, highlighted.',
  help_resolved: 'Help request resolved. The student sees your reply.',
  help_already: 'That help request was already resolved.',
  affidavit_declined: 'Affidavit declined. The student and parent see your note and can upload a new one.',
  young_rec: 'Recommendation saved. A Young Student Approver makes the final decision.',
  young_approved: 'Approved. The student moves on to College review.',
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
  ncws: 'Check “Student cleared in NCWS” before approving a prerequisite.',
  info_note: 'Say what information you need in the note (the student sees it).',
  tr_file: TRANSCRIPT_ERRORS.file, tr_size: TRANSCRIPT_ERRORS.size, tr_type: TRANSCRIPT_ERRORS.type,
  verify: 'Check Program in SACP, Start date in RGPE and Cohort in STAL before clearing.',
  no_approver: 'This student has no high school approver email on file.',
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
  // "My schools": the admin's primary schools.
  const myIds = primarySchoolIds(me.id);
  const mine = sp.school === 'mine' && myIds.length > 0;
  const schoolFilter = mine ? `AND school_id IN (${myIds.map(() => '?').join(',')})` : schoolId ? 'AND school_id = ?' : '';
  const schoolArgs = mine ? myIds : schoolId ? [schoolId] : [];
  const ids = (db()
    .prepare(`SELECT id FROM users WHERE role = 'student' ${schoolFilter} ORDER BY last_name, first_name`)
    .all(...schoolArgs) as { id: number }[]).map((r) => r.id);
  // A student is "in" a term if any of their classes is, or (no classes yet) it's their default term.
  const inTerm = (p: StudentProgress) => !termId || p.requestTerms.some((t) => t.id === termId) || (p.courses.length === 0 && p.term.id === termId);
  const all = ids.map(getProgress).filter((p): p is StudentProgress => !!p && inTerm(p));
  const waitingOn = (p: StudentProgress, id: number) => p.steps.find((s) => s.id === id)?.status === 'in_review';
  const shared = sharedStudentIds();
  const helpOpen = openHelpStudentIds();
  const groups: Record<Tab, StudentProgress[]> = {
    units: all.filter((p) => waitingOn(p, 7)),
    // Prerequisites: the counselor's queue. Classes all on hold wait on the student instead.
    prereq: all.filter((p) => waitingOn(p, 8) && !p.steps.find((s) => s.id === 8)?.hold),
    prereqwait: all.filter((p) => waitingOn(p, 8) && !!p.steps.find((s) => s.id === 8)?.hold),
    young: all.filter((p) => waitingOn(p, 10)),
    homeschool: all.filter((p) => waitingOn(p, 11)),
    help: all.filter((p) => helpOpen.has(p.student.id)),
    overdue: all.filter((p) => !!p.steps.find((s) => s.id === 5)?.overdue),
    school: all.filter((p) => !!openSchoolChange(p.student.id)),
    idreq: all.filter((p) => !!openIdChange(p.student.id)),
    ids: all.filter((p) => !!p.student.student_number && shared.has(p.student.student_number)),
    all,
  };
  const tab: Tab = (['help', 'overdue', 'prereq', 'prereqwait', 'young', 'homeschool', 'school', 'idreq', 'ids', 'all'] as const).find((t) => t === sp.tab) ?? 'units';
  const q = (sp.q ?? '').trim().toLowerCase();
  // The admin's primary schools go to the top of their to-do.
  const primary = new Set(primarySchoolIds(me.id));
  const isMine = (p: StudentProgress) => primary.has(p.school.id);
  // Nudged prerequisite reviews go to the very top of the Prerequisites queue.
  const nudges = openNudges();
  const nudged = (p: StudentProgress) => tab === 'prereq' && nudges.has(p.student.id);
  const rows = groups[tab]
    .filter((p) => !q || `${p.student.first_name} ${p.student.last_name} ${p.student.student_number ?? ''}`.toLowerCase().includes(q))
    .sort((a, b) => tab === 'ids'
      // Shared IDs: keep accounts with the same ID next to each other.
      ? (a.student.student_number ?? '').localeCompare(b.student.student_number ?? '') || a.student.last_name.localeCompare(b.student.last_name)
      : Number(nudged(b)) - Number(nudged(a)) || Number(isMine(b)) - Number(isMine(a)));
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
    if (mine) u.set('school', 'mine'); else if (schoolId) u.set('school', String(schoolId));
    if (termId) u.set('term', String(termId));
    if (sp.q) u.set('q', sp.q);
    if (o.student) u.set('student', String(o.student));
    const s = u.toString();
    return '/admin/students' + (s ? '?' + s : '');
  };
  // Prerequisite tabs: show the prerequisite review's own state (it runs alongside College review, so it may not be "next").
  const prereqCol = (p: StudentProgress) => {
    if (tab !== 'prereq' && tab !== 'prereqwait') return null;
    const s8 = p.steps.find((s) => s.id === 8);
    return s8 ? `${pad(s8.num)} ${s8.hold ? HOLD_LABEL[s8.hold] : s8.short}` : null;
  };
  const keep = { tab: tab === 'units' ? '' : tab, school: mine ? 'mine' : schoolId ? String(schoolId) : '', term: termId ? String(termId) : '', q: sp.q ?? '' };

  return (
    <AdminShell me={me} current="students">
      <div className="admin-head pad-sm">
        <div><div className="kicker accent700">{me.admin_level === 'super' ? 'Super admin' : 'College admin'}</div><h1>Students</h1></div>
        <form action="/admin/students" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {tab !== 'units' && <input type="hidden" name="tab" value={tab} />}
          <select name="school" className="input" defaultValue={mine ? 'mine' : schoolId || ''} style={{ width: 200 }}>
            <option value="">All schools</option>
            {myIds.length > 0 && <option value="mine">My schools ({myIds.length})</option>}
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
      {sp.done === 'approver_link' && sp.link && (
        <div className="flash" role="status">{sp.emailed === '1' ? 'Emailed the approver a new link. ' : 'Email isn’t set up, so send the approver this link: '}<code style={{ wordBreak: 'break-all' }}>{sp.link}</code></div>
      )}
      <Flash msg={sp.done === 'approver_link' ? null : sp.done === 'hs_already'
        ? `These requests were already approved by the high school${sp.classes ? `: ${sp.classes}` : ''}. Approvals stay with each class, so High school approval can't be moved back. To change a class, remove it or move it to another term; the new request goes back to the high school.`
        : sp.done ? DONE[sp.done] : null} />
      <Flash error msg={sp.error ? ERR[sp.error] : null} />
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: '2px solid var(--color-text)' }}>
        <Stat label={primary.size ? `College review · ${groups.units.filter(isMine).length} at your schools` : 'College review · waiting on you'} value={String(groups.units.length)} hero />
        <Stat label="Prerequisite review" value={String(groups.prereq.length)} />
        <Stat label="Waiting on parent" value={String(waitingParent)} />
        <Stat label={`Next registration · ${term.name}`} value={fmt(term.registration_opens)} last />
      </div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 420px', flex: 1 }}>
        <div className="pad-sm noborder-sm" style={{ padding: '24px 32px 40px', borderRight: '2px solid var(--color-text)', minWidth: 0 }}>
          <div className="seg seg-wrap" style={{ marginBottom: 14 }}>
            {(groups.help.length > 0 || tab === 'help') && (
              <Link className="seg-opt" href={href({ tab: 'help' })} aria-current={tab === 'help'}>Help · {groups.help.length}</Link>
            )}
            {(groups.overdue.length > 0 || tab === 'overdue') && (
              <Link className="seg-opt" href={href({ tab: 'overdue' })} aria-current={tab === 'overdue'}>Overdue registration · {groups.overdue.length}</Link>
            )}
            <Link className="seg-opt" href={href({ tab: 'units' })} aria-current={tab === 'units'}>College review · {groups.units.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'prereq' })} aria-current={tab === 'prereq'}>Prerequisites · {groups.prereq.length}</Link>
            {(groups.prereqwait.length > 0 || tab === 'prereqwait') && (
              <Link className="seg-opt" href={href({ tab: 'prereqwait' })} aria-current={tab === 'prereqwait'}>Prerequisites · waiting on student · {groups.prereqwait.length}</Link>
            )}
            {(groups.young.length > 0 || tab === 'young') && (
              <Link className="seg-opt" href={href({ tab: 'young' })} aria-current={tab === 'young'}>Young students · {groups.young.length}</Link>
            )}
            {(groups.homeschool.length > 0 || tab === 'homeschool') && (
              <Link className="seg-opt" href={href({ tab: 'homeschool' })} aria-current={tab === 'homeschool'}>Homeschool · {groups.homeschool.length}</Link>
            )}
            <Link className="seg-opt" href={href({ tab: 'school' })} aria-current={tab === 'school'}>School changes · {groups.school.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'idreq' })} aria-current={tab === 'idreq'}>ID changes · {groups.idreq.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'ids' })} aria-current={tab === 'ids'}>Shared IDs · {groups.ids.length}</Link>
            <Link className="seg-opt" href={href({ tab: 'all' })} aria-current={tab === 'all'}>All students · {groups.all.length}</Link>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%' }}>
              <thead>{tab === 'ids'
                ? <tr><th>Student</th><th>School</th><th>Email</th><th>Step</th><th>Class of</th></tr>
                : <tr><th>Student</th><th>School</th><th>Courses</th><th>Step</th><th>Waiting</th></tr>}</thead>
              <tbody>
                {rows.map((p, i) => {
                  const link = href({ student: p.student.id });
                  const sid = p.student.student_number ?? '';
                  const firstOfId = tab === 'ids' && (i === 0 || rows[i - 1].student.student_number !== sid);
                  const lastOfId = tab === 'ids' && (i === rows.length - 1 || rows[i + 1].student.student_number !== sid);
                  // A red bracket on the left groups accounts that share a Shasta College ID.
                  const bracket: React.CSSProperties | undefined = tab === 'ids' ? {
                    boxShadow: 'inset 4px 0 0 #b3261e', paddingLeft: 14,
                    ...(firstOfId ? { backgroundImage: 'linear-gradient(#b3261e, #b3261e)', backgroundSize: '14px 3px', backgroundRepeat: 'no-repeat', backgroundPosition: 'left top' } : {}),
                    ...(lastOfId ? { backgroundImage: `${firstOfId ? 'linear-gradient(#b3261e, #b3261e), ' : ''}linear-gradient(#b3261e, #b3261e)`, backgroundSize: firstOfId ? '14px 3px, 14px 3px' : '14px 3px', backgroundRepeat: 'no-repeat', backgroundPosition: firstOfId ? 'left top, left bottom' : 'left bottom' } : {}),
                  } : undefined;
                  if (tab === 'ids') {
                    return [firstOfId ? <tr key={`g${sid}`}><td colSpan={5} className="kicker-sm" style={{ paddingTop: i === 0 ? 8 : 18, color: '#b3261e' }}>Shasta College ID {sid} · {rows.filter((x) => x.student.student_number === sid).length} accounts</td></tr> : null,
                      <tr key={p.student.id} data-shared-id={sid} className={sel?.student.id === p.student.id ? 'sel' : undefined}>
                        <td style={bracket}><Link className="rowa" href={link}><strong>{p.student.first_name} {p.student.last_name}</strong></Link></td>
                        <td><Link className="rowa" href={link}>{p.school.name.replace(' High School', ' HS')}</Link></td>
                        <td><Link className="rowa" href={link}>{p.student.email}</Link></td>
                        <td><Link className="rowa" href={link} style={p.next?.overdue ? { color: '#b3261e', fontWeight: 700 } : undefined}>{stepOnLabel(p)}</Link></td>
                        <td><Link className="rowa" href={link}>{p.student.grad_year ?? '—'}</Link></td>
                      </tr>];
                  }
                  const header = primary.size > 0 && !nudged(p) && (i === 0 || isMine(rows[i - 1]) !== isMine(p) || nudged(rows[i - 1]))
                    ? <tr key={`h${i}`}><td colSpan={5} className="kicker-sm" style={{ paddingTop: i === 0 ? 8 : 20, color: isMine(p) ? 'var(--color-accent-700)' : 'var(--ink-60)' }}>{isMine(p) ? `Your schools · ${mineCount}` : `Other schools · ${rows.length - mineCount}`}</td></tr>
                    : nudged(p) && i === 0 ? <tr key="hn"><td colSpan={5} className="kicker-sm" style={{ paddingTop: 8, color: '#b3261e' }}>Nudged · prioritize · {rows.filter(nudged).length}</td></tr>
                    : null;
                  return [header,
                    <tr key={p.student.id} data-nudged={nudged(p) ? '1' : undefined} className={sel?.student.id === p.student.id ? 'sel' : undefined}
                      style={nudged(p) ? { background: '#fdecea', boxShadow: 'inset 4px 0 0 #b3261e' } : undefined}>
                      <td><Link className="rowa" href={link}><strong>{p.student.first_name} {p.student.last_name}</strong>
                        {nudged(p) && <span className="tag" style={{ marginLeft: 6, background: '#b3261e', color: '#fff' }} title={`Nudged by ${nudges.get(p.student.id)!.by_name ?? 'an admin'}`}>Nudged</span>}
                        {isYoung(p.student) && <span className="tag" style={{ marginLeft: 6, background: '#e8f0fb', color: '#1d3f6e' }} title="8th grade or below">Young student</span>}
                        {p.student.student_number && shared.has(p.student.student_number) && <span className="tag" style={{ marginLeft: 6, background: '#fdecea', color: '#6b1a12' }}>Shared ID</span>}
                      </Link></td>
                      <td><Link className="rowa" href={link}>{p.school.name.replace(' High School', ' HS')}</Link></td>
                      <td><Link className="rowa" href={link}>{p.courses.map((c) => c.code).join(', ') || '—'}</Link></td>
                      <td><Link className="rowa" href={link} style={p.next?.overdue ? { color: '#b3261e', fontWeight: 700 } : undefined}>{prereqCol(p) ?? stepOnLabel(p)}</Link></td>
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
  const nudge = s8?.status === 'in_review' ? openNudges().get(p.student.id) ?? null : null;
  // Marking a step complete while prerequisite review is still open skips the college counselor's review: warn first.
  const prereqOpen = !!s8 && s8.status !== 'complete';
  const prereqClasses = p.courses.filter((c) => c.needs_prereq && c.prereq_status !== 'approved').map((c) => `${c.code} (${c.term_name ?? 'no term'})`).join(', ');
  const completeMessage = (s: { id: number; num: number; short: string }) => {
    const base = `Mark “${s.short}” complete for ${p.student.first_name}?`;
    if (!prereqOpen || s.num < s8!.num) return base;
    return `⚠ Prerequisite review isn’t done.\n\n${prereqClasses || 'A requested class'} ${prereqClasses.includes(',') ? 'have' : 'has'} a prerequisite that a college counselor hasn’t reviewed yet. ${s.id === 8 ? 'Marking Prerequisite review complete approves these classes without that review.' : `Marking “${s.short}” complete moves ${p.student.first_name} past it.`}\n\nDo it anyway?`;
  };
  const s9 = p.steps.find((s) => s.id === 9);
  const maxTerms = maxUnitTerms(p.student.id);
  const s10 = p.steps.find((s) => s.id === 10);
  const s11 = p.steps.find((s) => s.id === 11);
  const aff = s11?.status === 'in_review' ? latestAffidavit(p.student.id) : null;
  const helpList = helpRequests(p.student.id);
  const rec = s10?.status === 'in_review' ? youngRecommendation(p.student.id) : null;
  const recBy = rec ? (db().prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(rec.rec_by) as { first_name: string; last_name: string } | undefined) : undefined;
  const offered = schoolCourses(p.school.id);
  const consent = p.steps.find((s) => s.id === 3);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div className="pad-sm" style={{ padding: '24px 32px', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker accent700">{p.next ? `Step ${stepOnLabel(p).replace(' ', ' · ')}` : 'All steps done'}</div>
        <div style={{ fontSize: 28, fontWeight: 800, marginTop: 6 }}>{p.student.first_name} {p.student.last_name}{isYoung(p.student) && <span className="tag" style={{ marginLeft: 6, background: '#e8f0fb', color: '#1d3f6e' }} title="8th grade or below">Young student</span>}</div>
        <div style={{ fontSize: 14, marginTop: 2 }}>{p.termLabel} · {p.school.name} · {classLabel(p.student)} · ID {p.student.student_number ?? '—'}</div>
        <StudentContact s={p.student} approver />
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
          <div className="kicker accent700">College review &amp; clear units</div>
          <TermCourses courses={p.courses} terms={p.requestTerms} designation={p.school.designation} compact />
          {p.school.designation === 'CCAP' && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
              <input type="checkbox" name="max_units" style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--color-accent)' }} />
              <span>Cleared for the maximum units for {p.requestTerms.map((t) => t.name).join(' and ') || 'this term'}. Classes added later in {p.requestTerms.length > 1 ? 'these terms' : 'this term'} won't come back to College review. <span className="ink60">(Staff only; not shown to the student.)</span></span>
            </label>
          )}
          <div className="kicker-sm" style={{ marginTop: 4 }}>Verify in Colleague</div>
          <div className="field">
            <label htmlFor="cr_sid">Shasta College ID (update it if it&apos;s wrong)</label>
            <input id="cr_sid" name="student_number" className="input" required pattern="[A-Za-z0-9\-]{4,20}" defaultValue={p.student.student_number ?? ''} placeholder="No ID on file" style={{ maxWidth: 260 }} />
          </div>
          {([['v_sacp', 'Program in SACP'], ['v_rgpe', 'Start date in RGPE'], ['v_stal', 'Cohort in STAL']] as const).map(([name, label]) => (
            <label key={name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" name={name} required style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
              <span><strong>{label}</strong> <span className="ink60">(in Colleague)</span></span>
            </label>
          ))}
          <div className="field"><label htmlFor="n7">Note to student (required to send back)</label><textarea id="n7" name="note" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} /></div>
          <button formAction={clearUnits} className="btn btn-primary" style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>All verified &amp; units cleared in Colleague <span>→</span></button>
          <button formAction={sendBackToStudent} formNoValidate className="btn btn-secondary" style={{ justifyContent: 'flex-start' }}>Send back to student</button>
        </form>
      )}

      {s8?.status === 'in_review' && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <input type="hidden" name="stepId" value={8} />
          <div className="kicker accent700">Prerequisite review</div>
          {!me.is_college_counselor && <div style={{ fontSize: 13 }}>Only admins designated as college counselors can approve or decline these.</div>}
          {p.courses.filter((c) => c.needs_prereq && c.prereq_status !== 'approved').map((c) => (
            <div key={`${c.id}-${c.term_id}`} data-prereq={`${c.code} ${c.term_name ?? ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8, borderBottom: '1px solid var(--color-divider)' }}>
              <div style={{ fontSize: 14 }}><strong>{c.code}</strong> · {c.title} <span className="ink60">· {c.term_name ?? 'No term'}</span></div>
              <div className="ink60" style={{ fontSize: 13 }}>Prerequisite: {c.prerequisite ?? 'flagged for review (the student hadn’t marked one)'}</div>
              {c.prereq_hold && (
                <div style={{ fontSize: 13, background: '#fff4e0', color: '#6b3a00', padding: '6px 10px' }} data-held={c.prereq_hold}>
                  <strong>On hold: {HOLD_LABEL[c.prereq_hold].replace('Prerequisite: ', '')}</strong> since {fmt(c.prereq_hold_at)}{c.prereq_hold_note ? <> · “{c.prereq_hold_note}”</> : ''}
                </div>
              )}
              {c.prereq_reply && <div style={{ fontSize: 13, borderLeft: '3px solid var(--color-accent)', paddingLeft: 8 }} data-reply>Student replied {fmt(c.prereq_reply_at)}: “{c.prereq_reply}”</div>}
              <div className="seg seg-modes seg-wrap" role="radiogroup" aria-label={`${c.code} ${c.term_name ?? ''} decision`} style={{ alignSelf: 'flex-start' }}>
                <label className="seg-opt" data-v="required"><input type="radio" name={`course_${c.id}_${c.term_id ?? 0}`} value="approve" disabled={!me.is_college_counselor} />Approve</label>
                <label className="seg-opt" data-v="off"><input type="radio" name={`course_${c.id}_${c.term_id ?? 0}`} value="decline" disabled={!me.is_college_counselor} />Decline</label>
                <label className="seg-opt" data-v="optional"><input type="radio" name={`course_${c.id}_${c.term_id ?? 0}`} value="info" disabled={!me.is_college_counselor} />More info needed</label>
                <label className="seg-opt" data-v="optional"><input type="radio" name={`course_${c.id}_${c.term_id ?? 0}`} value="appointment" disabled={!me.is_college_counselor} />Appointment required</label>
              </div>
              {c.prereq_hold && <div className="ink60" style={{ fontSize: 12 }}>Leave all four unchecked to keep it on hold.</div>}
            </div>
          ))}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 700 }}>
            <input type="checkbox" name="ncws" disabled={!me.is_college_counselor} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} />
            Student cleared in NCWS <span className="ink60" style={{ fontWeight: 400 }}>(required to approve)</span>
          </label>
          <div className="field"><label htmlFor="n8">Note to student (required if you decline or need more information)</label><textarea id="n8" name="note" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} disabled={!me.is_college_counselor} /></div>
          <button formAction={decidePrerequisites} className="btn btn-primary" disabled={!me.is_college_counselor} style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>Save decisions <span>→</span></button>
        </form>
      )}

      {s8?.status === 'in_review' && (
        <form className="pad-sm" style={{ ...section, background: nudge ? '#fdecea' : undefined }}>
          <Hidden p={p} keep={keep} />
          <div className="kicker" style={{ color: '#b3261e' }}>{nudge ? 'Nudged' : 'Nudge college counselors'}</div>
          {nudge ? (
            <div style={{ fontSize: 14 }}>
              Nudged by {nudge.by_name ?? 'an admin'} on {fmt(nudge.created_at)}{nudge.note ? <>: “{nudge.note}”</> : '.'} The student is at the top of the Prerequisites queue until a counselor decides.
            </div>
          ) : (
            <div style={{ fontSize: 14 }}>Ask college counselors to prioritize this review. They&apos;re notified, and the student goes to the top of their Prerequisites queue, highlighted red.</div>
          )}
          <input name="note" className="input" maxLength={300} placeholder="Why it's urgent (optional)" aria-label="Why it's urgent" />
          <button formAction={nudgePrerequisite} className="btn btn-secondary" style={{ alignSelf: 'flex-start', color: '#b3261e', borderColor: '#b3261e' }}>{nudge ? 'Nudge again' : 'Nudge'}</button>
        </form>
      )}

      {p.courses.filter((c) => c.prereq_hold && c.prereq_status !== 'approved').map((c) => (
        <form key={`hold-${c.id}-${c.term_id}`} className="pad-sm" style={{ ...section, background: '#fff4e0', paddingTop: 12, paddingBottom: 12 }}>
          <Hidden p={p} keep={keep} />
          <input type="hidden" name="courseId" value={c.id} />
          <input type="hidden" name="fromTermId" value={c.term_id ?? ''} />
          <div style={{ fontSize: 14 }}><strong>{c.code}</strong> ({c.term_name ?? 'no term'}) is waiting on the student: {HOLD_LABEL[c.prereq_hold!].replace('Prerequisite: ', '').toLowerCase()}.</div>
          <button formAction={releasePrereqHold} className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>{c.prereq_hold === 'appointment' ? 'Appointment done: back to queue' : 'Back to queue'}</button>
        </form>
      ))}

      <Transcripts p={p} keep={keep} />

      {helpList.filter((h) => h.status === 'open').map((h) => (
        <form key={h.id} className="pad-sm" style={{ ...section, background: '#fff4e0' }}>
          <Hidden p={p} keep={keep} />
          <input type="hidden" name="helpId" value={h.id} />
          <div className="kicker" style={{ color: '#8a4b00' }}>Needs help · {h.raised_role === 'student' ? 'from the student' : `flagged by ${h.by_name ?? 'high school staff'} (high school)`} · {fmt(h.created_at)}</div>
          <div style={{ fontSize: 15 }}>“{h.message}”</div>
          <div className="field"><label htmlFor={`reply${h.id}`}>Reply to the student (optional)</label><textarea id={`reply${h.id}`} name="reply" className="input" maxLength={1000} style={{ minHeight: 50, resize: 'none' }} /></div>
          <button formAction={resolveHelp} className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>Mark resolved</button>
        </form>
      ))}

      {s11?.status === 'in_review' && aff && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <div className="kicker accent700">Private School Affidavit · homeschooled</div>
          <div style={{ fontSize: 14 }}>
            Uploaded {fmt(aff.uploaded_at)}{aff.file_id ? <> · <a href={`/files/${aff.file_id}`} target="_blank" rel="noreferrer">Open the affidavit</a></> : ' · file no longer on file'}
          </div>
          <div className="seg seg-modes" role="radiogroup" aria-label="Affidavit decision" style={{ alignSelf: 'flex-start' }}>
            <label className="seg-opt" data-v="required"><input type="radio" name="decision" value="approve" />Approve</label>
            <label className="seg-opt" data-v="off"><input type="radio" name="decision" value="decline" />Decline</label>
          </div>
          <div className="field"><label htmlFor="n11">Note (required if you decline; the student and parent see it)</label><textarea id="n11" name="note" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} /></div>
          <button formAction={reviewAffidavit} className="btn btn-primary" style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>Save decision <span>→</span></button>
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

      {p.school.kind === 'other' && p.steps.find((x) => x.id === 4)?.status === 'in_review' && (
        <form className="pad-sm" style={{ ...section, background: 'var(--color-accent-100)' }}>
          <Hidden p={p} keep={keep} />
          <div className="kicker accent700">High school approval · unlisted school</div>
          <div style={{ fontSize: 14 }}>{p.school.name} isn&apos;t on the school list. {p.student.hs_approver_name} ({p.student.hs_approver_email ?? 'no email'}) approves by link.</div>
          <button formAction={adminSendApproverLink} className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>Send a new approval link</button>
        </form>
      )}
      <ArchivedRequests studentId={p.student.id} style={{ ...section, background: '#fdf6ec' }} />

      <div className="pad-sm" style={section}>
        <div className="kicker">Steps · move forward or back</div>
        {maxTerms.length > 0 && <div style={{ fontSize: 13 }}>Cleared for maximum units: <strong>{maxTerms.join(', ')}</strong>{p.school.designation !== 'CCAP' ? ' (not used: no longer at a CCAP school)' : ''}. Moving College review back removes this.</div>}
        {p.steps.map((s) => (
          <form key={s.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <Hidden p={p} keep={keep} />
            <input type="hidden" name="stepId" value={s.id} />
            <span style={{ fontWeight: 800, color: s.status === 'complete' ? 'var(--color-accent)' : 'var(--ink-35)' }}>{pad(s.num)}</span>
            <span>
              {s.short}
              <span className="ink60" style={{ fontSize: 12 }}> · {s.status === 'complete' ? `✓ ${fmt(s.completedAt)}` : stepStatusLabel(s)}</span>
            </span>
            {s.status === 'complete' ? (
              <ConfirmButton formAction={adminReopenStep} message={s.id === 3 ? `Remove ${p.student.first_name}'s parent consent? Consent is one-time, so only do this if the parent revoked it.` : `Reopen “${s.short}” and every step after it? (Parent consent stays on file.)`} style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>
                Move back
              </ConfirmButton>
            ) : (
              <ConfirmButton formAction={adminCompleteStep} message={completeMessage(s)} style={{ color: prereqOpen && s.num >= (s8?.num ?? 99) ? '#b3261e' : 'var(--color-accent-700)', fontSize: 13 }}>
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
            <input type="hidden" name="flag" value={c.prereq_flag ? 'off' : 'on'} />
            <span><strong>{c.code}</strong> · {c.units} units
              <span style={{ display: 'block', fontSize: 12 }} className={c.needs_prereq ? undefined : 'ink60'}>
                {c.needs_prereq
                  ? <>Prerequisite review: {c.prereq_status === 'approved' ? <span style={{ color: 'var(--color-accent-700)' }}>approved</span> : <strong style={{ color: '#8a4b00' }}>waiting</strong>}{c.prereq_flag ? ' (flagged)' : ''}</>
                  : <>No prerequisite selected</>}
                {!c.prerequisite && (
                  <button formAction={adminFlagPrereq} className="btn btn-ghost" style={{ fontSize: 12, padding: '0 6px', color: c.prereq_flag ? 'var(--ink-60)' : '#8a4b00' }}>
                    {c.prereq_flag ? 'Remove flag' : 'Needs prerequisite review'}
                  </button>
                )}
              </span>
            </span>
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
              <option value="" disabled>Request a listed class…</option>
              {offered.map((c) => <option key={c.id} value={c.id}>{c.kind === 'de' ? 'DE' : 'CE'} · {c.code} · {c.title} ({c.units})</option>)}
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

      <History studentId={p.student.id} />

      {me.admin_level === 'super' && (
        <div className="pad-sm" style={{ padding: '16px 32px 0', fontSize: 14 }}><a href={`/admin/audit.pdf?student=${p.student.id}`}>Download audit PDF (consent + course requests)</a></div>
      )}
      {consent?.status === 'complete' && (
        <div className="pad-sm" style={{ padding: '16px 32px', fontSize: 14 }}><a href={`/consent/${p.student.id}`} target="_blank" rel="noreferrer">View parent consent</a></div>
      )}
    </div>
  );
}

/** Transcripts on file (for prerequisite review), newest first, and uploading one for the student. */
function Transcripts({ p, keep }: { p: StudentProgress; keep: Record<string, string> }) {
  const files = transcriptsFor(p.student.id);
  // "New" = added since the last prerequisite decision.
  const lastDecision = p.courses.map((c) => c.prereq_at ?? '').sort().at(-1) ?? '';
  return (
    <form className="pad-sm" style={section} data-transcripts>
      <Hidden p={p} keep={keep} />
      <div className="kicker">Transcripts · {files.length}</div>
      {files.length === 0 && <div className="ink60" style={{ fontSize: 13 }}>None on file.</div>}
      {files.map((f) => (
        <div key={f.id} style={{ fontSize: 14 }}>
          <a href={`/files/${f.id}`} target="_blank" rel="noreferrer">{f.filename}</a>
          {f.created_at > lastDecision && <span className="tag" style={{ marginLeft: 6, background: 'var(--color-accent)', color: '#fff' }}>New</span>}
          <span className="ink60" style={{ fontSize: 12 }}> · {fmt(f.created_at)} · {f.by_name ?? 'unknown'} ({f.by_role === 'student' ? 'student' : f.by_role === 'counselor' ? 'high school' : 'Shasta College'})</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input name="transcript" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required className="input" aria-label="Transcript file" style={{ flex: '1 1 200px', minWidth: 0 }} />
        <button formAction={adminUploadTranscript} className="btn btn-secondary">Upload for student</button>
      </div>
    </form>
  );
}

/** Who did what, when: per term (newest first), then account-wide events. */
function History({ studentId }: { studentId: number }) {
  const groups = studentHistory(studentId);
  return (
    <div className="pad-sm" style={section} data-history>
      <div className="kicker">History</div>
      {groups.length === 0 && <div className="ink60" style={{ fontSize: 13 }}>Nothing recorded yet.</div>}
      {groups.map((g, i) => (
        <details key={g.termId ?? 'none'} open={i === 0} data-history-term={g.termName}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>{g.termName} · {g.events.length}</summary>
          <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.events.map((e) => (
              <li key={e.id} style={{ fontSize: 13, borderLeft: '3px solid var(--color-divider)', paddingLeft: 10 }}>
                <div><strong>{e.action}</strong></div>
                <div className="ink60">{fmt(e.at, 'mdy')} {fmt(e.at, 'time')} · {e.actor_name} ({e.actor_role})</div>
                {e.detail && <div style={{ whiteSpace: 'pre-wrap' }}>{e.detail}</div>}
              </li>
            ))}
          </ol>
        </details>
      ))}
    </div>
  );
}
