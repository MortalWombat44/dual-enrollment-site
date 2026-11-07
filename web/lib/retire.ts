import 'server-only';
import { db, tx } from './db';
import { currentClassYear, TZ } from './workflow';

/** Classes (by graduation year) that have already graduated and still have active student accounts. */
export function retirableClasses(): { grad_year: number; n: number }[] {
  return db().prepare(`SELECT grad_year, COUNT(*) AS n FROM users
    WHERE role = 'student' AND retired_at IS NULL AND grad_year IS NOT NULL AND grad_year < ?
    GROUP BY grad_year ORDER BY grad_year`).all(currentClassYear()) as { grad_year: number; n: number }[];
}

/**
 * Retire every student in a graduated class: they're switched off (like Disable) and marked retired; records stay.
 * Parents are retired too once every student linked to them is retired.
 */
export function retireClass(gradYear: number): { students: number; parents: number } {
  const now = new Date().toISOString();
  return tx(() => {
    const d = db();
    const ids = (d.prepare("SELECT id FROM users WHERE role = 'student' AND grad_year = ? AND retired_at IS NULL").all(gradYear) as { id: number }[]).map((r) => r.id);
    const ret = d.prepare('UPDATE users SET disabled = 1, retired_at = ? WHERE id = ?');
    const kill = d.prepare('DELETE FROM sessions WHERE user_id = ?');
    for (const id of ids) { ret.run(now, id); kill.run(id); }
    const parents = (d.prepare(`SELECT p.id FROM users p WHERE p.role = 'parent' AND p.retired_at IS NULL
      AND EXISTS (SELECT 1 FROM parent_links l WHERE l.parent_id = p.id)
      AND NOT EXISTS (SELECT 1 FROM parent_links l JOIN users s ON s.id = l.student_id WHERE l.parent_id = p.id AND s.retired_at IS NULL)`).all() as { id: number }[]).map((r) => r.id);
    for (const id of parents) { ret.run(now, id); kill.run(id); }
    return { students: ids.length, parents: parents.length };
  });
}

/** Today in Pacific time. DE_TODAY (YYYY-MM-DD) overrides it, for testing the June reminder. */
function today(): { year: number; month: number } {
  const d = process.env.DE_TODAY ? new Date(process.env.DE_TODAY + 'T12:00:00Z') : new Date();
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d).split('-').map(Number);
  return { year, month };
}

/**
 * Every June, super admins get a nudge to retire the class from 4 years ago (and anything older still active).
 * Null outside June, when there's nothing to retire, or once dismissed for the year.
 */
export function retireNudge(): { classYear: number; count: number } | null {
  const { year, month } = today();
  if (month !== 6) return null;
  const classYear = year - 4;
  if (db().prepare('SELECT 1 FROM settings WHERE key = ?').get(`retire_nudge_dismissed_${year}`)) return null;
  const count = (db().prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'student' AND retired_at IS NULL AND grad_year IS NOT NULL AND grad_year <= ?")
    .get(classYear) as { n: number }).n;
  return count ? { classYear, count } : null;
}

export function dismissRetireNudge() {
  db().prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`retire_nudge_dismissed_${today().year}`, new Date().toISOString());
}
