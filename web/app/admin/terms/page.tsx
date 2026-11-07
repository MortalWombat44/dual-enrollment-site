import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { addTerm, saveTerm } from '@/lib/admin-actions';
import { allTerms, fmt, getTerm, toPacificInput } from '@/lib/workflow';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { Flash } from '@/components/chrome';

export const dynamic = 'force-dynamic';

const ERR: Record<string, string> = {
  fields: 'Enter a term name and a full date and time.',
  last: 'At least one term needs registration allowed, so students have somewhere to request classes.',
  exists: 'A term with that name already exists.',
};

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const terms = allTerms();
  // Students with at least one class requested in the term.
  const counts = new Map((db().prepare('SELECT term_id, COUNT(DISTINCT student_id) AS n FROM course_requests WHERE term_id IS NOT NULL GROUP BY term_id').all() as { term_id: number; n: number }[]).map((r) => [r.term_id, r.n]));
  const saved = sp.saved ? getTerm(Number(sp.saved)) : null;

  return (
    <AdminShell me={me} current="terms">
      <AdminHead title="Terms" />
      <Flash msg={saved ? `Saved ${saved.name}. Registration opens ${fmt(saved.registration_opens, 'wmd')} at ${fmt(saved.registration_opens, 'time')} Pacific.` : null} />
      <Flash error msg={sp.error ? ERR[sp.error] : null} />
      <div className="pad-sm" style={{ padding: '24px 40px 8px', fontSize: 14 }}>
        Several terms can take registrations at once. Students choose a term for each class they request, from the terms with registration allowed. Turning registration off stops new requests for that term and flags any existing ones to the student and to the admin clearing units. Usual unit limits: CCAP students 15 per term; non-CCAP students 11, or 7 in a summer term. Students can go over; they and the admin clearing units see a note.
      </div>
      <div className="pad-sm" style={{ padding: '16px 40px', display: 'flex', flexDirection: 'column' }}>
        <div className="kicker-sm" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr 120px 90px 70px 90px', gap: 12, paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>
          <span>Term</span><span>Registration opens (Pacific)</span><span>Registration allowed</span><span>Summer</span><span>Students</span><span />
        </div>
        {terms.map((t) => {
          const open = new Date(t.registration_opens).getTime() <= Date.now();
          return (
            <form key={t.id} action={saveTerm} className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.3fr 120px 90px 70px 90px', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '2px solid var(--color-divider)', background: saved?.id === t.id ? 'var(--color-accent-100)' : undefined }}>
              <input type="hidden" name="id" value={t.id} />
              <input name="name" className="input" defaultValue={t.name} required aria-label="Term name" />
              <div>
                <input name="opens" type="datetime-local" className="input" defaultValue={toPacificInput(t.registration_opens)} required aria-label="Registration opens" />
                <div className="ink60" style={{ fontSize: 12, marginTop: 4 }}>{open ? 'Registration is open' : `Opens ${fmt(t.registration_opens, 'mdy')}`}</div>
              </div>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
                <input type="checkbox" name="active" defaultChecked={t.is_current === 1} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} /> {t.is_current === 1 ? 'Allowed' : 'Off'}
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }} title="Non-CCAP students have a 7-unit limit in summer terms">
                <input type="checkbox" name="summer" defaultChecked={t.summer === 1} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} /> Summer
              </label>
              <span style={{ fontSize: 14 }}>{counts.get(t.id) ?? 0}</span>
              <button className="btn btn-secondary">Save</button>
            </form>
          );
        })}
      </div>
      <form action={addTerm} className="pad-sm" style={{ margin: '16px 40px 40px', border: '2px solid var(--color-text)', padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 760 }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>Add a term</div>
        <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label htmlFor="tname">Term name</label><input id="tname" name="name" className="input" placeholder="e.g. Fall 2027" required /></div>
          <div className="field"><label htmlFor="topens">Registration opens (Pacific time)</label><input id="topens" name="opens" type="datetime-local" className="input" required /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" name="summer" style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} /> Summer term (non-CCAP students: 7-unit limit instead of 11)
        </label>
        <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 260 }}>Add term <span>→</span></button></div>
      </form>
    </AdminShell>
  );
}
