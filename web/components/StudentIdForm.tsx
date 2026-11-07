'use client';
import { useState } from 'react';

/**
 * Step 01: the Shasta College ID from CCCApply. Students can skip for now with a checkbox,
 * but they're told they'll come back here until they add it.
 */
export function StudentIdForm({ action, initial, allowSkip, submitLabel }: {
  action: (fd: FormData) => Promise<void>;
  initial: string;
  allowSkip: boolean;
  submitLabel: string;
}) {
  const [skip, setSkip] = useState(false);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="sid">Shasta College ID</label>
        <input id="sid" name="student_number" className="input" defaultValue={initial} required={!skip} disabled={skip} placeholder="From your CCCApply / Shasta College email" />
      </div>
      {allowSkip && (
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, cursor: 'pointer', maxWidth: 620 }}>
          <input type="checkbox" name="skip" checked={skip} onChange={(e) => setSkip(e.target.checked)} style={{ width: 18, height: 18, marginTop: 2, accentColor: 'var(--color-accent)' }} />
          <span>I've applied on CCCApply but don't have my Shasta College ID yet.</span>
        </label>
      )}
      {skip && (
        <div style={{ fontSize: 14, background: '#fff4e0', color: '#8a4b00', borderLeft: '4px solid #d08a00', padding: '10px 14px', maxWidth: 620 }}>
          You can keep going for now, but you'll come back to this step each time you sign in until you add your Shasta College ID.
        </div>
      )}
      <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>{skip ? 'Skip for now' : submitLabel} <span>→</span></button></div>
    </form>
  );
}
