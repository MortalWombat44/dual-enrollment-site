import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { primarySchoolIds } from '@/lib/access';
import { byTeacher, schoolRoster, type RosterClass } from '@/lib/roster';
import { allTerms } from '@/lib/workflow';
import { AdminShell } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

type SP = { school?: string; view?: string; term?: string };

export default async function Roster({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireAdmin('college');
  const sp = await searchParams;
  const primary = primarySchoolIds(me.id);
  const schools = (db().prepare('SELECT id, name FROM schools ORDER BY name').all() as { id: number; name: string }[])
    .sort((a, b) => Number(primary.includes(b.id)) - Number(primary.includes(a.id)));
  const schoolId = Number(sp.school) || schools[0]?.id;
  const school = schools.find((s) => s.id === schoolId);
  const terms = allTerms();
  const termId = Number(sp.term) || undefined;
  const view = sp.view === 'teacher' ? 'teacher' : 'class';
  const classes = school ? schoolRoster(school.id, termId) : [];
  const students = new Set(classes.flatMap((c) => c.students.map((s) => s.id))).size;
  const q = (o: Partial<SP>) => '/admin/roster?' + new URLSearchParams({ school: String(schoolId), view, ...(termId ? { term: String(termId) } : {}), ...o } as Record<string, string>);

  return (
    <AdminShell me={me} current="roster">
      <div className="admin-head pad-sm">
        <div><div className="kicker accent700">Roster</div><h1>{school?.name ?? 'Roster'}</h1></div>
        <form action="/admin/roster" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="hidden" name="view" value={view} />
          <select name="school" className="input" defaultValue={schoolId} style={{ width: 240 }} aria-label="School">
            {primary.length > 0 && <optgroup label="Your schools">{schools.filter((s) => primary.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
            <optgroup label={primary.length ? 'Other schools' : 'Schools'}>{schools.filter((s) => !primary.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          </select>
          <select name="term" className="input" defaultValue={termId ?? ''} style={{ width: 160 }} aria-label="Term">
            <option value="">All terms</option>
            {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button className="btn btn-secondary">Show</button>
        </form>
      </div>
      <div className="pad-sm" style={{ padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="seg">
          <Link className="seg-opt" href={q({ view: 'class' })} aria-current={view === 'class'}>By class</Link>
          <Link className="seg-opt" href={q({ view: 'teacher' })} aria-current={view === 'teacher'}>By teacher</Link>
        </div>
        <span style={{ fontSize: 14 }}>
          {classes.length} classes · {students} students{primary.includes(schoolId) ? ' · one of your primary schools' : ''}
          {' · '}<a href={`/admin/roster.csv?school=${schoolId}${termId ? `&term=${termId}` : ''}`}>Download CSV</a>
        </span>
      </div>
      <div className="pad-sm" style={{ padding: '16px 40px 48px', display: 'flex', flexDirection: 'column', gap: 28 }}>
        {classes.length === 0 && <p className="ink60" style={{ fontSize: 14 }}>No classes or requests for this school yet.</p>}
        {view === 'class'
          ? classes.map((c) => <ClassBlock key={c.id} c={c} />)
          : byTeacher(classes).map((g) => (
            <div key={g.teacher} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <h2 style={{ fontSize: 22, margin: 0, paddingBottom: 6, borderBottom: '2px solid var(--color-text)' }}>{g.teacher}</h2>
              {g.classes.map((c) => <ClassBlock key={c.id} c={c} nested />)}
            </div>
          ))}
      </div>
    </AdminShell>
  );
}

function ClassBlock({ c, nested }: { c: RosterClass; nested?: boolean }) {
  return (
    <div data-class={c.id} style={{ paddingLeft: nested ? 16 : 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', paddingBottom: 6, borderBottom: nested ? '1px solid var(--color-divider)' : '2px solid var(--color-text)' }}>
        <span style={{ fontWeight: 800, fontSize: 16 }}>
          {c.code} · {c.title}
          <span className="tag tag-neutral" style={{ marginLeft: 8, fontSize: 10 }}>{c.kind === 'de' ? 'DE' : 'CE'}</span>
        </span>
        <span className="ink60" style={{ fontSize: 13 }}>
          {c.kind === 'de' ? [c.period ? `Period ${c.period}` : null, c.teacher].filter(Boolean).join(' · ') : 'At Shasta College'} · {c.units} units · <strong style={{ color: 'var(--color-text)' }}>{c.students.length} student{c.students.length === 1 ? '' : 's'}</strong>
        </span>
      </div>
      {c.students.length === 0 ? (
        <div className="ink60" style={{ fontSize: 14, padding: '8px 0' }}>No one has selected this class yet.</div>
      ) : (
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Student</th><th>Class of</th><th>Term</th><th>Step they're on</th></tr></thead>
          <tbody>
            {c.students.map((s) => (
              <tr key={s.id}>
                <td><Link href={`/admin/students?tab=all&student=${s.id}`}><strong>{s.name}</strong></Link>{s.young && <span className="tag" style={{ marginLeft: 6, background: '#e8f0fb', color: '#1d3f6e' }} title="8th grade or below">Young student</span>}</td>
                <td>{s.gradYear ?? '—'}</td>
                <td>{s.term ?? '—'}</td>
                <td>
                  {s.step}
                  {s.stepStatus === 'in_review' && <span className="tag tag-accent" style={{ marginLeft: 6 }}>In review</span>}
                  {s.stepStatus === 'waiting_parent' && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Waiting on parent</span>}
                  {s.stepStatus === 'changes' && <span className="tag tag-neutral" style={{ marginLeft: 6 }}>Changes requested</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
