import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { addSchool } from '@/lib/admin-actions';
import { AdminShell, AdminHead } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

type Row = { id: number; name: string; district: string; designation: 'CCAP' | 'NON_CCAP'; required: number; total: number; students: number };

export default async function SchoolsPage({ searchParams }: { searchParams: Promise<{ add?: string; error?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const rows = db().prepare(`
    SELECT s.id, s.name, s.district, s.designation,
      (SELECT COUNT(*) FROM school_steps ss WHERE ss.school_id = s.id AND ss.mode = 'required') AS required,
      (SELECT COUNT(*) FROM steps) AS total,
      (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role = 'student') AS students
    FROM schools s ORDER BY s.name`).all() as Row[];
  const ccap = rows.filter((r) => r.designation === 'CCAP').length;

  return (
    <AdminShell me={me} current="schools">
      <AdminHead title="Schools" action={<Link href="/admin/schools?add=1" className="btn btn-primary btn-wide">Add school <span>+</span></Link>} />
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderBottom: '2px solid var(--color-divider)' }}>
        <div className="pad-sm noborder-sm" style={{ padding: '20px 40px', borderRight: '2px solid var(--color-divider)' }}><div style={{ fontSize: 13 }}>Partner schools</div><div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{rows.length}</div></div>
        <div className="pad-sm noborder-sm" style={{ padding: '20px 32px', borderRight: '2px solid var(--color-divider)' }}><div style={{ fontSize: 13 }}>CCAP</div><div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1, color: 'var(--color-accent)' }}>{ccap}</div></div>
        <div className="pad-sm" style={{ padding: '20px 32px' }}><div style={{ fontSize: 13 }}>Non-CCAP</div><div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1.1 }}>{rows.length - ccap}</div></div>
      </div>
      <div className="pad-sm" style={{ padding: '20px 40px 40px', overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>School</th><th>District</th><th>Designation</th><th>Required steps</th><th>Students</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong></td>
                <td>{r.district}</td>
                <td>{r.designation === 'CCAP' ? <span className="tag tag-accent">CCAP</span> : <span className="tag tag-outline">Non-CCAP</span>}</td>
                <td>{r.required} of {r.total}</td>
                <td>{r.students}</td>
                <td><Link href={`/admin/schools/${r.id}`}>Edit steps</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sp.add && (
        <div className="modal-back" role="dialog" aria-modal="true" aria-labelledby="add-school-title">
          <form action={addSchool} className="modal">
            <div className="modal-head"><h2 id="add-school-title">Add school</h2><p>Steps start from the CCAP or Non-CCAP defaults. You can change them next.</p></div>
            <div className="modal-body">
              {sp.error && <div className="flash flash-err" style={{ padding: '10px 14px' }}>Enter the school and district names.</div>}
              <div className="field"><label htmlFor="name">School name</label><input id="name" name="name" className="input" required autoFocus /></div>
              <div className="field"><label htmlFor="district">District</label><input id="district" name="district" className="input" required /></div>
              <div className="field">
                <label>Designation</label>
                <div className="seg" style={{ display: 'flex' }} role="radiogroup" aria-label="Designation">
                  <label className="seg-opt" style={{ flex: 1 }}><input type="radio" name="designation" value="CCAP" defaultChecked />CCAP</label>
                  <label className="seg-opt" style={{ flex: 1 }}><input type="radio" name="designation" value="NON_CCAP" />Non-CCAP</label>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-primary" style={{ minWidth: 200, justifyContent: 'space-between', padding: '12px 16px' }}>Add school <span>→</span></button>
              <Link href="/admin/schools" className="btn btn-secondary">Cancel</Link>
            </div>
          </form>
        </div>
      )}
    </AdminShell>
  );
}
