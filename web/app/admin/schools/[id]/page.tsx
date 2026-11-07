import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/auth';
import { db, DEFAULT_MODES } from '@/lib/db';
import { saveSchool } from '@/lib/admin-actions';
import { getSchool, schoolModes, schoolStepRows } from '@/lib/workflow';
import { AdminShell } from '@/components/AdminShell';
import { SchoolEditor } from '@/components/SchoolEditor';
import { Flash } from '@/components/chrome';

export const dynamic = 'force-dynamic';

export default async function SchoolDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; error?: string }> }) {
  const me = await requireAdmin('super');
  const { id } = await params;
  const sp = await searchParams;
  const school = getSchool(Number(id));
  if (!school) notFound();
  const count = (sql: string) => (db().prepare(sql).get(school.id) as { n: number }).n;
  const students = count("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND school_id = ?");
  const counselors = count("SELECT COUNT(*) AS n FROM users WHERE role = 'counselor' AND school_id = ?");
  const inProgress = count("SELECT COUNT(*) AS n FROM enrollments e JOIN users u ON u.id = e.student_id WHERE u.school_id = ? AND e.step_modes IS NOT NULL");
  const steps = schoolStepRows(school.id).map(({ id, name, description }) => ({ id, name, description }));

  return (
    <AdminShell me={me} current="schools">
      <div className="pad-sm" style={{ padding: '24px 40px 0', fontSize: 13 }}><Link href="/admin/schools">Schools</Link> / {school.name}</div>
      <Flash msg={sp.saved ? 'Saved. New students at this school will follow these steps.' : sp.created ? 'School added with default steps. Adjust them below.' : null} />
      <Flash error msg={sp.error === 'required' ? 'At least one step has to be required.' : sp.error === 'date' ? 'Enter the expiry as a date.' : null} />
      <SchoolEditor
        key={sp.saved ?? 'edit'}
        action={saveSchool}
        school={school}
        steps={steps}
        initialModes={schoolModes(school.id)}
        defaults={DEFAULT_MODES}
        inProgress={inProgress}
        header={
          <div>
            <h1 style={{ margin: 0 }}>{school.name}</h1>
            <div style={{ fontSize: 14, marginTop: 6 }}>{school.district} · {students} student{students === 1 ? '' : 's'} · {counselors} counselor{counselors === 1 ? '' : 's'}</div>
          </div>
        }
      />
    </AdminShell>
  );
}
