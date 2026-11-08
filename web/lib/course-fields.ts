import 'server-only';
import { db } from './db';

/** Reads a course row form (code, title, units; Dual Enrollment: period, teacher, term offered; prerequisite). */
export function courseFields(formData: FormData) {
  const str = (k: string, max = 120) => String(formData.get(k) || '').trim().slice(0, max);
  const units = Number(formData.get('units'));
  const term = Number(formData.get('offered_term_id'));
  return {
    code: str('code', 20).toUpperCase(),
    title: str('title'),
    units: Number.isFinite(units) && units > 0 && units <= 10 ? units : NaN,
    period: str('period', 20) || null,
    teacher: str('teacher', 80) || null,
    prerequisite: str('prerequisite', 200) || null,
    // Dual Enrollment: offered in one term only (blank = every term).
    offeredTerm: term && db().prepare('SELECT 1 FROM terms WHERE id = ?').get(term) ? term : null,
  };
}
