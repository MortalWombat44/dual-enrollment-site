'use client';
import { useState } from 'react';

export function ShareToggle({ action, initial }: { action: (fd: FormData) => Promise<void>; initial: boolean }) {
  const [on, setOn] = useState(initial);
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 15, cursor: 'pointer', border: '2px solid var(--color-text)', padding: '16px 18px', background: on ? 'var(--color-accent-100)' : undefined }}>
        <input type="checkbox" name="share" checked={on} onChange={(e) => setOn(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <span aria-hidden style={{ width: 22, height: 22, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, background: on ? 'var(--color-accent)' : 'transparent', color: '#fff', border: on ? 0 : '2px solid var(--color-text)' }}>{on ? '✓' : ''}</span>
        <span>
          <strong>Let my parent / guardian accounts see my progress</strong>
          <span style={{ display: 'block', fontSize: 13, marginTop: 4 }}>
            They'll see your steps, courses, dates, documents and counselor review. When this is off, they only see whether their consent is needed.
          </span>
        </span>
      </label>
      <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20 }}>
        <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }} disabled={on === initial}>Save <span>→</span></button>
      </div>
    </form>
  );
}
