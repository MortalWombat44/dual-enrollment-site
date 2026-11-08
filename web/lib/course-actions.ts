'use server';
import { requireAdmin } from './auth';
import { db } from './db';
import { courseFields } from './course-fields';
import type { Course } from './workflow';

export type CourseResult = { ok: true; course: Course } | { ok: false; error: string };
const get = (id: number) => db().prepare('SELECT * FROM courses WHERE id = ?').get(id) as Course;
const invalid: CourseResult = { ok: false, error: 'A course needs a code, a title and units (0.5 to 10).' };

/**
 * Course list edits that stay on the page (no reload): each returns the saved course for the editor to show.
 * Super admins only. Concurrent courses have no school; Dual Enrollment courses belong to one school.
 */
export async function saveCourseInline(formData: FormData): Promise<CourseResult> {
  await requireAdmin('super');
  const id = Number(formData.get('id'));
  const c = db().prepare('SELECT kind FROM courses WHERE id = ? AND custom = 0').get(id) as { kind: 'ce' | 'de' } | undefined;
  if (!c) return { ok: false, error: 'That course no longer exists.' };
  const f = courseFields(formData);
  if (!f.code || !f.title || Number.isNaN(f.units)) return invalid;
  if (c.kind === 'de') {
    db().prepare('UPDATE courses SET code = ?, title = ?, units = ?, period = ?, teacher = ?, prerequisite = ?, offered_term_id = ? WHERE id = ?')
      .run(f.code, f.title, f.units, f.period, f.teacher, f.prerequisite, f.offeredTerm, id);
  } else {
    db().prepare('UPDATE courses SET code = ?, title = ?, units = ?, prerequisite = ? WHERE id = ?').run(f.code, f.title, f.units, f.prerequisite, id);
  }
  return { ok: true, course: get(id) };
}

export async function addCourseInline(formData: FormData): Promise<CourseResult> {
  await requireAdmin('super');
  const f = courseFields(formData);
  const schoolId = Number(formData.get('school_id')) || null;
  if (!f.code || !f.title || Number.isNaN(f.units)) return invalid;
  if (schoolId && !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(schoolId)) return { ok: false, error: 'That school no longer exists.' };
  const kind = schoolId ? 'de' : 'ce';
  const id = Number(db().prepare('INSERT INTO courses (code, title, units, schedule, prerequisite, kind, school_id, period, teacher, offered_term_id) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(f.code, f.title, f.units, '', f.prerequisite, kind, schoolId, kind === 'de' ? f.period : null, kind === 'de' ? f.teacher : null, kind === 'de' ? f.offeredTerm : null).lastInsertRowid);
  return { ok: true, course: get(id) };
}

/** Removing hides a course from new requests; students who already asked for it keep it. Restoring brings it back. */
export async function setCourseActive(id: number, active: boolean): Promise<CourseResult> {
  await requireAdmin('super');
  const r = db().prepare('UPDATE courses SET active = ? WHERE id = ? AND custom = 0').run(active ? 1 : 0, id);
  if (!Number(r.changes)) return { ok: false, error: 'That course no longer exists.' };
  return { ok: true, course: get(id) };
}
