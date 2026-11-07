import Link from 'next/link';
import { headers } from 'next/headers';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { addUser, setUserDisabled, updateAdmin, updateStaffType } from '@/lib/admin-actions';
import { activeTerms } from '@/lib/workflow';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { AddUserDialog } from '@/components/AddUserDialog';
import { Flash } from '@/components/chrome';

export const dynamic = 'force-dynamic';

const ROLE_TABS = [
  ['', 'All'], ['student', 'Students'], ['parent', 'Parents'], ['counselor', 'High School Staff'], ['admin', 'Admins'],
] as const;
const ERRORS: Record<string, string> = {
  name: 'Enter a first and last name.', email: 'Enter a valid email.', role: 'Pick a role. Parents are invited by their student from the consent step.',
  school: 'Pick a school.', exists: 'Someone already has that email.',
  self: "You can't remove your own super admin access.",
  self_disable: "You can't disable your own account.",
};

const STAFF_LABEL: Record<string, string> = { counselor: 'Counselor', admin: 'Admin', teacher: 'Teacher', other: 'Other' };

type Row = { id: number; first_name: string; last_name: string; email: string; role: string; status: string; school: string | null; invite_token: string | null; admin_level: string | null; is_college_counselor: number; staff_type: string | null; disabled: number };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; q?: string; add?: string; error?: string; invited?: string; updated?: string; disabled?: string; enabled?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const role = ROLE_TABS.some(([r]) => r === sp.role) ? sp.role! : '';
  const q = (sp.q ?? '').trim();
  const where: string[] = [];
  const args: string[] = [];
  if (role) { where.push('u.role = ?'); args.push(role); }
  if (q) { where.push("(u.first_name || ' ' || u.last_name LIKE ? OR u.email LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  const rows = db().prepare(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status, u.invite_token, u.admin_level, u.is_college_counselor, u.staff_type, u.disabled, s.name AS school
     FROM users u LEFT JOIN schools s ON s.id = u.school_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY u.created_at DESC, u.id DESC LIMIT 200`).all(...args) as Row[];
  const total = (db().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const invited = sp.invited ? (db().prepare("SELECT first_name, email, invite_token FROM users WHERE id = ? AND status = 'invited'").get(Number(sp.invited)) as { first_name: string; email: string; invite_token: string } | undefined) : undefined;
  const h = await headers();
  const origin = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
  const tabHref = (r: string) => '/admin/users' + (r || q ? '?' + new URLSearchParams({ ...(r ? { role: r } : {}), ...(q ? { q } : {}) }) : '');

  const schools = db().prepare('SELECT id, name, designation FROM schools ORDER BY name').all() as { id: number; name: string; designation: string }[];
  const primaryOf = new Map<number, number[]>();
  for (const r of db().prepare('SELECT admin_id, school_id FROM admin_schools').all() as { admin_id: number; school_id: number }[]) {
    primaryOf.set(r.admin_id, [...(primaryOf.get(r.admin_id) ?? []), r.school_id]);
  }
  const short = (name: string) => name.replace(' High School', ' HS');
  const backUrl = '/admin/users' + (role || q ? '?' + new URLSearchParams({ ...(role ? { role } : {}), ...(q ? { q } : {}) }) : '');

  return (
    <AdminShell me={me} current="users">
      <AdminHead title="Users" action={<Link href="/admin/users?add=1" className="btn btn-primary btn-wide">Add user <span>+</span></Link>} />
      <Flash msg={sp.updated ? 'Saved.' : sp.disabled ? 'Account disabled. They have been signed out and cannot sign in.' : sp.enabled ? 'Account enabled. They can sign in again.' : null} />
      <Flash error msg={!sp.add && sp.error ? ERRORS[sp.error] : null} />
      {invited && (
        <div className="flash pad-sm" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span><strong>Invite created for {invited.first_name}.</strong> Send this link to {invited.email} so they can set a password:</span>
          <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{origin}/invite/{invited.invite_token}</code>
        </div>
      )}
      <div className="pad-sm" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 40px', gap: 12, flexWrap: 'wrap' }}>
        <div className="seg">
          {ROLE_TABS.map(([r, label]) => (
            <Link key={r} className="seg-opt" href={tabHref(r)} aria-current={role === r}>{r === '' ? `${label} · ${total}` : label}</Link>
          ))}
        </div>
        <form action="/admin/users">
          {role && <input type="hidden" name="role" value={role} />}
          <input className="input" name="q" defaultValue={q} placeholder="Search name or email" style={{ width: 260 }} />
        </form>
      </div>
      <div className="pad-sm" style={{ padding: '0 40px 40px', overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>School</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><strong>{u.first_name} {u.last_name}</strong></td>
                <td>{u.email}</td>
                <td>
                  {u.role === 'admin' ? (
                    <details>
                      <summary style={{ cursor: 'pointer' }}>
                        {u.admin_level === 'super' ? 'Super admin' : 'College admin'}{u.is_college_counselor ? ' · College counselor' : ''}
                        {(primaryOf.get(u.id) ?? []).length > 0 && (
                          <div className="ink60" style={{ fontSize: 12 }}>Primary: {schools.filter((x) => primaryOf.get(u.id)!.includes(x.id)).map((x) => short(x.name)).join(', ')}</div>
                        )}
                      </summary>
                      <form action={updateAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 0' }}>
                        <input type="hidden" name="id" value={u.id} />
                        <select name="admin_level" className="input" defaultValue={u.admin_level ?? 'college'}>
                          <option value="college">College admin</option>
                          <option value="super">Super admin</option>
                        </select>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" name="college_counselor" defaultChecked={!!u.is_college_counselor} style={{ accentColor: 'var(--color-accent)' }} /> College counselor
                        </label>
                        <fieldset style={{ border: '1px solid var(--color-divider)', padding: '6px 10px', margin: 0 }}>
                          <legend style={{ fontSize: 12, padding: '0 4px' }}>Primary schools (shown first in their to-do)</legend>
                          {schools.map((x) => (
                            <label key={x.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                              <input type="checkbox" name="primary" value={x.id} defaultChecked={(primaryOf.get(u.id) ?? []).includes(x.id)} style={{ accentColor: 'var(--color-accent)' }} /> {x.name}
                            </label>
                          ))}
                        </fieldset>
                        <button className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>Save</button>
                      </form>
                    </details>
                  ) : u.role === 'counselor' ? (
                    <details>
                      <summary style={{ cursor: 'pointer' }}>High School Staff · {STAFF_LABEL[u.staff_type ?? 'counselor']}</summary>
                      <form action={updateStaffType} style={{ display: 'flex', gap: 6, padding: '8px 0' }}>
                        <input type="hidden" name="id" value={u.id} />
                        <select name="staff_type" className="input" defaultValue={u.staff_type ?? 'counselor'} aria-label="Staff type">
                          {Object.entries(STAFF_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <button className="btn btn-secondary">Save</button>
                      </form>
                    </details>
                  ) : u.role[0].toUpperCase() + u.role.slice(1)}
                </td>
                <td>{u.role === 'admin' ? 'Shasta College' : u.school ?? '—'}</td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {u.disabled ? <span className="tag" style={{ background: '#fdecea', color: '#6b1a12' }}>Disabled</span>
                      : u.status === 'active' ? <span className="tag tag-accent">Active</span>
                      : <><span className="tag tag-neutral">Invited</span><Link href={`/admin/users?invited=${u.id}`} style={{ fontSize: 12 }}>Invite link</Link></>}
                    {u.id !== me.id && (
                      <form action={setUserDisabled}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="disable" value={u.disabled ? '0' : '1'} />
                        <input type="hidden" name="back" value={backUrl} />
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 4px', color: u.disabled ? 'var(--color-accent-700)' : '#b3261e' }}>{u.disabled ? 'Enable' : 'Disable'}</button>
                      </form>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="ink60" style={{ padding: '20px 8px' }}>No users match.</td></tr>}
          </tbody>
        </table>
      </div>
      {sp.add && <AddUserDialog action={addUser} schools={schools} terms={activeTerms()} error={sp.error ? ERRORS[sp.error] : undefined} />}
    </AdminShell>
  );
}
