import 'server-only';
import { db } from './db';
import type { User } from './auth';

/**
 * A student's history: who did what, when, per term. Staff only (admin panel and audit PDF).
 * Events are only added, never changed. Names and roles are saved as they were at the time.
 */
export type Actor = { id: number | null; name: string; role: string };
export const SYSTEM: Actor = { id: null, name: 'Portal', role: 'Automatic' };

/** How a user is described in the history. */
export function actorOf(u: Pick<User, 'id' | 'first_name' | 'last_name' | 'role'> & { admin_level?: string | null; is_college_counselor?: number }): Actor {
  const role = u.role === 'student' ? 'Student' : u.role === 'parent' ? 'Parent' : u.role === 'counselor' ? 'High school staff'
    : u.is_college_counselor ? 'College counselor' : u.admin_level === 'super' ? 'Super admin' : 'College admin';
  return { id: u.id, name: `${u.first_name} ${u.last_name}`, role };
}

/** The terms of a student's active (not archived) class requests: where step-level events are filed. */
export function studentTermIds(studentId: number): number[] {
  return (db().prepare('SELECT DISTINCT term_id FROM course_requests WHERE student_id = ? AND term_id IS NOT NULL AND archived_at IS NULL')
    .all(studentId) as { term_id: number }[]).map((r) => r.term_id);
}

/**
 * Record an event. `terms`: the term(s) it belongs to. 'student' files it under every term the student has classes in
 * (step changes, college review); omit it (or pass []) for account-wide events.
 */
export function logEvent(studentId: number, actor: Actor, action: string, detail?: string | null, terms?: (number | null)[] | 'student') {
  const list = terms === 'student' ? studentTermIds(studentId) : terms ?? [];
  const ids = list.length ? [...new Set(list)] : [null];
  const at = new Date().toISOString();
  const ins = db().prepare('INSERT INTO audit_events (student_id, term_id, at, actor_id, actor_name, actor_role, action, detail) VALUES (?,?,?,?,?,?,?,?)');
  for (const t of ids) ins.run(studentId, t, at, actor.id, actor.name, actor.role, action, detail ? detail.slice(0, 1000) : null);
}

export type AuditEvent = { id: number; term_id: number | null; term_name: string | null; at: string; actor_name: string; actor_role: string; action: string; detail: string | null };

/** History for a student, grouped by term (newest term first), account-wide events last. Each group is newest first. */
export function studentHistory(studentId: number, termIds?: number[]): { termId: number | null; termName: string; events: AuditEvent[] }[] {
  const rows = db().prepare(`SELECT e.id, e.term_id, t.name AS term_name, e.at, e.actor_name, e.actor_role, e.action, e.detail
    FROM audit_events e LEFT JOIN terms t ON t.id = e.term_id WHERE e.student_id = ?
    ORDER BY t.registration_opens DESC, e.at DESC, e.id DESC`).all(studentId) as AuditEvent[];
  const groups = new Map<string, { termId: number | null; termName: string; events: AuditEvent[] }>();
  for (const r of rows) {
    if (termIds && r.term_id !== null && !termIds.includes(r.term_id)) continue;
    const key = String(r.term_id ?? 'none');
    if (!groups.has(key)) groups.set(key, { termId: r.term_id, termName: r.term_name ?? 'All terms', events: [] });
    groups.get(key)!.events.push(r);
  }
  const out = [...groups.values()];
  // Account-wide events (no term) go last.
  return [...out.filter((g) => g.termId !== null), ...out.filter((g) => g.termId === null)];
}
