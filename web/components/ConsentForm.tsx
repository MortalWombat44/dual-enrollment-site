'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { SignaturePad } from './SignaturePad';
import { CURSIVE, typedToPng } from './typed-signature';


/** Parent consent: digital signature only, drawn or typed (shown in a cursive script). Uploading a signed form is turned off. */
export function ConsentForm({
  action, studentId, studentFirst, parentName, error,
}: {
  action: (fd: FormData) => Promise<void>;
  studentId: number;
  studentFirst: string;
  parentName: string;
  error?: string;
}) {
  const [mode, setMode] = useState<'draw' | 'type'>('draw');
  const [drawn, setDrawn] = useState('');
  const [name, setName] = useState(parentName);
  const [typedPng, setTypedPng] = useState('');
  const [agree, setAgree] = useState(false);
  // Typing: the signature is the full name above, in cursive.
  useEffect(() => {
    if (mode !== 'type' || !name.trim()) { setTypedPng(''); return; }
    let live = true;
    typedToPng(name.trim()).then((png) => live && setTypedPng(png));
    return () => { live = false; };
  }, [mode, name]);
  const sig = mode === 'draw' ? drawn : typedPng;
  const ready = agree && !!sig && !!name.trim();

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="method" value="esign" />
      <input type="hidden" name="signature" value={sig} />
      <input type="hidden" name="sign_mode" value={mode} />
      {error && <div className="flash flash-err" style={{ padding: '12px 16px' }}>{error}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="field" style={{ maxWidth: 420 }}>
          <label htmlFor="signer">Your full name</label>
          <input id="signer" name="signer" className="input" required value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
        </div>
        <div className="field">
          <label>Signature</label>
          <div className="seg seg-ink" role="radiogroup" aria-label="How to sign" style={{ alignSelf: 'flex-start', marginBottom: 8 }}>
            <label className="seg-opt"><input type="radio" checked={mode === 'draw'} onChange={() => setMode('draw')} />Draw</label>
            <label className="seg-opt"><input type="radio" checked={mode === 'type'} onChange={() => setMode('type')} />Type</label>
          </div>
          {mode === 'draw' && <SignaturePad onChange={setDrawn} />}
          {mode === 'type' && (
            <>
              <div data-typed-signature aria-label={`Signature: ${name}`} style={{ border: '2px solid var(--color-text)', background: '#fff', padding: '6px 16px', fontFamily: CURSIVE, fontSize: 44, lineHeight: 1.3, minHeight: 70, overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 640 }}>{name}</div>
              <div className="ink60" style={{ fontSize: 13, marginTop: 6 }}>Your full name above, shown as your signature. Change the name to change it.</div>
            </>
          )}
        </div>
      </div>

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, maxWidth: 640, cursor: 'pointer' }}>
        <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <span aria-hidden style={{ width: 20, height: 20, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: agree ? 'var(--color-accent)' : 'transparent', color: '#fff', border: agree ? 0 : '2px solid var(--color-text)' }}>{agree ? '✓' : ''}</span>
        I'm {studentFirst}'s parent or legal guardian and I give permission for {studentFirst} to enroll in Shasta College courses through dual enrollment and concurrent enrollment, now and in future terms. I understand this is a one-time consent that I can revoke at any time.
      </label>

      <div style={{ display: 'flex', gap: 12, borderTop: '2px solid var(--color-text)', paddingTop: 20, flexWrap: 'wrap' }}>
        <Submit disabled={!ready} />
        <Link href="/parent" className="btn btn-secondary">Not now</Link>
      </div>
    </form>
  );
}

function Submit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }} disabled={disabled || pending}>
      {pending ? 'Submitting…' : 'Submit consent'} <span>→</span>
    </button>
  );
}
