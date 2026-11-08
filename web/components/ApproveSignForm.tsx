'use client';
import { useEffect, useState } from 'react';
import { SignaturePad } from './SignaturePad';

const CURSIVE = '"Great Vibes", cursive';

/** Typed name rendered in a cursive script, turned into a PNG so it looks the same on the audit PDF. */
async function typedToPng(name: string): Promise<string> {
  await document.fonts.load(`64px ${CURSIVE}`).catch(() => undefined);
  const c = document.createElement('canvas');
  c.width = 900; c.height = 220;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#201e1d';
  let size = 96;
  do { ctx.font = `${size}px ${CURSIVE}`; size -= 4; } while (ctx.measureText(name).width > 840 && size > 30);
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 30, 115);
  return c.toDataURL('image/png');
}

export type PendingClass = { id: number; term_id: number | null; code: string; title: string; term_name: string | null };

/**
 * High school approval, one decision per class per term, then "Approve & sign digitally" once for the batch.
 * Staff use their saved signature, draw one, or type their name (shown in cursive). Declining needs a note.
 */
export function ApproveSignForm({ studentId, staffName, savedUrl, pending, approve, hidden = {} }: {
  studentId: number;
  /** Extra hidden fields (e.g. the approver link token for an outside approver). */
  hidden?: Record<string, string>;
  staffName: string;
  savedUrl: string | null;
  pending: PendingClass[];
  approve: (fd: FormData) => Promise<void>;
}) {
  const key = (c: PendingClass) => `d_${c.id}_${c.term_id ?? 0}`;
  const [dec, setDec] = useState<Record<string, 'approve' | 'decline'>>(() => Object.fromEntries(pending.map((c) => [key(c), 'approve'])));
  const get = (c: PendingClass) => dec[key(c)] ?? 'approve';
  const anyApproved = pending.some((c) => get(c) === 'approve');
  const anyDeclined = pending.some((c) => get(c) === 'decline');
  const [mode, setMode] = useState<'saved' | 'draw' | 'type'>(savedUrl ? 'saved' : 'draw');
  const [drawn, setDrawn] = useState('');
  const [typed, setTyped] = useState(staffName);
  const [typedPng, setTypedPng] = useState('');
  useEffect(() => {
    if (mode !== 'type' || !typed.trim()) { setTypedPng(''); return; }
    let live = true;
    typedToPng(typed.trim()).then((png) => live && setTypedPng(png));
    return () => { live = false; };
  }, [mode, typed]);
  const signature = mode === 'draw' ? drawn : mode === 'type' ? typedPng : '';
  const ready = !anyApproved || mode === 'saved' || !!signature;

  return (
    <form style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <input type="hidden" name="studentId" value={studentId} />
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input type="hidden" name="sign_mode" value={mode} />
      <input type="hidden" name="signature" value={signature} />
      <input type="hidden" name="signed_name" value={mode === 'type' ? typed.trim() : staffName} />
      <div className="pad-sm" style={{ padding: '20px 32px 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="kicker-sm">Decide each class</div>
        {pending.map((c) => (
          <div key={key(c)} data-class={c.code} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 14, padding: '6px 0', borderBottom: '1px solid var(--color-divider)' }}>
            <span><strong>{c.code}</strong> · {c.title}<span className="ink60"> · {c.term_name ?? 'No term'}</span></span>
            <input type="hidden" name={key(c)} value={get(c)} />
            <div className="seg seg-ink" role="radiogroup" aria-label={`Decision for ${c.code}`}>
              <label className="seg-opt"><input type="radio" checked={get(c) === 'approve'} onChange={() => setDec({ ...dec, [key(c)]: 'approve' })} />Approve</label>
              <label className="seg-opt"><input type="radio" checked={get(c) === 'decline'} onChange={() => setDec({ ...dec, [key(c)]: 'decline' })} />Decline</label>
            </div>
          </div>
        ))}
      </div>
      <div className="field pad-sm" style={{ padding: '12px 32px 8px' }}>
        <label htmlFor="note">Note to student {anyDeclined ? '(required: say why a class was declined)' : '(optional)'}</label>
        <textarea id="note" name="note" className="input" maxLength={1000} required={anyDeclined} style={{ minHeight: 64, resize: 'none' }} />
      </div>
      {anyApproved && <div className="pad-sm" style={{ padding: '8px 32px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="kicker-sm">Your signature</div>
        <div className="seg seg-ink" role="radiogroup" aria-label="How to sign" style={{ alignSelf: 'flex-start' }}>
          {savedUrl && <label className="seg-opt"><input type="radio" checked={mode === 'saved'} onChange={() => setMode('saved')} />Saved</label>}
          <label className="seg-opt"><input type="radio" checked={mode === 'draw'} onChange={() => setMode('draw')} />Draw</label>
          <label className="seg-opt"><input type="radio" checked={mode === 'type'} onChange={() => setMode('type')} />Type</label>
        </div>
        {mode === 'saved' && savedUrl && (
          <div style={{ border: '2px solid var(--color-text)', background: '#fff', padding: 8 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={savedUrl} alt="Your saved signature" style={{ maxHeight: 90, margin: '0 auto' }} />
          </div>
        )}
        {mode === 'draw' && <SignaturePad onChange={setDrawn} />}
        {mode === 'type' && (
          <>
            <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type your name" maxLength={80} />
            <div aria-hidden style={{ border: '2px solid var(--color-text)', background: '#fff', padding: '6px 16px', fontFamily: CURSIVE, fontSize: 44, lineHeight: 1.3, minHeight: 70, overflow: 'hidden', whiteSpace: 'nowrap' }}>{typed}</div>
          </>
        )}
        {mode !== 'saved' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" name="save_signature" defaultChecked style={{ accentColor: 'var(--color-accent)' }} /> Save as my signature for next time
          </label>
        )}
      </div>}
      <div className="pad-sm" style={{ marginTop: 'auto', padding: '16px 32px 28px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '2px solid var(--color-text)' }}>
        <button formAction={approve} disabled={!ready} className="btn btn-primary" style={{ justifyContent: 'space-between', padding: '14px 16px', fontSize: 15 }}>
          {anyApproved ? (anyDeclined ? 'Save decisions & sign digitally' : 'Approve & sign digitally') : 'Decline & send back'} <span>→</span>
        </button>
      </div>
    </form>
  );
}
