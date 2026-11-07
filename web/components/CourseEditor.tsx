import { addCourse, removeCourse, restoreCourse, saveCourse } from '@/lib/admin-actions';
import { db } from '@/lib/db';
import type { Course } from '@/lib/workflow';

const small: React.CSSProperties = { minHeight: 32, padding: '4px 8px', fontSize: 13 };

/**
 * Editable course list. Dual Enrollment (pass schoolId): period + teacher. Concurrent (no schoolId): just code, title, units.
 * Each row is its own form so saving one course never touches another.
 */
export function CourseEditor({ schoolId }: { schoolId?: number }) {
  const de = !!schoolId;
  const courses = (de
    ? db().prepare("SELECT * FROM courses WHERE kind = 'de' AND school_id = ? ORDER BY active DESC, code").all(schoolId)
    : db().prepare("SELECT * FROM courses WHERE kind = 'ce' ORDER BY active DESC, code").all()) as Course[];
  const requested = new Map((db().prepare('SELECT course_id, COUNT(*) AS n FROM course_requests GROUP BY course_id').all() as { course_id: number; n: number }[]).map((r) => [r.course_id, r.n]));
  const cols = de ? '90px 1.3fr 56px 64px 1fr 1.2fr 150px' : '110px 2fr 64px 1.4fr 150px';

  const fields = (c?: Course) => (
    <>
      <input name="code" className="input" style={small} defaultValue={c?.code} placeholder="ENGL 1A" required aria-label="Code" />
      <input name="title" className="input" style={small} defaultValue={c?.title} placeholder="Title" required aria-label="Title" />
      <input name="units" type="number" min={0.5} max={10} step={0.5} className="input" style={small} defaultValue={c?.units ?? 3} required aria-label="Units" />
      {de ? (
        <>
          <input name="period" className="input" style={small} defaultValue={c?.period ?? ''} placeholder="2" aria-label="Period" />
          <input name="teacher" className="input" style={small} defaultValue={c?.teacher ?? ''} placeholder="Teacher" aria-label="Teacher" />
        </>
      ) : null}
      <input name="prerequisite" className="input" style={small} defaultValue={c?.prerequisite ?? ''} placeholder="None" aria-label="Prerequisite" />
    </>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="kicker-sm" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>
        <span>Code</span><span>Title</span><span>Units</span>{de && <><span>Period</span><span>Teacher</span></>}<span>Prerequisite</span><span />
      </div>
      {courses.length === 0 && <div className="ink60" style={{ fontSize: 14, padding: '12px 0' }}>No courses yet.</div>}
      {courses.map((c) => (
        <form key={c.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-divider)', opacity: c.active ? 1 : 0.55 }}>
          <input type="hidden" name="id" value={c.id} />
          {de && <input type="hidden" name="school_id" value={schoolId} />}
          {fields(c)}
          <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
            <button formAction={saveCourse} className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }}>Save</button>
            {c.active
              ? <button formAction={removeCourse} className="btn btn-ghost" style={{ fontSize: 13, color: '#b3261e' }} title={requested.get(c.id) ? `${requested.get(c.id)} student(s) keep this on their request` : undefined}>Remove</button>
              : <button formAction={restoreCourse} className="btn btn-ghost" style={{ fontSize: 13, color: 'var(--color-accent-700)' }}>Restore</button>}
            {!c.active && <span className="tag tag-neutral">Removed</span>}
          </span>
        </form>
      ))}
      <form action={addCourse} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '12px 0', background: 'var(--color-accent-100)', marginTop: 8 }}>
        {de && <input type="hidden" name="school_id" value={schoolId} />}
        {fields()}
        <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13, justifyContent: 'space-between' }}>Add course <span>+</span></button>
      </form>
      <div className="ink60" style={{ fontSize: 12, marginTop: 8 }}>
        {de ? 'Dual Enrollment: Shasta College courses taught at this high school. Only students at this school see them.' : 'Concurrent Enrollment: courses taught at Shasta College. Students at every school see them.'}
        {' '}Removing a course hides it from new requests; students who already asked for it keep it.
      </div>
    </div>
  );
}
