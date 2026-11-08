'use client';
import Link from 'next/link';
import { useState } from 'react';

type Mode = 'required' | 'optional' | 'off';
type Des = 'CCAP' | 'NON_CCAP';
type Step = { id: number; name: string; description: string };

function stepNote(s: Step, mode: Mode, des: Des) {
  if (s.id === 4) return des === 'CCAP' ? 'Not used at CCAP schools (set by designation)' : 'Every class, every term (set by designation)';
  return s.description;
}

export function SchoolEditor({
  action, school, steps, initialModes, defaults, inProgress, header,
}: {
  action: (fd: FormData) => Promise<void>;
  school: { id: number; designation: Des; agreement_id: string | null; agreement_expires: string | null };
  steps: Step[];
  initialModes: Record<number, Mode>;
  defaults: Record<Des, Record<number, Mode>>;
  inProgress: number;
  header: React.ReactNode;
}) {
  const [des, setDes] = useState<Des>(school.designation);
  const [modes, setModes] = useState<Record<number, Mode>>(initialModes);
  const noneRequired = !Object.values(modes).includes('required');

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <input type="hidden" name="id" value={school.id} />
      <input type="hidden" name="designation" value={des} />
      <div className="admin-head pad-sm" style={{ paddingTop: 8 }}>
        {header}
        <div style={{ display: 'flex', gap: 10 }}>
          <Link href="/admin/schools" className="btn btn-secondary">Cancel</Link>
          <button className="btn btn-primary" disabled={noneRequired} style={{ minWidth: 160, justifyContent: 'space-between', padding: '12px 16px' }}>Save changes <span>→</span></button>
        </div>
      </div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="pad-sm noborder-sm" style={{ padding: '24px 40px', borderRight: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="kicker">Designation</div>
          <div role="radiogroup" aria-label="Designation" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '2px solid var(--color-text)' }}>
            {([['CCAP', 'Partnership agreement on file'], ['NON_CCAP', 'Standard special admit']] as const).map(([v, sub]) => {
              const on = des === v;
              return (
                <button
                  key={v} type="button" role="radio" aria-checked={on} onClick={() => setDes(v)}
                  style={{ padding: '14px 16px', textAlign: 'left', border: 0, cursor: 'pointer', background: on ? 'var(--color-accent)' : 'transparent', color: on ? '#fff' : 'var(--color-text)' }}
                >
                  <div style={{ fontWeight: 800, fontSize: 16 }}>{v === 'CCAP' ? 'CCAP' : 'Non-CCAP'}</div>
                  <div style={{ fontSize: 12, marginTop: 2, color: on ? 'var(--color-accent-100)' : undefined }}>{sub}</div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="pad-sm" style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 12, opacity: des === 'CCAP' ? 1 : 0.45 }}>
          <div className="kicker">CCAP agreement</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field"><label htmlFor="ag">Agreement ID</label><input id="ag" name="agreement_id" className="input" defaultValue={school.agreement_id ?? ''} disabled={des !== 'CCAP'} /></div>
            <div className="field"><label htmlFor="exp">Expires</label><input id="exp" name="agreement_expires" type="date" className="input" defaultValue={school.agreement_expires ?? ''} disabled={des !== 'CCAP'} /></div>
          </div>
        </div>
      </div>
      <div className="pad-sm" style={{ padding: '24px 40px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div className="kicker">Steps for this school</div>
          <button type="button" className="btn btn-ghost" style={{ fontSize: 13, fontWeight: 400, fontFamily: 'var(--font-body)', color: 'var(--color-accent-700)', textDecoration: 'underline' }} onClick={() => setModes({ ...defaults[des] })}>
            Reset to {des === 'CCAP' ? 'CCAP' : 'Non-CCAP'} defaults
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', borderTop: '2px solid var(--color-text)' }}>
          {steps.map((s, i) => {
            // High school approval follows the designation: never at CCAP schools, always at Non-CCAP schools.
            const mode = s.id === 4 ? (des === 'CCAP' ? 'off' : 'required') : modes[s.id] ?? 'required';
            const off = mode === 'off';
            return (
              <div key={s.id} className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '56px 1fr 320px', alignItems: 'center', padding: '16px 0', borderBottom: '2px solid var(--color-divider)', gap: 8, color: off ? 'var(--ink-55)' : undefined }}>
                <span style={{ fontSize: 24, fontWeight: 800, color: off ? undefined : mode === 'optional' ? 'var(--color-accent-700)' : 'var(--color-accent)' }}>{String(i + 1).padStart(2, '0')}</span>
                <div><div style={{ fontWeight: 700, fontSize: 15 }}>{s.name}</div><div style={{ fontSize: 13 }}>{stepNote(s, mode, des)}</div></div>
                <div className="seg seg-modes" role="radiogroup" aria-label={`${s.name} setting`} style={{ display: 'flex', justifySelf: 'end', color: 'var(--color-text)' }}>
                  {(['required', 'optional', 'off'] as const).map((m) => (
                    <label key={m} className="seg-opt" data-v={m}>
                      <input type="radio" name={`step_${s.id}`} value={m} checked={mode === m} disabled={s.id === 4 && mode !== m} onChange={() => setModes((x) => ({ ...x, [s.id]: m }))} />
                      {m === 'required' ? 'Required' : m === 'optional' ? 'Optional' : 'Off'}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        {noneRequired && <div style={{ fontSize: 13, color: '#b3261e' }}>At least one step has to be required.</div>}
        <div style={{ fontSize: 13, marginTop: 4 }}>
          Changes apply to students who haven't started yet.{inProgress > 0 && ` ${inProgress} student${inProgress === 1 ? '' : 's'} in progress keep${inProgress === 1 ? 's' : ''} their current steps.`}
        </div>
      </div>
    </form>
  );
}
