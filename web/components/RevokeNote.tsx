import { CONSENT_REVOKE_EMAIL } from '@/lib/constants';

/** Shown to a parent once consent is signed: consent is one-time, and how to revoke it. */
export function RevokeNote({ student }: { student: string }) {
  return (
    <div style={{ borderLeft: '4px solid var(--color-accent)', background: 'var(--color-accent-100)', padding: '14px 18px', fontSize: 14, lineHeight: 1.5 }}>
      <strong>Your consent for {student} is on file.</strong> It's a one-time consent that covers this and future terms.
      You may revoke consent at any time for your minor student by emailing{' '}
      {CONSENT_REVOKE_EMAIL ? <a href={`mailto:${CONSENT_REVOKE_EMAIL}`}>{CONSENT_REVOKE_EMAIL}</a> : <strong>[email address coming soon]</strong>}.
    </div>
  );
}
