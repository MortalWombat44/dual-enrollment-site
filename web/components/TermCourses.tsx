import { courseWhen, fmt, type RequestedCourse, type Term } from '@/lib/workflow';
import { unitLimit } from '@/lib/constants';

/** Is registration allowed for this term (super admins switch it on/off on the Terms page)? */
export const registrationAllowed = (t: Term) => t.is_current === 1;

/**
 * Requested classes grouped by term, with each term's registration status and unit total.
 * Used by students, parents, counselors and the college admin clearing units.
 */
export function TermCourses({ courses, terms, designation, showUnits = true, compact = false }: { courses: RequestedCourse[]; terms: Term[]; designation: 'CCAP' | 'NON_CCAP'; showUnits?: boolean; compact?: boolean }) {
  const groups = terms.map((t) => ({ t, list: courses.filter((c) => c.term_id === t.id) }));
  const noTerm = courses.filter((c) => !c.term_id);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 10 : 16 }}>
      {groups.map(({ t, list }) => {
        const units = list.reduce((n, c) => n + c.units, 0);
        const allowed = registrationAllowed(t);
        const limit = unitLimit(designation, t.summer === 1);
        return (
          <div key={t.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', paddingBottom: 6, borderBottom: '2px solid var(--color-text)' }}>
              <span style={{ fontWeight: 800, fontSize: compact ? 14 : 15 }}>{t.name}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                {allowed
                  ? <span className="tag tag-accent">Registration allowed · opens {fmt(t.registration_opens)}</span>
                  : <span className="tag" style={{ background: '#fdecea', color: '#6b1a12' }}>Registration closed</span>}
                {showUnits && <span style={{ fontWeight: 700, color: units > limit ? '#8a4b00' : undefined }}>{units} of {limit} units</span>}
              </span>
            </div>
            {list.map((c) => (
              <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: compact ? '6px 0' : '10px 0', borderBottom: '1px solid var(--color-divider)', fontSize: 14 }}>
                <span>
                  <strong>{c.code}</strong> · {c.title}
                  <span className="tag tag-neutral" style={{ marginLeft: 6, fontSize: 10 }} title={c.kind === 'de' ? 'Dual Enrollment: taught at the high school' : 'Concurrent Enrollment: taught at Shasta College'}>{c.kind === 'de' ? 'DE' : 'CE'}</span>
                  {designation === 'NON_CCAP' && (c.hs_status === 'approved'
                    ? <span className="tag tag-accent" style={{ marginLeft: 6, fontSize: 10 }}>HS approved {fmt(c.hs_at)}</span>
                    : <span className="tag" style={{ marginLeft: 6, fontSize: 10, background: '#fff4e0', color: '#8a4b00' }}>Awaiting HS approval</span>)}
                </span>
                <span className="ink60">{c.units} units{courseWhen(c) ? ` · ${courseWhen(c)}` : ''}</span>
              </div>
            ))}
            {showUnits && units > limit && (
              <div style={{ fontSize: 13, background: '#fff4e0', color: '#8a4b00', borderLeft: '4px solid #d08a00', padding: '6px 10px', marginTop: 6 }}>
                Over the usual {limit}-unit limit for {designation === 'CCAP' ? 'CCAP' : 'non-CCAP'} students{t.summer === 1 && designation !== 'CCAP' ? ' in summer' : ''}.
              </div>
            )}
            {!allowed && (
              <div style={{ fontSize: 13, color: '#6b1a12', marginTop: 6 }}>
                Registration for {t.name} is turned off right now. These classes can't be registered until Shasta College turns it back on, or they're moved to another term.
              </div>
            )}
          </div>
        );
      })}
      {noTerm.length > 0 && (
        <div style={{ fontSize: 13, color: '#6b1a12' }}>No term chosen for: {noTerm.map((c) => c.code).join(', ')}</div>
      )}
    </div>
  );
}

/** Short text for one class: "ENGL 1A (Spring 2027)". */
export const withTerm = (c: RequestedCourse) => (c.term_name ? `${c.code} (${c.term_name})` : c.code);
