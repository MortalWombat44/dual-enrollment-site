'use client';
import { useState } from 'react';

/** Shows an invite link with Copy / Text / Email buttons (no email is sent by the app). */
export function InviteLink({ link, email, message, highlight }: { link: string; email: string; message: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', link);
    }
  };
  const subject = 'Please sign my Shasta College dual enrollment consent form';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {highlight && <div style={{ fontSize: 14, fontWeight: 700 }}>Invite ready. Send this link to them:</div>}
      <code style={{ fontSize: 12, wordBreak: 'break-all', background: 'var(--color-surface)', border: '1px solid var(--color-divider)', padding: '8px 10px' }}>{link}</code>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy link'}</button>
        <a className="btn btn-secondary" href={`sms:?&body=${encodeURIComponent(message)}`}>Send by text</a>
        <a className="btn btn-secondary" href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}>Send by email</a>
      </div>
    </div>
  );
}
