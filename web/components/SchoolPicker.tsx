'use client';
import { useState } from 'react';

/**
 * High school choice: the listed schools, "Other (not listed)" (type the school, plus the name and email of the
 * person who approves dual enrollment classes there), or "Other - Homeschooled" (needs the Private School Affidavit).
 */
export function SchoolPicker({ schools, defaultValue = '', label = 'Your high school' }: {
  schools: { id: number; name: string; district: string }[];
  defaultValue?: string;
  label?: string;
}) {
  const [v, setV] = useState(defaultValue);
  return (
    <>
      <div className="field">
        <label htmlFor="school">{label}</label>
        <select id="school" name="school" className="input" required value={v} onChange={(e) => setV(e.target.value)}>
          <option value="" disabled>Pick your high school…</option>
          {schools.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.district}</option>)}
          <option value="other">Other (my school isn&apos;t listed)</option>
          <option value="homeschool">Other - Homeschooled</option>
        </select>
      </div>
      {v === 'other' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderLeft: '4px solid var(--color-accent)', paddingLeft: 14 }}>
          <div className="field"><label htmlFor="other_school">High school name</label><input id="other_school" name="other_school" className="input" required maxLength={120} placeholder="e.g. Trinity High School" /></div>
          <div style={{ fontSize: 13 }} className="ink60">Who at your high school approves dual enrollment classes (usually your counselor)? We&apos;ll send them a link to approve your classes.</div>
          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label htmlFor="approver_name">Their name</label><input id="approver_name" name="approver_name" className="input" required maxLength={120} /></div>
            <div className="field"><label htmlFor="approver_email">Their email</label><input id="approver_email" name="approver_email" type="email" className="input" required maxLength={200} /></div>
          </div>
        </div>
      )}
      {v === 'homeschool' && (
        <div style={{ fontSize: 14, borderLeft: '4px solid var(--color-accent)', paddingLeft: 14 }}>
          Homeschooled students need a <strong>Private School Affidavit</strong>. You or your parent will upload it as one of your steps, and Shasta College reviews it.
        </div>
      )}
    </>
  );
}
