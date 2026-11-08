import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { isParentOf } from '@/lib/access';
import { getProgress, latestAffidavit } from '@/lib/workflow';
import { parentSubmitAffidavit } from '@/lib/parent-actions';
import { AFFIDAVIT_ERRORS } from '@/lib/affidavit';
import { AffidavitUpload } from '@/components/AffidavitUpload';
import { TopBar } from '@/components/chrome';

export const dynamic = 'force-dynamic';

/** Parent uploads the Private School Affidavit for a homeschooled student. */
export default async function ParentAffidavit({ searchParams }: { searchParams: Promise<{ student?: string; error?: string }> }) {
  const me = await requireRole('parent');
  const sp = await searchParams;
  const id = Number(sp.student);
  if (!isParentOf(me, id)) redirect('/parent');
  const p = getProgress(id);
  if (p?.steps.find((s) => s.id === 11)?.status !== 'current') redirect(`/parent?student=${id}`);
  const last = latestAffidavit(id);
  return (
    <div className="frame">
      <TopBar user={me} right={<span className="tag tag-neutral">Parent / guardian</span>} />
      <div className="pad-sm" style={{ padding: '40px 48px', maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="kicker accent700">{p!.student.first_name} {p!.student.last_name} · Homeschool</div>
          <h1 className="h-sm" style={{ fontSize: 40, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Private School Affidavit</h1>
        </div>
        {sp.error && AFFIDAVIT_ERRORS[sp.error] && <div className="flash flash-err">{AFFIDAVIT_ERRORS[sp.error]}</div>}
        <AffidavitUpload action={parentSubmitAffidavit} studentId={id} declinedNote={last?.status === 'declined' ? last.note : null} />
      </div>
    </div>
  );
}
