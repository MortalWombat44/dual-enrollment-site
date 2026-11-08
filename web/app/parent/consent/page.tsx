import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { isParentOf } from '@/lib/access';
import { OUTREACH_PHONE } from '@/lib/constants';
import { getProgress, pad, studentsForParent } from '@/lib/workflow';
import { submitConsent } from '@/lib/parent-actions';
import { TopBar } from '@/components/chrome';
import { ConsentForm } from '@/components/ConsentForm';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, string> = {
  agree: 'Check the permission box to continue.',
  signature: 'Draw your signature in the box, then submit.',
  file: 'Choose the signed form to upload.',
  size: 'That file is over 10 MB.',
  type: "That file doesn't look like a PDF, JPG or PNG.",
};

export default async function ConsentPage({ searchParams }: { searchParams: Promise<{ student?: string; error?: string }> }) {
  const me = await requireRole('parent');
  const sp = await searchParams;
  const kids = studentsForParent(me.id);
  const studentId = Number(sp.student) || kids[0]?.id;
  if (!studentId || !isParentOf(me, studentId)) redirect('/parent');
  const p = getProgress(studentId)!;
  const step = p.steps.find((s) => s.id === 3);
  if (!step || step.status !== 'waiting_parent') redirect('/parent');
  const first = p.student.first_name;

  return (
    <div className="frame">
      <TopBar user={me} right={<><span className="hide-sm">Student: <strong>{p.student.first_name} {p.student.last_name}</strong></span><span className="tag tag-neutral">Parent / guardian</span></>} />
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 400px', flex: 1 }}>
        <div className="pad-sm noborder-sm" style={{ padding: '40px 48px', borderRight: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          <div>
            <div className="kicker accent700">Step {pad(step.num)} of {p.total}</div>
            <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Parent / guardian consent</h1>
            <p style={{ fontSize: 16, margin: '12px 0 0', maxWidth: 600, textWrap: 'pretty' }}>
              Sign the Shasta College Dual Enrollment consent form online with your finger or mouse. {first} can't be approved until this is in.
            </p>
          </div>
          <ConsentForm action={submitConsent} studentId={studentId} studentFirst={first} parentName={`${me.first_name} ${me.last_name}`} error={sp.error ? ERRORS[sp.error] : undefined} />
        </div>
        <div style={{ background: 'var(--color-surface)', display: 'flex', flexDirection: 'column' }}>
          <div className="pad-sm" style={{ padding: '32px 32px 20px', borderBottom: '2px solid var(--color-divider)' }}><div className="kicker">What you're agreeing to</div></div>
          <div className="pad-sm" style={{ padding: '20px 32px', borderBottom: '2px solid var(--color-divider)' }}>
            <div style={{ fontWeight: 700 }}>Classes</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>
              After you sign, {first} picks Shasta College classes: Dual Enrollment classes taught at their high school, or Concurrent Enrollment classes taught at Shasta College.
              Their high school and Shasta College review the classes before {first} registers.
            </div>
          </div>
          <div className="pad-sm" style={{ padding: '20px 32px', borderBottom: '2px solid var(--color-divider)' }}>
            <div style={{ fontWeight: 700 }}>Cost</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>Tuition is waived for dual enrollment. Textbooks are provided for these sections.</div>
          </div>
          <div className="pad-sm" style={{ padding: '20px 32px', borderBottom: '2px solid var(--color-divider)' }}>
            <div style={{ fontWeight: 700 }}>Transcript</div>
            <div style={{ fontSize: 14, marginTop: 4 }}>Grades go on a permanent Shasta College transcript.</div>
          </div>
          <div className="pad-sm" style={{ padding: '20px 32px', fontSize: 14 }}>
            Questions? Call Outreach at <a href={`tel:${OUTREACH_PHONE.replace(/\D/g, '')}`}>{OUTREACH_PHONE}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
