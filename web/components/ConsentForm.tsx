'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { SignaturePad } from './SignaturePad';

const MAX = 10 * 1024 * 1024;
const OK_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export function ConsentForm({
  action, studentId, studentFirst, term, parentName, error,
}: {
  action: (fd: FormData) => Promise<void>;
  studentId: number;
  studentFirst: string;
  term: string;
  parentName: string;
  error?: string;
}) {
  const [mode, setMode] = useState<'esign' | 'upload'>('esign');
  const [sig, setSig] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileErr, setFileErr] = useState('');
  const [agree, setAgree] = useState(false);
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined | null) => {
    setFileErr('');
    if (!f) return;
    if (!OK_TYPES.includes(f.type)) return setFileErr('Use a PDF, JPG or PNG file.');
    if (f.size > MAX) return setFileErr('That file is over 10 MB.');
    setFile(f);
    // Mirror into the real file input so it posts with the form (covers drag-and-drop).
    if (inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(f);
      inputRef.current.files = dt.files;
    }
  };
  const ready = agree && (mode === 'esign' ? !!sig : !!file);

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="method" value={mode} />
      <input type="hidden" name="signature" value={mode === 'esign' ? sig : ''} />
      {error && <div className="flash flash-err" style={{ padding: '12px 16px' }}>{error}</div>}

      <div className="seg seg-ink" role="radiogroup" aria-label="How do you want to sign?" style={{ alignSelf: 'flex-start' }}>
        <label className="seg-opt"><input type="radio" checked={mode === 'esign'} onChange={() => setMode('esign')} />Sign online</label>
        <label className="seg-opt"><input type="radio" checked={mode === 'upload'} onChange={() => setMode('upload')} />Upload signed form</label>
      </div>

      {mode === 'esign' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field" style={{ maxWidth: 420 }}>
            <label htmlFor="signer">Your full name</label>
            <input id="signer" name="signer" className="input" required defaultValue={parentName} autoComplete="name" />
          </div>
          <div className="field">
            <label>Signature</label>
            <SignaturePad onChange={setSig} />
          </div>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
            className="pad-sm"
            style={{ border: '2px dashed var(--color-accent)', background: over ? 'var(--color-accent-200)' : 'var(--color-accent-100)', padding: 40, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}
          >
            <div style={{ fontSize: 22, fontWeight: 800 }}>Drop the signed form here</div>
            <div style={{ fontSize: 14, color: 'var(--color-accent-800)' }}>PDF, JPG or PNG · up to 10 MB · a clear phone photo works</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>Choose file</button>
              <a className="btn btn-secondary" href="/consent/blank" target="_blank">Download blank form</a>
            </div>
            <input ref={inputRef} type="file" name="file" accept="application/pdf,image/jpeg,image/png" hidden onChange={(e) => pick(e.target.files?.[0])} />
            <input type="hidden" name="signer" value={parentName} />
            {fileErr && <div style={{ color: '#b3261e', fontSize: 13 }}>{fileErr}</div>}
          </div>
          {file && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="kicker-sm" style={{ paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>Uploaded</div>
              <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr auto auto', gap: 16, alignItems: 'center', padding: '14px 0', borderBottom: '2px solid var(--color-divider)' }}>
                <div style={{ width: 44, height: 52, background: 'var(--color-surface)', border: '1px solid var(--color-divider)', display: 'flex', alignItems: 'flex-end', padding: 4, fontSize: 9, fontWeight: 800 }}>
                  {file.type === 'application/pdf' ? 'PDF' : file.type === 'image/png' ? 'PNG' : 'JPG'}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div style={{ marginTop: 8, maxWidth: 260, height: 4, background: 'var(--color-accent)' }} />
                </div>
                <span className="tag tag-accent">Ready</span>
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--color-accent-700)' }} onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }}>Remove</button>
              </div>
            </div>
          )}
        </>
      )}

      <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 14, maxWidth: 640, cursor: 'pointer' }}>
        <input type="checkbox" name="agree" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
        <span aria-hidden style={{ width: 20, height: 20, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: agree ? 'var(--color-accent)' : 'transparent', color: '#fff', border: agree ? 0 : '2px solid var(--color-text)' }}>{agree ? '✓' : ''}</span>
        I'm {studentFirst}'s parent or legal guardian and I give permission for {studentFirst} to enroll in Shasta College courses for {term}.
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
