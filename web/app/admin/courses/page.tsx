import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { Flash } from '@/components/chrome';

export const dynamic = 'force-dynamic';

/** Links to each school's Dual Enrollment list. Concurrent Enrollment classes are typed in by students. */
export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ course_saved?: string; course_removed?: string; course_error?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const schools = db().prepare(`SELECT s.id, s.name, (SELECT COUNT(*) FROM courses c WHERE c.kind = 'de' AND c.school_id = s.id AND c.active = 1) AS n
    FROM schools s ORDER BY s.name`).all() as { id: number; name: string; n: number }[];
  return (
    <AdminShell me={me} current="courses">
      <AdminHead title="Courses" />
      <Flash msg={sp.course_saved ? 'Course saved.' : sp.course_removed ? 'Course removed from new requests.' : null} />
      <Flash error msg={sp.course_error ? 'A course needs a code, a title and units.' : null} />
      <div className="pad-sm" style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="kicker">Concurrent Enrollment · taught at Shasta College</div>
        <div style={{ fontSize: 14 }}>No list to keep up: students type in each concurrent class (course code and units) when they pick classes.</div>
      </div>
      <div className="pad-sm" style={{ padding: '8px 40px 40px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="kicker">Dual Enrollment · taught at each high school</div>
        <div style={{ fontSize: 14 }}>Each school's Dual Enrollment list (with period and teacher) is edited on that school's page.</div>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>School</th><th>Dual Enrollment courses</th><th /></tr></thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id}><td><strong>{s.name}</strong></td><td>{s.n}</td><td><a href={`/admin/schools/${s.id}#courses`}>Edit courses</a></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
