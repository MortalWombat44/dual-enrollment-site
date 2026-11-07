import Link from 'next/link';
import type { User } from '@/lib/auth';
import { logout } from '@/lib/session-actions';

export function AdminShell({ me, current, children }: { me: User; current: 'users' | 'schools'; children: React.ReactNode }) {
  return (
    <div className="admin">
      <div className="admin-side only-desktop">
        <div className="admin-brand"><div /><div style={{ fontWeight: 800, fontSize: 15 }}>Shasta DE Admin</div></div>
        <nav className="admin-nav">
          <Link href="/admin/users" aria-current={current === 'users' ? 'page' : undefined}>Users</Link>
          <Link href="/admin/schools" aria-current={current === 'schools' ? 'page' : undefined}>Schools</Link>
          <span title="Not built yet">Steps</span>
          <span title="Not built yet">Terms</span>
          <span title="Not built yet">Reports</span>
        </nav>
        <div className="admin-me">
          {me.first_name} {me.last_name}<br />
          <span style={{ color: 'var(--color-neutral-300)' }}>{me.title ?? 'Admin'}</span>
          <form action={logout}><button>Sign out</button></form>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>{children}</div>
    </div>
  );
}

export function AdminHead({ title, action, crumb }: { title: string; action?: React.ReactNode; crumb?: React.ReactNode }) {
  return (
    <>
      {crumb && <div className="pad-sm" style={{ padding: '24px 40px 0', fontSize: 13 }}>{crumb}</div>}
      <div className="admin-head pad-sm" style={crumb ? { paddingTop: 8 } : undefined}>
        <div>
          {!crumb && <div className="kicker accent700">Admin</div>}
          <h1 style={crumb ? { margin: 0 } : undefined}>{title}</h1>
        </div>
        {action}
      </div>
    </>
  );
}
