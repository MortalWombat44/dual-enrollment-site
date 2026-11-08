'use client';
import { useState } from 'react';

type Course = {
  id: number; code: string; title: string; units: number; schedule: string; prerequisite: string | null;
  kind: 'ce' | 'de'; period: string | null; teacher: string | null;
  offered_term_id?: number | null; // only offered in this term (null = every term)
};
type Term = { id: number; name: string; opens: string; limit: number };
/** A typed-in Concurrent Enrollment class. Units stay a string while typing. */
export type CeRow = { code: string; title: string; units: string; term: number; prereq: boolean };

// Dual Enrollment shows period + teacher; Concurrent courses are just code, title and units.
const when = (c: Course) => c.kind === 'de'
  ? [c.period ? `Period ${c.period}` : null, c.teacher === 'TBD' ? 'Teacher TBD' : c.teacher].filter(Boolean).join(' · ') || 'At your high school'
  : '';

/**
 * Pick classes, in two groups: Dual Enrollment (taught at the student's high school, with period + teacher)
 * and Concurrent Enrollment (taught at Shasta College). Each picked class gets a term; only terms with
 * registration allowed are offered. Unit limits are per term and only show a note when exceeded.
 */
export function CoursePicker({ courses, initial, initialCe, terms, ccap, schoolName, baseUnits = {} }: {
  courses: Course[];
  /** Units already requested per term (when adding more classes), counted in the term totals. */
  baseUnits?: Record<number, number>;
  initial: { id: number; term_id: number | null }[];
  initialCe: CeRow[];
  terms: Term[];
  ccap: boolean;
  schoolName: string;
}) {
  const allowed = new Set(terms.map((t) => t.id));
  const [sel, setSel] = useState<Map<number, number>>(
    new Map(initial.map((c) => [c.id, c.term_id && allowed.has(c.term_id) ? c.term_id : terms[0]?.id ?? 0])),
  );
  const blankCe = (): CeRow => ({ code: '', title: '', units: '', term: terms[0]?.id ?? 0, prereq: false });
  const [ce, setCe] = useState<CeRow[]>(initialCe.length ? initialCe.map((r) => ({ ...r, term: allowed.has(r.term) ? r.term : terms[0]?.id ?? 0 })) : []);
  const setRow = (i: number, patch: Partial<CeRow>) => setCe((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  // Term totals count Dual and Concurrent classes together.
  const unitsIn = (termId: number) => (baseUnits[termId] ?? 0) +
    courses.filter((c) => sel.get(c.id) === termId).reduce((n, c) => n + c.units, 0)
    + ce.filter((r) => r.term === termId).reduce((n, r) => n + (Number(r.units) > 0 ? Number(r.units) : 0), 0);
  const termsFor = (c: Course) => (c.offered_term_id ? terms.filter((t) => t.id === c.offered_term_id) : terms);
  const toggle = (id: number) => setSel((s) => {
    const n = new Map(s);
    const c = courses.find((x) => x.id === id);
    if (n.has(id)) n.delete(id); else n.set(id, (c && termsFor(c)[0]?.id) ?? terms[0]?.id ?? 0);
    return n;
  });
  const setTerm = (id: number, termId: number) => setSel((s) => new Map(s).set(id, termId));

  // Sections offered in one term only show while that term is open.
  const listed = courses.filter((c) => c.kind === 'de' && termsFor(c).length > 0);
  const ceList = courses.filter((c) => c.kind === 'ce');

  if (terms.length === 0) {
    return <div className="flash flash-err" style={{ padding: '12px 16px' }}>Registration isn't open for any term right now. Check back soon, or contact Shasta College Outreach.</div>;
  }

  const row = (c: Course) => {
    const on = sel.has(c.id);
    return (
      <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 12, alignItems: 'center', padding: '14px 0', borderBottom: '2px solid var(--color-divider)', background: on ? 'var(--color-accent-100)' : undefined }}>
        <input
          type="checkbox" name="course" value={c.id} checked={on} onChange={() => toggle(c.id)} id={`c${c.id}`}
          style={{ width: 20, height: 20, accentColor: 'var(--color-accent)', marginLeft: 4 }}
        />
        <label htmlFor={`c${c.id}`} style={{ cursor: 'pointer' }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{c.code} · {c.title}</div>
          <div className="ink60" style={{ fontSize: 13 }}>{c.units} units{when(c) ? ` · ${when(c)}` : ''}{c.offered_term_id ? ` · ${termsFor(c)[0]?.name} only` : ''}{c.prerequisite ? ` · Prerequisite: ${c.prerequisite} (a college counselor reviews this)` : ''}</div>
        </label>
        {on ? (
          <select name={`term_${c.id}`} className="input" aria-label={`Term for ${c.code} (${c.kind === 'de' ? 'Dual' : 'Concurrent'})`} value={sel.get(c.id)} onChange={(e) => setTerm(c.id, Number(e.target.value))} style={{ width: 150, marginRight: 8 }}>
            {termsFor(c).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        ) : <span />}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="kicker-sm" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', paddingBottom: 8, borderBottom: '2px solid var(--color-divider)' }}>
        <span>Units by term</span>
        <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          {terms.map((t) => (
            <span key={t.id} style={{ color: unitsIn(t.id) > t.limit ? '#8a4b00' : undefined }}>{t.name}: {unitsIn(t.id)} of {t.limit} units</span>
          ))}
        </span>
      </div>
      <div data-kind="de" style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', paddingBottom: 6, borderBottom: '2px solid var(--color-text)' }}>
          <span style={{ fontWeight: 800, fontSize: 17 }}>Dual Enrollment</span>
          <span className="ink60" style={{ fontSize: 13 }}>Taught at {schoolName}</span>
        </div>
        {listed.length === 0 && <div className="ink60" style={{ fontSize: 14, padding: '10px 0' }}>No Dual Enrollment classes are listed for your school yet.</div>}
        {listed.map(row)}
      </div>
      <div data-kind="ce" style={{ display: 'flex', flexDirection: 'column', marginTop: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', paddingBottom: 6, borderBottom: '2px solid var(--color-text)' }}>
          <span style={{ fontWeight: 800, fontSize: 17 }}>Concurrent Enrollment</span>
          <span className="ink60" style={{ fontSize: 13 }}>Taught at Shasta College · type in each class</span>
        </div>
        {ceList.map(row)}
        <div className="ink60" style={{ fontSize: 13, padding: '10px 0 4px' }}>{ceList.length ? 'Taking a class that isn’t listed? ' : ''}Enter the course code from the Shasta College schedule (like PSYC C1000) and its units.</div>
        {ce.map((r, i) => (
          <div key={i} className="ce-row" style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 1fr) minmax(120px, 1.4fr) 80px 150px auto', gap: 8, alignItems: 'center', padding: '10px 0', borderBottom: '2px solid var(--color-divider)' }}>
            <input name="ce_code" className="input" placeholder="PSYC C1000" aria-label={`Course code ${i + 1}`} value={r.code} maxLength={20} required
              onChange={(e) => setRow(i, { code: e.target.value })} />
            <input name="ce_title" className="input" placeholder="Course name (optional)" aria-label={`Course name ${i + 1}`} value={r.title} maxLength={100}
              onChange={(e) => setRow(i, { title: e.target.value })} />
            <input name="ce_units" className="input" type="number" min={0.5} max={20} step={0.5} placeholder="Units" aria-label={`Units ${i + 1}`} value={r.units} required
              onChange={(e) => setRow(i, { units: e.target.value })} />
            <select name="ce_term" className="input" aria-label={`Term for course ${i + 1}`} value={r.term} onChange={(e) => setRow(i, { term: Number(e.target.value) })}>
              {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button type="button" className="btn btn-ghost" style={{ color: 'var(--color-accent-700)', fontSize: 13 }} onClick={() => setCe((rows) => rows.filter((_, j) => j !== i))}>Remove</button>
            <input type="hidden" name="ce_prereq" value={r.prereq ? '1' : '0'} />
            <label style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={r.prereq} onChange={(e) => setRow(i, { prereq: e.target.checked })} style={{ accentColor: 'var(--color-accent)' }} />
              This class has a prerequisite (a college counselor will review it)
            </label>
          </div>
        ))}
        <div style={{ paddingTop: 10 }}>
          <button type="button" className="btn btn-secondary" onClick={() => setCe((rows) => [...rows, blankCe()])}>+ Add a concurrent class</button>
        </div>
      </div>
      {terms.filter((t) => unitsIn(t.id) > t.limit).map((t) => (
        <div key={t.id} style={{ fontSize: 13, background: '#fff4e0', color: '#8a4b00', borderLeft: '4px solid #d08a00', padding: '8px 12px', marginTop: 8 }}>
          Note: {unitsIn(t.id)} units in {t.name} is over the usual {t.limit}-unit limit for {ccap ? 'CCAP' : 'non-CCAP'} students. You can still submit; Shasta College will review it when clearing your units.
        </div>
      ))}
      <div className="ink60" style={{ fontSize: 13, marginTop: 10 }}>
        Registration: {terms.map((t) => `${t.name} opens ${t.opens}`).join(' · ')}
      </div>
    </div>
  );
}
