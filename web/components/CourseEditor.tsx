import { db } from '@/lib/db';
import { allTerms, type Course } from '@/lib/workflow';
import { CourseEditorClient } from './CourseEditorClient';

/**
 * Editable course list (saves in place, no page reload). Dual Enrollment (pass schoolId): period, teacher, term
 * offered. Concurrent (no schoolId): code, title, units, prerequisite. Classes students typed in aren't listed.
 */
export function CourseEditor({ schoolId }: { schoolId?: number }) {
  const courses = (schoolId
    ? db().prepare("SELECT * FROM courses WHERE kind = 'de' AND school_id = ? ORDER BY active DESC, code").all(schoolId)
    : db().prepare("SELECT * FROM courses WHERE kind = 'ce' AND custom = 0 ORDER BY active DESC, code").all()) as Course[];
  const requested = Object.fromEntries((db().prepare('SELECT course_id, COUNT(*) AS n FROM course_requests GROUP BY course_id').all() as { course_id: number; n: number }[]).map((r) => [r.course_id, r.n]));
  return <CourseEditorClient initial={courses} requested={requested} terms={allTerms().map((t) => ({ id: t.id, name: t.name }))} schoolId={schoolId} />;
}
