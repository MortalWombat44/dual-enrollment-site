import { requireAdmin } from '@/lib/auth';
import { studentsForIds } from '@/lib/audit-pdf';
import { allTerms, getProgress } from '@/lib/workflow';
import { AdminShell, AdminHead } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

type SP = { ids?: string; term?: string | string[] };

/** Super admin audit: paste Shasta College IDs, pick terms, download consent + course requests as a PDF. */
export default async function Audit({ searchParams }: { searchParams: Promise<SP> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const terms = allTerms();
  const picked = (Array.isArray(sp.term) ? sp.term : sp.term ? [sp.term] : []).map(Number).filter(Boolean);
  const matches = sp.ids ? studentsForIds(sp.ids) : [];
  const found = matches.flatMap((m) => m.students.map((s) => s.id));
  const qs = new URLSearchParams();
  for (const id of found) qs.append('student', String(id));
  for (const t of picked) qs.append('term', String(t));

  return (
    <AdminShell me={me} current="audit">
      <AdminHead title="Audit" />
      <form action="/admin/audit" className="pad-sm" style={{ padding: '24px 40px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 820 }}>
        <div style={{ fontSize: 14 }}>
          Paste one or more Shasta College IDs (separated by spaces, commas or new lines) and pick the term(s). The PDF has each student's
          parent consent form and their course requests for those terms, with the high school staff signature where the school requires high school approval.
        </div>
        <div className="field">
          <label htmlFor="ids">Shasta College IDs</label>
          <textarea id="ids" name="ids" className="input" defaultValue={sp.ids ?? ''} placeholder={'0412893\n0412910'} style={{ minHeight: 110, fontFamily: 'ui-monospace, Menlo, monospace' }} required />
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <legend className="field" style={{ fontSize: 12, marginBottom: 6, color: 'var(--ink-65)' }}>Terms (none checked = all terms)</legend>
          {terms.map((t) => (
            <label key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" name="term" value={t.id} defaultChecked={picked.includes(t.id)} style={{ width: 18, height: 18, accentColor: 'var(--color-accent)' }} /> {t.name}
            </label>
          ))}
        </fieldset>
        <div><button className="btn btn-primary bigbtn" style={{ minWidth: 260 }}>Find students <span>→</span></button></div>
      </form>

      {sp.ids && (
        <div className="pad-sm" style={{ padding: '0 40px 48px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTop: '2px solid var(--color-text)', paddingTop: 16 }}>
            <span style={{ fontSize: 14 }}><strong>{found.length}</strong> student{found.length === 1 ? '' : 's'} found from {matches.length} ID{matches.length === 1 ? '' : 's'}</span>
            {found.length > 0 && <a className="btn btn-primary" href={`/admin/audit.pdf?${qs}`} style={{ justifyContent: 'space-between', minWidth: 240 }}>Download PDF ({found.length}) <span>↓</span></a>}
          </div>
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>ID</th><th>Student</th><th>School</th><th>Consent</th><th>Requests</th><th>HS signature</th><th /></tr></thead>
            <tbody>
              {matches.map((m) => m.students.length === 0 ? (
                <tr key={m.id}><td><code>{m.id}</code></td><td colSpan={6}><span className="tag" style={{ background: '#fdecea', color: '#6b1a12' }}>No student with this ID</span></td></tr>
              ) : m.students.map((s) => {
                const p = getProgress(s.id)!;
                const consent = p.steps.find((x) => x.id === 3);
                const hs = p.steps.find((x) => x.id === 4);
                const inTerms = p.courses.filter((c) => !picked.length || (c.term_id && picked.includes(c.term_id)));
                const one = new URLSearchParams({ student: String(s.id) });
                for (const t of picked) one.append('term', String(t));
                return (
                  <tr key={`${m.id}-${s.id}`}>
                    <td><code>{m.id}</code>{m.students.length > 1 && <span className="tag" style={{ marginLeft: 6, background: '#fdecea', color: '#6b1a12' }}>Shared ID</span>}</td>
                    <td><a href={`/admin/students?tab=all&student=${s.id}`}><strong>{s.name}</strong></a></td>
                    <td>{s.school}</td>
                    <td>{consent?.status === 'complete' ? <span className="tag tag-accent">On file</span> : consent ? <span className="tag tag-neutral">Missing</span> : 'Not required'}</td>
                    <td>{inTerms.length ? inTerms.map((c) => c.code).join(', ') : '—'}</td>
                    <td>{!hs ? 'Not required' : hs.status !== 'complete' ? <span className="tag tag-neutral">Not approved</span> : hs.data?.signature_file_id ? <span className="tag tag-accent">Signed</span> : <span className="tag tag-neutral">No signature</span>}</td>
                    <td><a href={`/admin/audit.pdf?${one}`}>PDF</a></td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      )}
    </AdminShell>
  );
}
