import { studentForApproverLink } from '@/lib/approver-links';
import { approveByLink } from '@/lib/approver-actions';
import { classLabel, getProgress } from '@/lib/workflow';
import { ApproveSignForm } from '@/components/ApproveSignForm';
import { TermCourses } from '@/components/TermCourses';

export const dynamic = 'force-dynamic';

const ERR: Record<string, string> = {
  decide: 'Approve or decline every class.',
  note: 'Add a note so the student knows why a class was declined.',
  signature: 'Sign (drawn or typed) before approving.',
};

/** High school approval for students at an unlisted school: the approver they named uses this link. No account. */
export default async function OutsideApproval({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string; error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const who = studentForApproverLink(token);
  const p = who ? getProgress(who.studentId) : null;
  const shell = (body: React.ReactNode) => (
    <div className="frame">
      <div className="topbar"><div className="brand"><div className="brand-mark" /><div className="brand-name">Shasta College</div><div className="brand-sep only-desktop" /><div className="only-desktop" style={{ fontSize: 14 }}>Dual Enrollment · High school approval</div></div></div>
      <div className="pad-sm" style={{ padding: '40px 48px', maxWidth: 820, display: 'flex', flexDirection: 'column', gap: 20 }}>{body}</div>
    </div>
  );
  if (!who || !p) {
    return shell(<><h1 style={{ margin: 0 }}>This link isn&apos;t working</h1><p style={{ fontSize: 16, margin: 0 }}>It may have expired, or the student sent a newer one. Ask the student to send you a new link.</p></>);
  }
  const pending = p.courses.filter((c) => c.hs_status === 'pending');
  const s4 = p.steps.find((s) => s.id === 4);
  const head = (
    <div>
      <div className="kicker accent700">High school approval · {p.school.name}</div>
      <h1 className="h-sm" style={{ fontSize: 40, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>{p.student.first_name} {p.student.last_name}</h1>
      <p style={{ fontSize: 15, margin: '10px 0 0' }}>{classLabel(p.student)} · {p.student.first_name} named you ({who.email}) as the person who approves dual enrollment classes at their high school.</p>
    </div>
  );
  if (sp.done) {
    return shell(<>{head}<div className="flash" role="status">{sp.done === 'approved' ? 'Thank you. The classes are approved and signed.' : `Saved. ${p.student.first_name} will see your note and can pick other classes.`}</div></>);
  }
  if (s4?.status !== 'in_review' || !pending.length) {
    return shell(<>{head}<p style={{ fontSize: 16, margin: 0 }}>Nothing is waiting for your approval right now.</p></>);
  }
  return shell(
    <>
      {head}
      {sp.error && ERR[sp.error] && <div className="flash flash-err">{ERR[sp.error]}</div>}
      <TermCourses courses={p.courses} terms={p.requestTerms} designation={p.school.designation} compact />
      <div style={{ border: '2px solid var(--color-text)' }}>
        <ApproveSignForm
          studentId={p.student.id}
          staffName={p.student.hs_approver_name ?? ''}
          savedUrl={null}
          pending={pending.map((c) => ({ id: c.id, term_id: c.term_id, code: c.code, title: c.title, term_name: c.term_name }))}
          approve={approveByLink}
          hidden={{ token }}
        />
      </div>
    </>,
  );
}
