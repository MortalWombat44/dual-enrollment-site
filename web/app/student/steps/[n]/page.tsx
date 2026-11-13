import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { activeTerms, archivedRequests, latestAffidavit, CE_DEFAULT_TITLE, displayName, fmt, getProgress, pad, schoolCourses, type StudentProgress, type StudentStep } from '@/lib/workflow';
import { TermCourses } from '@/components/TermCourses';
import { completionCopy, stepTag } from '@/lib/stepcopy';
import { addMoreClasses, addStudentId, studentAnswerHold, studentUploadTranscript, studentRequestPrereq, submitAffidavit, reopenCourseSelection, submitYoungDocs, submitCccapply, submitCourses, confirmRegistered, finishTextbooks } from '@/lib/student-actions';
import { StudentIdForm } from '@/components/StudentIdForm';
import { unitLimit } from '@/lib/constants';
import { CoursePicker } from '@/components/CoursePicker';
import { HelpBox } from '@/components/HelpBox';
import { AffidavitUpload } from '@/components/AffidavitUpload';
import { AFFIDAVIT_ERRORS } from '@/lib/affidavit';
import { studentSendApproverLink } from '@/lib/approver-actions';
import { PacketTable } from '@/components/PacketTable';
import { ParentInvite } from '@/components/ParentInvite';
import { logout } from '@/lib/session-actions';
import { HOLD_LABEL } from '@/lib/workflow';
import { TRANSCRIPT_ERRORS, transcriptsFor } from '@/lib/transcripts';
import { COUNSELING_APPOINTMENT_URL } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  id: 'Enter your Shasta College ID (letters, numbers and dashes), or check the box to skip for now.',
  none: 'Pick at least one course.',
  term: 'Pick an open term for every class.',
  aff_file: AFFIDAVIT_ERRORS.file, aff_size: AFFIDAVIT_ERRORS.size, aff_type: AFFIDAVIT_ERRORS.type,
  docs: 'Attach both documents (PDF, JPG or PNG, up to 10 MB each).',
  ce: 'Each concurrent class needs a course code (like PSYC C1000) and units (for example 3 or 4).',
  tr_file: TRANSCRIPT_ERRORS.file, tr_size: TRANSCRIPT_ERRORS.size, tr_type: TRANSCRIPT_ERRORS.type,
  reply: 'Write a message or attach a transcript.',
};

export default async function StepPage({ params, searchParams }: { params: Promise<{ n: string }>; searchParams: Promise<{ error?: string; invited?: string; invite_error?: string; added?: string; approver_link?: string; emailed?: string; help?: string; prereq?: string; sent?: string }> }) {
  const me = await requireRole('student');
  const { n } = await params;
  const { error, invited, invite_error, added, approver_link, emailed, help, prereq, sent } = await searchParams;
  const p = getProgress(me.id);
  const s = p?.steps.find((x) => x.id === Number(n));
  if (!p || !s) notFound();
  const next = p.steps.find((x) => x.num > s.num && x.status !== 'complete') ?? null;

  return (
    <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', minHeight: '100vh', maxWidth: 1280, margin: '0 auto', boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
      <Sidebar p={p} current={s.id} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {s.status === 'complete' ? <CompleteView p={p} s={s} error={error ? ERRORS[error] : undefined} added={added} prereq={prereq} /> : <OpenView p={p} s={s} error={error ? ERRORS[error] : undefined} invited={Number(invited) || undefined} inviteError={invite_error} approverLink={approver_link} emailed={emailed === '1'} sent={sent} />}
        <HelpBox studentId={p.student.id} back={`/student/steps/${s.id}`} status={help} />
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

function CompleteView({ p, s, error, added, prereq }: { p: StudentProgress; s: StudentStep; error?: string; added?: string; prereq?: string }) {
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
  } else if (s.id === 4 || s.id === 7 || s.id === 8 || s.id === 10) {
    cells = [
      s.id === 4 ? ['Approved by', 'Your high school', `${p.school.name} · ${fmt(s.completedAt)}`]
        : [s.id === 7 ? 'Cleared by' : 'Approved by', s.id === 8 ? 'College counselor' : 'Shasta College', fmt(s.completedAt)],
      ['Note', d.note ? `“${String(d.note)}”` : '—', ''],
      ['Units approved', String(units), p.termLabel],
    ];
  } else {
    cells = [
      ['Completed on', fmt(s.completedAt, 'mdy'), fmt(s.completedAt, 'time')],
      [s.id === 1 ? 'Shasta College ID' : s.id === 2 ? 'Courses' : 'Term', s.id === 1 ? (p.student.student_number ?? 'Not added yet') : s.id === 2 ? p.courses.map((c) => c.code).join(', ') : p.termLabel, s.id === 2 ? `${units} units` : ''],
      ['School', p.school.name, p.school.designation === 'CCAP' ? 'CCAP partner' : 'Special admit'],
    ];
  }
  return (
    <>
      <Hero num={s.num} filled tag={<span className="tag tag-accent">Step complete</span>} title={copy.title} body={copy.body} />
      {s.id === 1 && !p.student.student_number && (
        <div className="pad-sm" style={{ padding: '24px 48px', borderBottom: '2px solid var(--color-divider)', background: '#fff4e0', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: '#8a4b00' }}>Add your Shasta College ID</div>
          <div style={{ fontSize: 14, color: '#8a4b00' }}>You skipped this earlier. You'll keep coming back here each time you sign in until it's added.</div>
          <StudentIdForm action={addStudentId} initial="" allowSkip={false} submitLabel="Save my ID" />
        </div>
      )}
      <Cells cells={cells} />
      {s.id === 2 && <MoreClasses p={p} error={error} added={added} prereq={prereq} />}
      <div className="pad-sm" style={{ padding: '32px 48px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h4 style={{ margin: 0, fontSize: 15 }}>Included in your packet</h4>
        <PacketTable p={p} />
      </div>
    </>
  );
}

/** Requests closed because registration for their term was turned off (shown while that term stays closed). */
function ArchivedNotice({ studentId }: { studentId: number }) {
  const openNames = new Set(activeTerms().map((t) => t.name));
  const archived = archivedRequests(studentId).filter((r) => !openNames.has(r.term_name ?? ''));
  if (!archived.length) return null;
  return (
    <div style={{ fontSize: 14, borderLeft: '4px solid #d08a00', background: '#fff4e0', color: '#8a4b00', padding: '10px 14px' }}>
      Registration was turned off for {[...new Set(archived.map((r) => r.term_name))].join(' and ')}, so {archived.length === 1 ? 'this request was' : 'these requests were'} closed: {archived.map((r) => r.code).join(', ')}. You can request classes in an open term.
    </div>
  );
}

/** After the first course selection: request more classes any time (even while others are in review), or change them. */
function MoreClasses({ p, error, added, prereq }: { p: StudentProgress; error?: string; added?: string; prereq?: string }) {
  const noPrereq = p.courses.filter((c) => !c.needs_prereq);
  const terms = activeTerms();
  const base: Record<number, number> = {};
  for (const c of p.courses) if (c.term_id) base[c.term_id] = (base[c.term_id] ?? 0) + c.units;
  return (
    <div id="more" className="pad-sm" style={{ padding: '28px 48px 0', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 820 }}>
      {added && <div className="flash" role="status">{Number(added) === 0 ? 'Those classes were already on your request.' : `Requested ${added} more class${added === '1' ? '' : 'es'}. ${p.school.designation === 'CCAP' ? 'Shasta College reviews them next.' : 'Your high school reviews them next.'}`}</div>}
      {error && <div className="flash flash-err">{error}</div>}
      <ArchivedNotice studentId={p.student.id} />
      <h3 style={{ margin: 0, fontSize: 20 }}>Request more classes</h3>
      <div className="ink60" style={{ fontSize: 14 }}>You can add classes any time, even while others are being reviewed. Classes you already requested stay as they are.</div>
      <form action={addMoreClasses} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <CoursePicker
          courses={schoolCourses(p.school.id)}
          initial={[]}
          initialCe={[]}
          baseUnits={base}
          terms={terms.map((t) => ({ id: t.id, name: t.name, opens: fmt(t.registration_opens, 'mdy'), limit: unitLimit(p.school.designation, t.summer === 1) }))}
          ccap={p.school.designation === 'CCAP'}
          schoolName={p.school.name}
        />
        <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Request these classes <span>→</span></button></div>
      </form>
      {prereq === 'sent' && <div className="flash" role="status">Sent to prerequisite review. A Shasta College counselor will check it.</div>}
      {noPrereq.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '2px solid var(--color-divider)', paddingTop: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Missed a prerequisite?</div>
          <div className="ink60" style={{ fontSize: 13 }}>If one of your classes has a prerequisite you didn&apos;t mark, send it to a Shasta College counselor for review.</div>
          {noPrereq.map((c) => (
            <form key={`${c.id}-${c.term_id}`} action={studentRequestPrereq} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 14 }}>
              <input type="hidden" name="courseId" value={c.id} />
              <input type="hidden" name="termId" value={c.term_id ?? ''} />
              <span><strong>{c.code}</strong> · {c.term_name}</span>
              <button className="btn btn-ghost" style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>This class has a prerequisite</button>
            </form>
          ))}
        </div>
      )}
      <form action={reopenCourseSelection} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderTop: '2px solid var(--color-divider)', paddingTop: 16 }}>
        <button className="btn btn-secondary">Change or remove classes</button>
        <span className="ink60" style={{ fontSize: 13 }}>Classes that are already approved stay approved. New or moved classes go through the reviews again.</span>
      </form>
    </div>
  );
}

function OpenView({ p, s, error, invited, inviteError, approverLink, emailed, sent }: { p: StudentProgress; s: StudentStep; error?: string; invited?: number; inviteError?: string; approverLink?: string; emailed?: boolean; sent?: string }) {
  const tag = stepTag(s)!;
  const counselor = 'Your high school'; // no staff names for students
  // Course selection only changes classes in terms that are open for registration; the rest are kept as they are.
  const openTermIds = new Set(activeTerms().map((t) => t.id));
  const openCourses = p.courses.filter((c) => c.term_id && openTermIds.has(c.term_id));
  const closedKept = p.courses.filter((c) => !c.term_id || !openTermIds.has(c.term_id));
  const prevReq = [...p.steps].reverse().find((x) => x.num < s.num && x.mode === 'required' && x.status !== 'complete');
  const live = s.status !== 'locked' && s.status !== 'scheduled';
  const body =
    s.status === 'locked' ? `Finish step ${pad(prevReq?.num ?? s.num - 1)}, ${prevReq?.short.toLowerCase() ?? 'the step before this one'}, first.` :
    s.status === 'scheduled' ? `You're ready to register. Registration for ${p.term.name} opens ${fmt(p.term.registration_opens, 'wmd')} at ${fmt(p.term.registration_opens, 'time')}.` :
    s.status === 'in_review' ? (
      s.id === 7 ? 'Shasta College is checking your courses and unit load. Usually 1–2 days.' :
      s.id === 8 && s.hold ? (s.hold === 'info' ? 'A Shasta College counselor needs more information before deciding. See what to send below.' : 'A Shasta College counselor needs to meet with you before deciding. See how below.') :
      s.id === 8 ? 'A Shasta College counselor is reviewing the classes you picked that have a prerequisite.' :
      s.id === 10 ? 'A Shasta College counselor is reviewing your documents, then Shasta College makes the final decision.' :
      s.id === 11 ? 'Shasta College is reviewing your Private School Affidavit.' :
      'Your high school is reviewing your classes. Check with your high school counselor if you have questions.') :
    s.status === 'waiting_parent' ? (
      p.parents.some((x) => x.status === 'active') ? `${displayName(p.parents.find((x) => x.status === 'active')!)} can sign online from their own account.` :
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 15, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <li><a href="https://www.shastacollege.edu/admissions-registration/apply-to-shasta-college/" target="_blank" rel="noreferrer">Go to CCCApply and apply to Shasta College</a>.</li>
              <li>Choose “Dual enrollment / special admit” as your enrollment status. <a href="https://launch.comevo.com/shastacollege/1633" target="_blank" rel="noreferrer">Follow the step-by-step guide</a>.</li>
              <li>Shasta College emails you your student ID. Enter it below.</li>
            </ol>
            <div className="ink60" style={{ fontSize: 13 }}>You only do this step once. It carries over to future terms.</div>
            <StudentIdForm action={submitCccapply} initial={p.student.student_number ?? ''} allowSkip submitLabel="Save my ID" />
          </div>
        )}
        {s.id === 2 && (s.status === 'current' || s.status === 'changes') && (
          <form action={submitCourses} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {p.changeNote && (
              <div style={{ borderLeft: '4px solid var(--color-accent)', background: 'var(--color-accent-100)', padding: '14px 18px' }}>
                <div className="kicker-sm accent700">Note from {p.changeBy === 'college' ? 'Shasta College' : counselor}</div>
                <div style={{ fontSize: 15, marginTop: 4 }}>“{p.changeNote}”</div>
              </div>
            )}
            <ArchivedNotice studentId={p.student.id} />
            {closedKept.length > 0 && (
              <div style={{ fontSize: 14, borderLeft: '4px solid var(--color-divider)', paddingLeft: 12 }}>
                <div style={{ fontWeight: 700 }}>Kept as they are</div>
                {closedKept.map((c) => <div key={`${c.id}-${c.term_id}`}>{c.code} · {c.term_name} <span className="ink60">(registration for this term is closed, so it can't be changed here)</span></div>)}
              </div>
            )}
            <CoursePicker
              courses={schoolCourses(p.school.id)}
              initial={openCourses.filter((c) => !c.custom).map((c) => ({ id: c.id, term_id: c.term_id }))}
              initialCe={openCourses.filter((c) => c.custom).map((c) => ({ code: c.code, title: c.title === CE_DEFAULT_TITLE ? '' : c.title, units: String(c.units), term: c.term_id ?? 0, prereq: !!c.prerequisite }))}
              terms={activeTerms().map((t) => ({ id: t.id, name: t.name, opens: fmt(t.registration_opens, 'mdy'), limit: unitLimit(p.school.designation, t.summer === 1) }))}
              ccap={p.school.designation === 'CCAP'}
              schoolName={p.school.name}
            />
            <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>{s.status === 'changes' ? 'Resubmit courses' : 'Submit courses'} <span>→</span></button></div>
          </form>
        )}
        {s.id === 4 && s.status === 'in_review' && p.school.kind === 'other' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '4px solid var(--color-accent)', paddingLeft: 16 }}>
            <div style={{ fontSize: 15 }}>
              Your approver at {p.school.name}: <strong>{p.student.hs_approver_name}</strong> ({p.student.hs_approver_email}). They approve your classes from a link, no account needed.
              {' '}<a href="/student/account">Change approver</a>
            </div>
            {approverLink && (
              <div style={{ fontSize: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>{emailed ? `We emailed ${p.student.hs_approver_email} this link. You can also send it yourself:` : `Send this link to ${p.student.hs_approver_name}:`}</span>
                <code style={{ wordBreak: 'break-all', background: 'var(--color-surface)', padding: '8px 10px' }}>{approverLink}</code>
              </div>
            )}
            <form action={studentSendApproverLink}><button className="btn btn-secondary">{approverLink ? 'Make a new link' : `Send approval link to ${p.student.hs_approver_name}`}</button></form>
          </div>
        )}
        {s.id === 8 && s.status === 'in_review' && <PrereqHolds p={p} sent={sent} />}
        {s.id === 11 && s.status === 'current' && (
          <AffidavitUpload action={submitAffidavit} declinedNote={latestAffidavit(p.student.id)?.status === 'declined' ? latestAffidavit(p.student.id)?.note : null} />
        )}
        {s.id === 9 && s.status === 'current' && (
          <form action={submitYoungDocs} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ margin: 0, fontSize: 15 }}>
              Students in 8th grade and below send two documents. A Shasta College counselor reviews them, then Shasta College makes the final decision.
            </p>
            <div className="field"><label htmlFor="transcript">A recent transcript or report card</label>
              <input id="transcript" name="transcript" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required className="input" /></div>
            <div className="field"><label htmlFor="letter">A letter from your principal saying how you'll benefit from {p.courses.length === 1 ? p.courses[0].code : 'these specific courses'}</label>
              <input id="letter" name="letter" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required className="input" /></div>
            <div className="ink60" style={{ fontSize: 13 }}>PDF, JPG or PNG, up to 10 MB each. The letter should name: {p.courses.map((c) => c.code).join(', ') || 'your classes'}.</div>
            <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Send documents <span>→</span></button></div>
          </form>
        )}
        {s.id === 3 && s.status !== 'complete' && <ParentInvite studentId={p.student.id} studentFirst={p.student.first_name} invited={invited} error={inviteError} />}
        {(s.status === 'in_review' || s.status === 'waiting_parent' || s.status === 'locked' || s.status === 'scheduled' || (s.id === 5 && s.status === 'current')) && p.courses.length > 0 && (
          <div>
            <div className="kicker-sm" style={{ paddingBottom: 8 }}>Your classes by term</div>
            <TermCourses courses={p.courses} terms={p.requestTerms} designation={p.school.designation} />
          </div>
        )}
        {s.id === 5 && p.registeredTermIds.length > 0 && s.status !== 'complete' && (
          <div style={{ fontSize: 14, color: 'var(--color-accent-700)', fontWeight: 700 }}>
            ✓ Registered for {p.requestTerms.filter((t) => p.registeredTermIds.includes(t.id)).map((t) => t.name).join(', ')}
          </div>
        )}
        {s.id === 5 && s.overdue && (
          <div style={{ fontSize: 15, borderLeft: '4px solid #b3261e', background: '#fdecea', color: '#6b1a12', padding: '12px 16px' }}>
            <strong>Your registration is overdue.</strong> Registration for {p.term.name} opened on {fmt(p.term.registration_opens, 'mdy')}. Register for your classes in myShasta now, then confirm it below. If something is stopping you, use &ldquo;I need help&rdquo; at the bottom of this page.
          </div>
        )}
        {s.id === 5 && s.status === 'current' && (
          <form action={confirmRegistered} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input type="hidden" name="termId" value={p.term.id} />
            <p style={{ margin: 0, fontSize: 15 }}>Register yourself in myShasta for your approved {p.term.name} sections: <strong>{p.courses.filter((c) => c.term_id === p.term.id).map((c) => c.code).join(', ')}</strong>. Once you're registered, confirm it here.</p>
            <div className="field" style={{ maxWidth: 360 }}><label htmlFor="crns">Section numbers (CRNs), optional</label><input id="crns" name="crns" className="input" placeholder="e.g. 40211, 40388" /></div>
            <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>I'm registered for {p.term.name} <span>→</span></button></div>
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


/** Prerequisite review: classes a counselor put on hold (with what to do), and sending a transcript. */
function PrereqHolds({ p, sent }: { p: StudentProgress; sent?: string }) {
  const held = p.courses.filter((c) => c.prereq_hold && c.prereq_status !== 'approved');
  const files = transcriptsFor(p.student.id);
  const accept = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {sent === 'info' && <div className="flash" role="status">Sent. Your prerequisite review is back with the counselor.</div>}
      {sent === 'appointment' && <div className="flash" role="status">Sent to the counselor. They&apos;ll decide after your appointment.</div>}
      {sent === 'transcript' && <div className="flash" role="status">Transcript sent to Shasta College.</div>}
      {held.map((c) => (
        <form key={`${c.id}-${c.term_id}`} action={studentAnswerHold} data-hold-form={c.code} style={{ display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '4px solid #d08a00', background: '#fff4e0', padding: '16px 20px' }}>
          <input type="hidden" name="courseId" value={c.id} />
          <input type="hidden" name="termId" value={c.term_id ?? ''} />
          <div className="kicker-sm" style={{ color: '#8a4b00' }}>{HOLD_LABEL[c.prereq_hold!]}</div>
          <div style={{ fontSize: 15 }}><strong>{c.code}</strong> · {c.title} · {c.term_name ?? 'No term'}</div>
          {c.prereq_hold_note && <div style={{ fontSize: 15 }}>Counselor&apos;s note: “{c.prereq_hold_note}”</div>}
          {c.prereq_hold === 'appointment' ? (
            <div style={{ fontSize: 15 }}>
              Make an appointment with a Shasta College counselor{COUNSELING_APPOINTMENT_URL ? <> (<a href={COUNSELING_APPOINTMENT_URL} target="_blank" rel="noreferrer">book it here</a>)</> : ' by contacting Shasta College Counseling'}.
              {' '}The counselor decides after you meet. You can let them know when your appointment is below.
            </div>
          ) : (
            <div style={{ fontSize: 15 }}>Send what the counselor asked for: a message, a transcript, or both. It goes back to the counselor right away.</div>
          )}
          {c.prereq_reply && <div className="ink60" style={{ fontSize: 13 }}>You wrote on {fmt(c.prereq_reply_at)}: “{c.prereq_reply}”</div>}
          <div className="field"><label htmlFor={`reply-${c.id}-${c.term_id}`}>{c.prereq_hold === 'appointment' ? 'Message to the counselor (for example, your appointment date)' : 'Message to the counselor'}</label>
            <textarea id={`reply-${c.id}-${c.term_id}`} name="reply" className="input" maxLength={1000} style={{ minHeight: 60, resize: 'none' }} /></div>
          <div className="field"><label htmlFor={`tr-${c.id}-${c.term_id}`}>Transcript (optional; PDF, JPG or PNG, up to 10 MB)</label>
            <input id={`tr-${c.id}-${c.term_id}`} name="transcript" type="file" accept={accept} className="input" /></div>
          <div><button className="btn btn-primary">Send to the counselor <span>→</span></button></div>
        </form>
      ))}
      <form action={studentUploadTranscript} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: held.length ? '2px solid var(--color-divider)' : undefined, paddingTop: held.length ? 16 : 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Transcripts</div>
        <div className="ink60" style={{ fontSize: 13 }}>A transcript helps the counselor check your prerequisites. Your high school or Shasta College may also add one for you.</div>
        {files.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
            {files.map((f) => <li key={f.id}><a href={`/files/${f.id}`} target="_blank" rel="noreferrer">{f.filename}</a> <span className="ink60">· added {fmt(f.created_at)}{f.by_role === 'student' ? '' : ' by staff'}</span></li>)}
          </ul>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input name="transcript" type="file" accept={accept} required className="input" aria-label="Transcript file" style={{ maxWidth: 360 }} />
          <button className="btn btn-secondary">Send transcript</button>
        </div>
      </form>
    </div>
  );
}
