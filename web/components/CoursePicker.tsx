'use client';
import { useState } from 'react';

type Course = { id: number; code: string; title: string; units: number; schedule: string };

export function CoursePicker({ courses, initial, max }: { courses: Course[]; initial: number[]; max: number }) {
  const [sel, setSel] = useState<Set<number>>(new Set(initial));
  const units = courses.filter((c) => sel.has(c.id)).reduce((n, c) => n + c.units, 0);
  const over = units > max;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="kicker-sm" style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>
        <span>Sections offered for your school</span>
        <span style={{ color: over ? '#b3261e' : undefined }}>{units} of {max} units</span>
      </div>
      {courses.map((c) => {
        const on = sel.has(c.id);
        return (
          <label key={c.id} style={{ display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 12, alignItems: 'center', padding: '14px 0', borderBottom: '2px solid var(--color-divider)', cursor: 'pointer', background: on ? 'var(--color-accent-100)' : undefined }}>
            <input
              type="checkbox" name="course" value={c.id} checked={on}
              onChange={() => setSel((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
              style={{ width: 20, height: 20, accentColor: 'var(--color-accent)', marginLeft: 4 }}
            />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{c.code} · {c.title}</div>
              <div className="ink60" style={{ fontSize: 13 }}>{c.schedule}</div>
            </div>
            <span style={{ fontSize: 13, paddingRight: 8 }}>{c.units} units</span>
          </label>
        );
      })}
      {over && <div style={{ fontSize: 13, color: '#b3261e', marginTop: 8 }}>Dual enrollment students can take up to {max} units a term.</div>}
    </div>
  );
}
