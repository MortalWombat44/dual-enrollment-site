'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useFormStatus } from 'react-dom';
import { SignaturePad } from './SignaturePad';


/** Parent consent: digital signature only (uploading a signed form is turned off). */
export function ConsentForm({
  action, studentId, studentFirst, parentName, error,
}: {
  action: (fd: FormData) => Promise<void>;
  studentId: number;
  studentFirst: string;
  parentName: string;
  error?: string;
}) {
  const [sig, setSig] = useState('');
  const [agree, setAgree] = useState(false);
  const ready = agree && !!sig;

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="method" value="esign" />
      <input type="hidden" name="signature" value={sig} />
      {error && <div className="flash flash-err" style={{ padding: '12px 16px' }}>{error}</div>}

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
