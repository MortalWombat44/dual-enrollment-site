import { notFound, redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { canSeeStudent, isParentOf } from '@/lib/access';
import { getFile } from '@/lib/files';
import { fmt, getProgress } from '@/lib/workflow';
import { PrintButton } from '@/components/PrintButton';

export const dynamic = 'force-dynamic';

/** Printable consent record. `/consent/blank` gives the empty paper form. */
export default async function ConsentRecord({ params }: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await params;
  const blank = studentId === 'blank';
  const me = await currentUser();
  if (!me) redirect('/login');
  let p = null;
  if (!blank) {
    p = getProgress(Number(studentId));
    if (!p) notFound();
    // A parent can always see the consent they signed, even if the student hasn't shared their records.
    const signedBy = p.steps.find((s) => s.id === 3)?.data?.parent_id;
    if (!canSeeStudent(me, Number(studentId)) && !(isParentOf(me, Number(studentId)) && signedBy === me.id)) notFound();
  }
  const step = p?.steps.find((s) => s.id === 3);
  const d = (step?.data ?? {}) as { method?: string; signer?: string; file_id?: number; sign_method?: string };
  const file = d.file_id ? getFile(d.file_id) : null;
  const line = (label: string, value?: string) => (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
      <span className="ink60">{label}</span><span style={{ minHeight: 20 }}>{value ?? ''}</span>
    </div>
  );
  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--color-text)', paddingBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div className="brand-mark" /><div className="brand-name">Shasta College · Dual Enrollment</div></div>
        <PrintButton />
      </div>
      <div>
        <div className="kicker accent700">Dual Enrollment</div>
        <h1 style={{ fontSize: 36, margin: '8px 0 0' }}>Parent / guardian consent</h1>
      </div>
      <div>
        {line('Student', p ? `${p.student.first_name} ${p.student.last_name}` : undefined)}
        {line('Shasta College ID', p?.student.student_number ?? undefined)}
        {line('High school', p?.school.name)}
      </div>
      <p style={{ fontSize: 14, margin: 0 }}>
        I am the parent or legal guardian of the student named above. I give permission for the student to enroll in Shasta College courses through dual enrollment and concurrent enrollment. This is a one-time consent that covers this and future terms until I revoke it.
        I understand that tuition is waived for dual enrollment, that textbooks are provided for these sections, and that grades are recorded on a permanent Shasta College transcript.
      </p>
      <div>
        {line('Parent / guardian name', d.signer)}
        {line('Signed', step?.completedAt ? `${fmt(step.completedAt, 'mdy')}, ${fmt(step.completedAt, 'time')} · ${d.method === 'upload' ? 'uploaded signed form' : d.method === 'office' ? 'on file with Shasta College' : d.sign_method === 'typed' ? 'e-signature (name typed)' : 'e-signature'}` : undefined)}
      </div>
      {file && file.kind === 'signature' && (
        <div style={{ border: '2px solid var(--color-text)', background: '#fff', padding: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/files/${file.id}`} alt={`Signature of ${d.signer ?? 'parent'}`} style={{ maxHeight: 180, margin: '0 auto' }} />
        </div>
      )}
      {file && file.kind === 'consent_upload' && (
        <p style={{ fontSize: 14 }}>Signed form on file: <a href={`/files/${file.id}`} target="_blank" rel="noreferrer">{file.filename}</a></p>
      )}
      {blank && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24, marginTop: 40 }}>
          <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 6, fontSize: 12 }}>Parent / guardian signature</div>
          <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 6, fontSize: 12 }}>Date</div>
        </div>
      )}
    </div>
  );
}
