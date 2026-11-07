import 'server-only';
import { db, stepIndex } from './db';
import { getProgress } from './workflow';

/** One Clear units step (7): when it became ready for the college, and when (and by whom) it was cleared. */
export type ClearRecord = { studentId: number; student: string; schoolId: number; adminId: number | null; readyAt: string | null; clearedAt: string | null };

/**
 * Every completed Clear units step.
 * "Ready" = when the last step before Clear units was finished (that's when it lands in the queue).
 */
export function clearUnitsRecords(): ClearRecord[] {
  const d = db();
  const before = [1, 2, 3, 4].filter((id) => stepIndex(id) < stepIndex(7));
  const rows = d.prepare(`
    SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.school_id,
      p7.status AS s7, p7.completed_at AS cleared_at, p7.data AS d7,
      (SELECT MAX(completed_at) FROM step_progress p WHERE p.student_id = u.id AND p.status = 'complete' AND p.step_id IN (${before.join(',')})) AS ready_at
    FROM users u LEFT JOIN step_progress p7 ON p7.student_id = u.id AND p7.step_id = 7
    WHERE u.role = 'student'`).all() as {
      id: number; name: string; school_id: number; s7: string | null; cleared_at: string | null; d7: string | null; ready_at: string | null;
    }[];
  const out: ClearRecord[] = [];
  for (const r of rows) {
    const data = r.d7 ? (JSON.parse(r.d7) as { admin_id?: number; school_id?: number }) : {};
    if (r.s7 === 'complete') {
      out.push({ studentId: r.id, student: r.name, schoolId: data.school_id ?? r.school_id, adminId: data.admin_id ?? null, readyAt: r.ready_at, clearedAt: r.cleared_at });
    }
  }
  return out;
}

/** Students currently sitting in the Clear units queue, with how long they've waited so far. */
export function waitingNow(): { schoolId: number; readyAt: string }[] {
  const ids = (db().prepare("SELECT id FROM users WHERE role = 'student'").all() as { id: number }[]).map((r) => r.id);
  const out: { schoolId: number; readyAt: string }[] = [];
  for (const id of ids) {
    const p = getProgress(id);
    const s7 = p?.steps.find((s) => s.id === 7);
    if (!p || s7?.status !== 'in_review') continue;
    const prev = p.steps[p.steps.indexOf(s7) - 1];
    if (prev?.completedAt) out.push({ schoolId: p.school.id, readyAt: prev.completedAt });
  }
  return out;
}

export function hoursBetween(a: string, b: string) {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 36e5);
}

export function average(xs: number[]) {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

/** 5.5 → "5.5 hours", 30 → "1.3 days". */
export function formatHours(h: number | null): string {
  if (h === null) return '—';
  if (h < 24) return `${h < 10 ? h.toFixed(1) : Math.round(h)} hours`;
  const days = h / 24;
  return `${days.toFixed(1)} days`;
}
