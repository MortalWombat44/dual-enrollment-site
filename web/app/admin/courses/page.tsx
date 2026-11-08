import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { Flash } from '@/components/chrome';
import { importCourses } from '@/lib/course-import-actions';
import { allTerms } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

/** Links to each school's Dual Enrollment list. Concurrent Enrollment classes are typed in by students. */
export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ course_saved?: string; course_removed?: string; course_error?: string; imported?: string; import_error?: string; school?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const terms = allTerms();
  const imported = sp.imported ? sp.imported.split('.').map(Number) : null;
  const schools = db().prepare(`SELECT s.id, s.name, (SELECT COUNT(*) FROM courses c WHERE c.kind = 'de' AND c.school_id = s.id AND c.active = 1) AS n
    FROM schools s ORDER BY s.name`).all() as { id: number; name: string; n: number }[];
  return (
    <AdminShell me={me} current="courses">
      <AdminHead title="Courses" />
      <Flash msg={sp.course_saved ? 'Course saved.' : sp.course_removed ? 'Course removed from new requests.' : null} />
      <Flash error msg={sp.course_error ? 'A course needs a code, a title and units.' : null} />
      <div id="import" className="pad-sm" style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker">Upload Dual Enrollment courses · CSV or Excel</div>
        {imported && (
          <div className="flash" role="status">
            Uploaded for {schools.find((x) => x.id === Number(sp.school))?.name ?? 'the school'}: {imported[0]} added, {imported[1]} updated{imported[2] ? `, ${imported[2]} removed (not in the file)` : ''}.{' '}
            <a href={`/admin/schools/${sp.school}#courses`}>See the course list</a>
          </div>
        )}
        {sp.import_error && (
          <div className="flash flash-err" style={{ whiteSpace: 'pre-line' }}>Nothing was imported. Fix these and upload again:{'\n'}{sp.import_error}</div>
        )}
        <div style={{ fontSize: 14 }}>
          One row per section: <strong>Code, Title, Units</strong> (required), <strong>Period, Teacher, Prerequisite</strong> (optional).
          A row with the same code and period as a course already listed for that school and term updates it.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a className="btn btn-secondary" href="/admin/courses/template?format=xlsx">Download Excel template</a>
          <a className="btn btn-secondary" href="/admin/courses/template?format=csv">Download CSV template</a>
        </div>
        <form action={importCourses} style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select name="school_id" className="input" required defaultValue={sp.school ?? ''} aria-label="School" style={{ flex: '1 1 220px' }}>
              <option value="" disabled>School…</option>
              {schools.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
            <select name="term_id" className="input" required defaultValue="" aria-label="Term" style={{ flex: '1 1 160px' }}>
              <option value="" disabled>Term…</option>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              <option value="all">Every term</option>
            </select>
          </div>
          <input type="file" name="file" required accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="input" aria-label="Course file" />
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 14 }}>
            <input type="checkbox" name="replace" style={{ marginTop: 3, accentColor: 'var(--color-accent)' }} />
            <span>Replace the list: remove courses for this school and term that aren't in the file. <span className="ink60">(Students who already requested them keep them.)</span></span>
          </label>
          <div><button className="btn btn-primary" style={{ minWidth: 200, justifyContent: 'space-between' }}>Upload courses <span>→</span></button></div>
        </form>
      </div>
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
