import Link from 'next/link';
import type { User } from '@/lib/auth';
import { logout } from '@/lib/session-actions';
import { retireNudge } from '@/lib/retire';
import { dismissRetireReminder } from '@/lib/admin-actions';

export function AdminShell({ me, current, children }: { me: User; current: 'students' | 'roster' | 'users' | 'schools' | 'courses' | 'terms' | 'audit' | 'reports'; children: React.ReactNode }) {
  const isSuper = me.admin_level === 'super';
  // Each June, remind super admins to retire the class from 4 years ago.
  const nudge = isSuper ? retireNudge() : null;
  const link = (key: typeof current, href: string, label: string) => (
    <Link href={href} aria-current={current === key ? 'page' : undefined}>{label}</Link>
  );
  return (
    <div className="admin">
      <div className="admin-side only-desktop">
        <div className="admin-brand"><div /><div style={{ fontWeight: 800, fontSize: 15 }}>Shasta DE Admin</div></div>
        <nav className="admin-nav">
          {link('students', '/admin/students', 'Students')}
          {link('roster', '/admin/roster', 'Roster')}
          {isSuper && link('users', '/admin/users', 'Users')}
          {isSuper && link('schools', '/admin/schools', 'Schools')}
          {isSuper && link('courses', '/admin/courses', 'Courses')}
          {isSuper && link('terms', '/admin/terms', 'Terms')}
          {isSuper && link('audit', '/admin/audit', 'Audit')}
          {link('reports', '/admin/reports', 'Reports')}
        </nav>
        <div className="admin-me">
          {me.first_name} {me.last_name}<br />
          <span style={{ color: 'var(--color-neutral-300)' }}>{isSuper ? 'Super admin' : 'College admin'}{me.is_college_counselor ? ' · College counselor' : ''}{me.is_young_approver ? ' · Young Student Approver' : ''}</span>
          <form action={logout}><button>Sign out</button></form>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {nudge && (
          <div className="flash" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fff4e0', color: '#8a4b00', borderBottomColor: '#d08a00' }}>
            <span><strong>It's June:</strong> {nudge.count} student account{nudge.count === 1 ? '' : 's'} from the class of {nudge.classYear} or earlier {nudge.count === 1 ? 'is' : 'are'} still active. <a href="/admin/users#retire">Review and retire</a></span>
            <form action={dismissRetireReminder}><button className="btn btn-ghost" style={{ fontSize: 13, color: '#8a4b00' }}>Dismiss for this year</button></form>
          </div>
        )}
        {children}
      </div>
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
