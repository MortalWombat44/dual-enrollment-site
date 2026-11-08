import { ageOn, fmt } from '@/lib/workflow';

type S = { date_of_birth: string | null; phone: string | null; email: string; address_line: string | null; city: string | null; state: string | null; zip: string | null; hs_approver_name?: string | null; hs_approver_email?: string | null };

/** Staff view: age / date of birth and contact info for a student. */
export function StudentContact({ s, approver }: { s: S; approver?: boolean }) {
  const age = ageOn(s.date_of_birth);
  return (
    <div className="ink60" style={{ fontSize: 13, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span>
        {s.date_of_birth ? <>Born {fmt(s.date_of_birth + 'T12:00:00Z', 'mdy')} · <strong style={{ color: age !== null && age >= 18 ? 'var(--color-accent-700)' : undefined }}>age {age}</strong>{age !== null && age >= 18 ? ' (no parent consent needed)' : ''}</> : 'No date of birth yet'}
      </span>
      <span>{s.email}{s.phone ? ` · ${s.phone}` : ''}</span>
      {s.address_line && <span>{s.address_line}, {s.city}, {s.state} {s.zip}</span>}
      {approver && s.hs_approver_email && <span>High school approver: {s.hs_approver_name} · {s.hs_approver_email}</span>}
    </div>
  );
}
