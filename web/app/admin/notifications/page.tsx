import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { markAllRead, openNotification } from '@/lib/notify-actions';
import { fmt } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const KIND: Record<string, string> = { young: 'Young student', homeschool: 'Homeschool', help: 'Help request' };

/** An admin's notifications: young student and homeschool items (for leads) and students' help requests. */
export default async function Notifications() {
  const me = await requireAdmin('college');
  const rows = db().prepare('SELECT id, kind, student_id, message, created_at, read_at FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 200').all(me.id) as
    { id: number; kind: string; student_id: number | null; message: string; created_at: string; read_at: string | null }[];
  const unread = rows.filter((r) => !r.read_at).length;
  return (
    <AdminShell me={me} current="notifications">
      <AdminHead title="Notifications" action={unread ? <form action={markAllRead}><button className="btn btn-secondary">Mark all as read</button></form> : undefined} />
      <div className="pad-sm" style={{ padding: '8px 40px 40px', display: 'flex', flexDirection: 'column' }}>
        {rows.length === 0 && <div className="ink60" style={{ fontSize: 14, padding: '16px 0' }}>Nothing yet. Young student and homeschool items (if you&apos;re a lead) and students&apos; help requests show up here.</div>}
        {rows.map((r) => (
          <form key={r.id} action={openNotification} data-notice={r.kind} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--color-divider)', fontWeight: r.read_at ? 400 : 700 }}>
            <input type="hidden" name="id" value={r.id} />
            <span className="tag tag-neutral" style={{ justifySelf: 'start' }}>{KIND[r.kind] ?? r.kind}</span>
            <span style={{ fontSize: 14 }}>{r.message}<span className="ink60" style={{ fontWeight: 400, fontSize: 12 }}> · {fmt(r.created_at)}</span></span>
            <button className="btn btn-ghost" style={{ color: 'var(--color-accent-700)', fontSize: 13 }}>{r.student_id ? 'Open' : 'Mark read'}</button>
          </form>
        ))}
      </div>
    </AdminShell>
  );
}
