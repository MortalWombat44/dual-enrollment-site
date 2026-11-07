import { requireRole } from '@/lib/auth';
import { getProgress } from '@/lib/workflow';
import { TopBar } from '@/components/chrome';
import { PacketTable } from '@/components/PacketTable';
import { STUDENT_NAV } from '../nav';

export const dynamic = 'force-dynamic';

export default async function Documents() {
  const me = await requireRole('student');
  const p = getProgress(me.id);
  return (
    <div className="frame">
      <TopBar nav={STUDENT_NAV} current="/student/documents" user={me} right={<span className="tag tag-neutral hide-sm">Student</span>} />
      <div className="pad-sm" style={{ padding: '40px 40px 20px', borderBottom: '2px solid var(--color-text)' }}>
        <div className="kicker accent700">{p ? `${p.term.name} · ${p.school.name}` : 'Documents'}</div>
        <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Your packet</h1>
      </div>
      <div className="pad-sm" style={{ padding: '24px 40px 40px' }}>{p ? <PacketTable p={p} /> : <p>No enrollment on file.</p>}</div>
    </div>
  );
}
