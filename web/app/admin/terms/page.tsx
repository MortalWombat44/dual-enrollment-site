import { requireAdmin } from '@/lib/auth';
import { saveTerm } from '@/lib/admin-actions';
import { currentTerm, fmt, toPacificInput } from '@/lib/workflow';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { Flash } from '@/components/chrome';

export const dynamic = 'force-dynamic';

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const t = currentTerm();
  const open = new Date(t.registration_opens).getTime() <= Date.now();
  return (
    <AdminShell me={me} current="terms">
      <AdminHead title="Terms" />
      <Flash msg={sp.saved ? `Saved. Registration opens ${fmt(t.registration_opens, 'wmd')} at ${fmt(t.registration_opens, 'time')} Pacific.` : null} />
      <Flash error msg={sp.error ? 'Enter a term name and a full date and time.' : null} />
      <form action={saveTerm} className="pad-sm" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
        <input type="hidden" name="id" value={t.id} />
        <div className="kicker">Current term</div>
        <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="field"><label htmlFor="name">Term name</label><input id="name" name="name" className="input" defaultValue={t.name} required /></div>
          <div className="field"><label htmlFor="opens">Registration opens (Pacific time)</label><input id="opens" name="opens" type="datetime-local" className="input" defaultValue={toPacificInput(t.registration_opens)} required /></div>
        </div>
        <div style={{ fontSize: 14 }}>
          Registration is <strong>{open ? 'open now' : `closed until ${fmt(t.registration_opens, 'mdy')}`}</strong>. Students who reach Register for classes before then see it locked, with this date.
        </div>
        <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20 }}>
          <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Save term <span>→</span></button>
        </div>
      </form>
    </AdminShell>
  );
}
