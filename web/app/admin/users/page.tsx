import Link from 'next/link';
import { siteOrigin } from '@/lib/site';
import { demoMode, mailConfigured } from '@/lib/mail';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { addUser, retireGradClass, adminResetLink, sendMeTestEmail, setUserDisabled, unlockUser, updateAdmin, updateStaffType } from '@/lib/admin-actions';
import { lockedEmails, RESET_MINUTES } from '@/lib/security';
import { retirableClasses } from '@/lib/retire';
import { ConfirmButton } from '@/components/ConfirmButton';
import { activeTerms, currentClassYear } from '@/lib/workflow';
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
  reset: "That account can't get a reset link (it isn't active).",
  reset_nomail: "Email isn't set up yet, so a reset link can't be sent. Reset links only go to the email on file.",
  reset_failed: "The reset email couldn't be sent. Check the email settings and try again.",
};

const STAFF_LABEL: Record<string, string> = { counselor: 'Counselor', admin: 'Admin', teacher: 'Teacher', other: 'Other' };

type Row = { id: number; first_name: string; last_name: string; email: string; role: string; status: string; school: string | null; invite_token: string | null; admin_level: string | null; is_college_counselor: number; is_young_approver: number; is_young_lead: number; is_homeschool_lead: number; staff_type: string | null; disabled: number; retired_at: string | null };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ role?: string; resetsent?: string; mailtest?: string; emailed?: string; q?: string; add?: string; error?: string; invited?: string; updated?: string; disabled?: string; enabled?: string; resetfor?: string; token?: string; unlocked?: string; retired?: string; rs?: string; rp?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  const role = ROLE_TABS.some(([r]) => r === sp.role) ? sp.role! : '';
  const q = (sp.q ?? '').trim();
  const where: string[] = [];
  const args: string[] = [];
  if (role) { where.push('u.role = ?'); args.push(role); }
  if (q) { where.push("(u.first_name || ' ' || u.last_name LIKE ? OR u.email LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  const rows = db().prepare(
    `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.status, u.invite_token, u.admin_level, u.is_college_counselor, u.is_young_approver, u.is_young_lead, u.is_homeschool_lead, u.staff_type, u.disabled, u.retired_at, s.name AS school
     FROM users u LEFT JOIN schools s ON s.id = u.school_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY u.created_at DESC, u.id DESC LIMIT 200`).all(...args) as Row[];
  const total = (db().prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  const invited = sp.invited ? (db().prepare("SELECT first_name, email, invite_token FROM users WHERE id = ? AND status = 'invited'").get(Number(sp.invited)) as { first_name: string; email: string; invite_token: string } | undefined) : undefined;
  const locked = lockedEmails();
  const retirable = retirableClasses();
  const resetFor = sp.resetfor ? (db().prepare('SELECT first_name, last_name, email FROM users WHERE id = ?').get(Number(sp.resetfor)) as { first_name: string; last_name: string; email: string } | undefined) : undefined;
  const origin = await siteOrigin();
  const resetSent = sp.resetsent ? (db().prepare('SELECT first_name, last_name, email FROM users WHERE id = ?').get(Number(sp.resetsent)) as { first_name: string; last_name: string; email: string } | undefined) : undefined;
  const mailOn = mailConfigured();
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
      {resetFor && sp.token && (
        <div className="flash pad-sm" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span><strong>Test mode: password reset link for {resetFor.first_name} {resetFor.last_name}.</strong> Email isn&apos;t set up, so it&apos;s shown here for testing. On the live site it is only emailed to {resetFor.email}. It works once and expires in {RESET_MINUTES} minutes:</span>
          <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{origin}/reset/{sp.token}</code>
        </div>
      )}
      <Flash msg={resetSent ? `Reset link emailed to ${resetSent.first_name} ${resetSent.last_name} at ${resetSent.email} (the email on file). It works once and expires in ${RESET_MINUTES} minutes.` : null} />
      <Flash msg={sp.mailtest === 'ok' ? `Test email sent to ${me.email}. Check your inbox.` : null} />
      <Flash error msg={sp.mailtest === 'failed' ? 'The test email couldn’t be sent. Check RESEND_API_KEY and MAIL_FROM, and that the sending domain is verified.' : sp.mailtest === 'off' ? 'Email isn’t set up yet.' : null} />
      <Flash msg={sp.unlocked ? 'Account unlocked. They can try signing in again.' : null} />
      <Flash msg={sp.retired ? `Retired the class of ${sp.retired}: ${sp.rs} student account${sp.rs === '1' ? '' : 's'} and ${sp.rp} parent account${sp.rp === '1' ? '' : 's'}. Their records are kept; use Enable to restore one.` : null} />
      {invited && (
        <div className="flash pad-sm" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span><strong>Invite created for {invited.first_name}.</strong> {sp.emailed ? `We emailed it to ${invited.email}. You can also send this link yourself:` : `Send this link to ${invited.email} so they can set a password:`}</span>
          <code style={{ wordBreak: 'break-all', fontSize: 13 }}>{origin}/invite/{invited.invite_token}</code>
        </div>
      )}
      <form action={sendMeTestEmail} data-mail-status className="pad-sm" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', padding: '12px 40px', fontSize: 14, borderBottom: '2px solid var(--color-divider)', background: mailOn ? undefined : '#fff4e0' }}>
        {mailOn ? (
          <>
            <span><strong>Email is connected.</strong> Reset links, invites and notices are sent from {process.env.MAIL_FROM}. Links point to {origin}.</span>
            <button className="btn btn-secondary" style={{ fontSize: 13, padding: '4px 10px' }}>Send me a test email</button>
          </>
        ) : (
          <span><strong>Email isn&apos;t set up yet.</strong> Nothing is emailed{demoMode() ? '; in test mode, links are shown on screen instead' : ', and reset links can’t be sent'}. To connect it, set RESEND_API_KEY, MAIL_FROM and SITE_URL where the site is hosted.</span>
        )}
      </form>
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
                        {u.admin_level === 'super' ? 'Super admin' : 'College admin'}{u.is_college_counselor ? ' · College counselor' : ''}{u.is_young_approver ? ' · Young Student Approver' : ''}{u.is_young_lead ? ' · Young student lead' : ''}{u.is_homeschool_lead ? ' · Homeschool lead' : ''}
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
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" name="young_approver" defaultChecked={!!u.is_young_approver} style={{ accentColor: 'var(--color-accent)' }} /> Young Student Approver
                        </label>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" name="young_lead" defaultChecked={!!u.is_young_lead} style={{ accentColor: 'var(--color-accent)' }} /> Young student lead (notified)
                        </label>
                        <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" name="homeschool_lead" defaultChecked={!!u.is_homeschool_lead} style={{ accentColor: 'var(--color-accent)' }} /> Homeschool lead (notified)
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
                    {u.retired_at ? <span className="tag tag-neutral">Retired</span>
                      : u.disabled ? <span className="tag" style={{ background: '#fdecea', color: '#6b1a12' }}>Disabled</span>
                      : u.status === 'active' ? <span className="tag tag-accent">Active</span>
                      : <><span className="tag tag-neutral">Invited</span><Link href={`/admin/users?invited=${u.id}`} style={{ fontSize: 12 }}>Invite link</Link></>}
                    {locked.has(u.email.toLowerCase()) && (
                      <form action={unlockUser} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                        <input type="hidden" name="email" value={u.email} />
                        <span className="tag" style={{ background: '#fff4e0', color: '#8a4b00' }}>Locked</span>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '2px 4px', color: 'var(--color-accent-700)' }}>Unlock</button>
                      </form>
                    )}
                    {u.status === 'active' && !u.disabled && (
                      <form action={adminResetLink}>
                        <input type="hidden" name="id" value={u.id} />
                        <button className="btn btn-ghost" title={`Emails a one-time reset link to ${u.email} (the email on file)`} style={{ fontSize: 12, padding: '2px 4px', color: 'var(--color-accent-700)' }}>{mailOn ? 'Email reset link' : 'Reset link'}</button>
                      </form>
                    )}
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
      <div id="retire" className="pad-sm" style={{ padding: '8px 40px 48px', display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 820 }}>
        <div className="kicker">Retire graduated classes</div>
        <div style={{ fontSize: 14 }}>
          Retiring switches off every student account in a graduated class (and parents whose students are all retired). Records are kept, and you can Enable an account again.
        </div>
        {retirable.length === 0 ? <div className="ink60" style={{ fontSize: 14 }}>No graduated classes with active accounts.</div> : (
          <table className="table" style={{ width: '100%', maxWidth: 520 }}>
            <thead><tr><th>Class of</th><th>Active student accounts</th><th /></tr></thead>
            <tbody>
              {retirable.map((c) => (
                <tr key={c.grad_year}>
                  <td><strong>{c.grad_year}</strong></td>
                  <td>{c.n}</td>
                  <td>
                    <form>
                      <input type="hidden" name="grad_year" value={c.grad_year} />
                      <ConfirmButton formAction={retireGradClass} className="btn btn-secondary" message={`Retire all ${c.n} student account(s) in the class of ${c.grad_year}? They won't be able to sign in.`}>Retire class of {c.grad_year}</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {sp.add && <AddUserDialog action={addUser} schools={schools} terms={activeTerms()} gradYears={Array.from({ length: 5 }, (_, i) => currentClassYear() + i)} error={sp.error ? ERRORS[sp.error] : undefined} />}
    </AdminShell>
  );
}
