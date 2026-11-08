import 'server-only';
import { db } from './db';
import { getProgress, isYoung, pad, type Course } from './workflow';
import { stepOnLabel } from './workflow';

export type RosterStudent = {
  id: number; name: string; gradYear: number | null; term: string | null; young: boolean;
  step: string; // "05 Clear units" or "Done"
  stepStatus: string; // in_review, current, waiting_parent, …
};
export type RosterClass = Course & { students: RosterStudent[] };

/**
 * Classes for a school's roster: every Dual Enrollment section at the school (even empty ones)
 * plus every Concurrent course that a student at the school has requested, each with its students.
 */
export function schoolRoster(schoolId: number, termId?: number): RosterClass[] {
  const d = db();
  const de = d.prepare("SELECT * FROM courses WHERE kind = 'de' AND school_id = ? AND active = 1 ORDER BY code").all(schoolId) as Course[];
  const reqs = d.prepare(`
    SELECT r.course_id, r.student_id, t.name AS term, r.archived_at
    FROM course_requests r JOIN users u ON u.id = r.student_id LEFT JOIN terms t ON t.id = r.term_id
    WHERE u.role = 'student' AND u.school_id = ? AND u.disabled = 0 ${termId ? 'AND r.term_id = ?' : ''}`)
    .all(...(termId ? [schoolId, termId] : [schoolId])) as { course_id: number; student_id: number; term: string | null; archived_at: string | null }[];
  const ids = [...new Set(reqs.map((r) => r.course_id))];
  const requested = ids.length ? (d.prepare(`SELECT * FROM courses WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as Course[]) : [];
  const classes = new Map<number, RosterClass>();
  for (const c of [...de, ...requested]) if (!classes.has(c.id)) classes.set(c.id, { ...c, students: [] });

  const progress = new Map<number, ReturnType<typeof getProgress>>();
  for (const r of reqs) {
    if (!progress.has(r.student_id)) progress.set(r.student_id, getProgress(r.student_id));
    const p = progress.get(r.student_id);
    if (!p) continue;
    classes.get(r.course_id)?.students.push({
      id: p.student.id,
      name: `${p.student.first_name} ${p.student.last_name}`,
      gradYear: p.student.grad_year,
      young: isYoung(p.student),
      term: r.term,
      // Archived: registration for the term was turned off before they registered. Kept so staff can see why.
      step: r.archived_at ? 'Archived · registration turned off' : stepOnLabel(p),
      stepStatus: p.next?.status ?? 'complete',
    });
  }
  for (const c of classes.values()) c.students.sort((a, b) => a.name.localeCompare(b.name));
  // Dual Enrollment first (by period), then Concurrent (by code).
  return [...classes.values()].sort((a, b) =>
    a.kind !== b.kind ? (a.kind === 'de' ? -1 : 1)
      : a.kind === 'de' ? (a.period ?? '').localeCompare(b.period ?? '', undefined, { numeric: true }) || a.code.localeCompare(b.code)
        : a.code.localeCompare(b.code));
}

/** The same classes grouped by teacher. Concurrent classes go under "Shasta College (Concurrent Enrollment)". */
export function byTeacher(classes: RosterClass[]): { teacher: string; classes: RosterClass[] }[] {
  const groups = new Map<string, RosterClass[]>();
  for (const c of classes) {
    const key = c.kind === 'ce' ? 'Shasta College (Concurrent Enrollment)' : c.teacher || 'Teacher not set';
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  return [...groups.entries()]
    .map(([teacher, list]) => ({ teacher, classes: list }))
    .sort((a, b) => (a.teacher.startsWith('Shasta College') ? 1 : b.teacher.startsWith('Shasta College') ? -1 : a.teacher.localeCompare(b.teacher)));
}
