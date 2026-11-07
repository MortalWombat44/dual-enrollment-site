import Link from 'next/link';
import { logout } from '@/lib/session-actions';
import type { User } from '@/lib/auth';

export function initials(u: Pick<User, 'first_name' | 'last_name'>) {
  return (u.first_name[0] + u.last_name[0]).toUpperCase();
}

export function TopBar({
  nav = [],
  current,
  right,
  user,
}: {
  nav?: { href: string; label: string; hideSm?: boolean }[];
  current?: string;
  right?: React.ReactNode;
  user?: User;
}) {
  return (
    <div className="topbar">
      <Link href="/" className="brand unlink">
        <div className="brand-mark" />
        <div className="brand-name">Shasta College</div>
        <div className="brand-sep only-desktop" />
        <div className="only-desktop" style={{ fontSize: 14 }}>Dual Enrollment</div>
      </Link>
      <div className="topnav">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className={n.hideSm ? 'hide-sm' : undefined} aria-current={current === n.href ? 'page' : undefined}>
            {n.label}
          </Link>
        ))}
        {right}
        {user && (
          <form action={logout}>
            <button className="avatar" title={`Signed in as ${user.first_name} ${user.last_name} · Sign out`} aria-label="Sign out">
              {initials(user)}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function SegBar({ total, on, half = 0, height = 10, gap = 4, style }: { total: number; on: number; half?: number; height?: number; gap?: number; style?: React.CSSProperties }) {
  return (
    <div className="segbar" style={{ gridTemplateColumns: `repeat(${total},1fr)`, gap, ...style }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={i < on ? 'on' : i < on + half ? 'half' : undefined} style={{ height }} />
      ))}
    </div>
  );
}

export function Check({ size = 24, font = 13 }: { size?: number; font?: number }) {
  return <span className="check" style={{ width: size, height: size, fontSize: font }}>✓</span>;
}

export function Flash({ msg, error }: { msg?: string | null; error?: boolean }) {
  if (!msg) return null;
  return <div className={'flash' + (error ? ' flash-err' : '')} role="status">{msg}</div>;
}
