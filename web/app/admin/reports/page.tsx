import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { primarySchoolIds } from '@/lib/access';
import { average, clearUnitsRecords, formatHours, hoursBetween, waitingNow } from '@/lib/reports';
import { fmt, now } from '@/lib/workflow';
import { currentClassYear } from '@/lib/workflow';
import { canExportSeniors, seniorsWithPlans } from '@/lib/seniors';
import { AdminShell } from '@/components/AdminShell';

export const dynamic = 'force-dynamic';

type Admin = { id: number; first_name: string; last_name: string; admin_level: string | null };

export default async function Reports({ searchParams }: { searchParams: Promise<{ admin?: string }> }) {
  const me = await requireAdmin('college');
  const sp = await searchParams;
  const isSuper = me.admin_level === 'super';
  const admins = db().prepare("SELECT id, first_name, last_name, admin_level FROM users WHERE role = 'admin' AND status = 'active' ORDER BY first_name").all() as Admin[];
  // College admins see their own report; super admins can look at anyone's.
  const who = (isSuper && admins.find((a) => a.id === Number(sp.admin))) || admins.find((a) => a.id === me.id)!;
  const primary = primarySchoolIds(who.id);
  const schools = db().prepare('SELECT id, name FROM schools ORDER BY name').all() as { id: number; name: string }[];
  const mySchools = schools.filter((s) => primary.includes(s.id));

  const records = clearUnitsRecords();
  const waiting = waitingNow();
  const t = now();
  const waitOf = (ids: number[]) => {
    const done = records.filter((r) => ids.includes(r.schoolId) && r.readyAt && r.clearedAt);
    const open = waiting.filter((w) => ids.includes(w.schoolId));
    return {
      cleared: done.length,
      avg: average(done.map((r) => hoursBetween(r.readyAt!, r.clearedAt!))),
      waitingNow: open.length,
      avgSoFar: average(open.map((w) => hoursBetween(w.readyAt, t))),
    };
  };
  const mine = records.filter((r) => r.adminId === who.id);
  const minePrimary = mine.filter((r) => primary.includes(r.schoolId)).length;
  const recent = [...mine].sort((a, b) => (b.clearedAt ?? '').localeCompare(a.clearedAt ?? '')).slice(0, 10);
  const schoolName = (id: number) => schools.find((s) => s.id === id)?.name ?? '—';
  const all = waitOf(primary);

  return (
    <AdminShell me={me} current="reports">
      <div className="admin-head pad-sm">
        <div><div className="kicker accent700">Reports</div><h1>{who.id === me.id ? 'Your report' : `${who.first_name} ${who.last_name}`}</h1></div>
        {isSuper && (
          <form action="/admin/reports" style={{ display: 'flex', gap: 8 }}>
            <select name="admin" className="input" defaultValue={who.id} style={{ width: 240 }}>
              {admins.map((a) => <option key={a.id} value={a.id}>{a.first_name} {a.last_name}{a.id === me.id ? ' (you)' : ''}</option>)}
            </select>
            <button className="btn btn-secondary">View</button>
          </form>
        )}
      </div>

      {canExportSeniors(me) && (() => {
        const seniors = seniorsWithPlans();
        const n = (v: string) => seniors.filter((x) => x.plans_shasta === v).length;
        return (
          <div className="pad-sm" style={{ padding: '20px 40px', borderBottom: '2px solid var(--color-divider)', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div className="kicker">Seniors&apos; plans after high school · Class of {currentClassYear()}</div>
              <div style={{ fontSize: 14, marginTop: 4 }}>{seniors.length} answered: {n('yes')} yes, {n('unsure')} not sure, {n('no')} no</div>
            </div>
            <a className="btn btn-secondary" href="/admin/seniors.csv">Download CSV</a>
          </div>
        );
      })()}
      <div className="pad-sm" style={{ padding: '24px 40px 8px' }}><div className="kicker">Clear units tasks completed{who.id === me.id ? ' by you' : ''}</div></div>
      <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: '2px solid var(--color-text)', borderBottom: '2px solid var(--color-text)' }}>
        <Stat label="Total" value={mine.length} hero />
        <Stat label="For primary schools" value={minePrimary} />
        <Stat label="Outside primary schools" value={mine.length - minePrimary} last />
      </div>

      <div className="pad-sm" style={{ padding: '32px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kicker">Average wait on Clear units · primary schools</div>
        {mySchools.length === 0 ? (
          <p className="ink60" style={{ margin: 0, fontSize: 14 }}>No primary schools assigned yet. A super admin can set them under Users.</p>
        ) : (
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>School</th><th>Cleared</th><th>Average wait</th><th>Waiting now</th><th>Waiting so far (avg)</th></tr></thead>
            <tbody>
              {mySchools.map((s) => {
                const w = waitOf([s.id]);
                return (
                  <tr key={s.id}><td><strong>{s.name}</strong></td><td>{w.cleared}</td><td>{formatHours(w.avg)}</td><td>{w.waitingNow}</td><td>{formatHours(w.avgSoFar)}</td></tr>
                );
              })}
              {mySchools.length > 1 && (
                <tr style={{ fontWeight: 800 }}><td>All primary schools</td><td>{all.cleared}</td><td>{formatHours(all.avg)}</td><td>{all.waitingNow}</td><td>{formatHours(all.avgSoFar)}</td></tr>
              )}
            </tbody>
          </table>
        )}
        <p className="ink60" style={{ margin: 0, fontSize: 13 }}>Wait is measured from when a student lands in the Clear units queue (the step before it is finished) until their units are cleared.</p>
      </div>

      <div className="pad-sm" style={{ padding: '0 40px 40px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="kicker">Recently cleared{who.id === me.id ? ' by you' : ''}</div>
        {recent.length === 0 ? <p className="ink60" style={{ margin: 0, fontSize: 14 }}>None yet.</p> : (
          <table className="table" style={{ width: '100%' }}>
            <thead><tr><th>Student</th><th>School</th><th>Cleared</th><th>Waited</th></tr></thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.studentId}>
                  <td><strong>{r.student}</strong></td>
                  <td>{schoolName(r.schoolId)}{primary.includes(r.schoolId) ? '' : <span className="tag tag-neutral" style={{ marginLeft: 8 }}>Outside</span>}</td>
                  <td>{fmt(r.clearedAt, 'mdy')}</td>
                  <td>{r.readyAt && r.clearedAt ? formatHours(hoursBetween(r.readyAt, r.clearedAt)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, hero, last }: { label: string; value: number; hero?: boolean; last?: boolean }) {
  return (
    <div className="pad-sm noborder-sm" style={{ padding: '20px 40px', borderRight: last ? undefined : '2px solid var(--color-divider)', background: hero ? 'var(--color-accent)' : undefined, color: hero ? '#fff' : undefined }}>
      <div style={{ fontSize: 13, color: hero ? 'var(--color-accent-100)' : 'var(--ink-60)' }}>{label}</div>
      <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}
