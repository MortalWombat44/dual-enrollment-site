'use client';
import { useState } from 'react';

type Course = { id: number; code: string; title: string; units: number; schedule: string; prerequisite: string | null };
type Term = { id: number; name: string; opens: string };

/**
 * Pick classes and, for each one, the term to take it in. Only terms with registration allowed are offered.
 * The unit limit applies per term.
 */
export function CoursePicker({ courses, initial, terms, max }: { courses: Course[]; initial: { id: number; term_id: number | null }[]; terms: Term[]; max: number }) {
  const allowed = new Set(terms.map((t) => t.id));
  const [sel, setSel] = useState<Map<number, number>>(
    new Map(initial.map((c) => [c.id, c.term_id && allowed.has(c.term_id) ? c.term_id : terms[0]?.id ?? 0])),
  );
  const unitsIn = (termId: number) => courses.filter((c) => sel.get(c.id) === termId).reduce((n, c) => n + c.units, 0);
  const toggle = (id: number) => setSel((s) => { const n = new Map(s); if (n.has(id)) n.delete(id); else n.set(id, terms[0]?.id ?? 0); return n; });
  const setTerm = (id: number, termId: number) => setSel((s) => new Map(s).set(id, termId));

  if (terms.length === 0) {
    return <div className="flash flash-err" style={{ padding: '12px 16px' }}>Registration isn't open for any term right now. Check back soon, or contact Shasta College Outreach.</div>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="kicker-sm" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>
        <span>Sections offered for your school</span>
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {terms.map((t) => (
            <span key={t.id} style={{ color: unitsIn(t.id) > max ? '#b3261e' : undefined }}>{t.name}: {unitsIn(t.id)} of {max} units</span>
          ))}
        </span>
      </div>
      {courses.map((c) => {
        const on = sel.has(c.id);
        return (
          <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 12, alignItems: 'center', padding: '14px 0', borderBottom: '2px solid var(--color-divider)', background: on ? 'var(--color-accent-100)' : undefined }}>
            <input
              type="checkbox" name="course" value={c.id} checked={on} onChange={() => toggle(c.id)} id={`c${c.id}`}
              style={{ width: 20, height: 20, accentColor: 'var(--color-accent)', marginLeft: 4 }}
            />
            <label htmlFor={`c${c.id}`} style={{ cursor: 'pointer' }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.code} · {c.title}</div>
              <div className="ink60" style={{ fontSize: 13 }}>{c.units} units · {c.schedule}{c.prerequisite ? ` · Prerequisite: ${c.prerequisite} (a college counselor reviews this)` : ''}</div>
            </label>
            {on ? (
              <select name={`term_${c.id}`} className="input" aria-label={`Term for ${c.code}`} value={sel.get(c.id)} onChange={(e) => setTerm(c.id, Number(e.target.value))} style={{ width: 150, marginRight: 8 }}>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : <span />}
          </div>
        );
      })}
      {terms.some((t) => unitsIn(t.id) > max) && <div style={{ fontSize: 13, color: '#b3261e', marginTop: 8 }}>Dual enrollment students can take up to {max} units a term.</div>}
      <div className="ink60" style={{ fontSize: 13, marginTop: 10 }}>
        Registration: {terms.map((t) => `${t.name} opens ${t.opens}`).join(' · ')}
      </div>
    </div>
  );
}
