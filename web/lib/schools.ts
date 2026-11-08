import 'server-only';
import { db, DEFAULT_MODES, STEP_DEFS } from './db';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Listed schools for sign-up and school-change dropdowns ("Other" and Homeschool are separate options). */
export function listedSchools(): { id: number; name: string; district: string }[] {
  return db().prepare("SELECT id, name, district FROM schools WHERE kind = 'listed' ORDER BY name").all() as never;
}

export type SchoolChoice = { schoolId: number; approverName: string | null; approverEmail: string | null };

/**
 * Reads the SchoolPicker. "Other" finds a school with that name (a listed one, or one another student typed in)
 * or adds it as Non-CCAP; "homeschool" is the Homeschool entry. Returns an error code instead when something's missing.
 */
export function resolveSchool(formData: FormData): SchoolChoice | { error: string } {
  const v = String(formData.get('school') || '');
  const d = db();
  if (v === 'homeschool') {
    const h = d.prepare("SELECT id FROM schools WHERE kind = 'homeschool'").get() as { id: number };
    return { schoolId: h.id, approverName: null, approverEmail: null };
  }
  if (v === 'other') {
    const name = String(formData.get('other_school') || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const approverName = String(formData.get('approver_name') || '').trim().slice(0, 120);
    const approverEmail = String(formData.get('approver_email') || '').trim().toLowerCase().slice(0, 200);
    if (name.length < 3) return { error: 'other_school' };
    if (!approverName || !EMAIL.test(approverEmail)) return { error: 'approver' };
    const found = d.prepare("SELECT id, kind FROM schools WHERE lower(name) = lower(?) AND kind != 'homeschool'").get(name) as { id: number; kind: string } | undefined;
    if (found) return { schoolId: found.id, approverName: found.kind === 'other' ? approverName : null, approverEmail: found.kind === 'other' ? approverEmail : null };
    const id = Number(d.prepare("INSERT INTO schools (name, district, designation, kind) VALUES (?, 'Added by a student', 'NON_CCAP', 'other')").run(name).lastInsertRowid);
    const ins = d.prepare('INSERT OR IGNORE INTO school_steps (school_id, step_id, mode) VALUES (?,?,?)');
    for (const s of STEP_DEFS) ins.run(id, s.id, DEFAULT_MODES.NON_CCAP[s.id] ?? 'required');
    return { schoolId: id, approverName, approverEmail };
  }
  const id = Number(v);
  if (!id || !d.prepare("SELECT 1 FROM schools WHERE id = ? AND kind = 'listed'").get(id)) return { error: 'school' };
  return { schoolId: id, approverName: null, approverEmail: null };
}

export const SCHOOL_ERRORS: Record<string, string> = {
  school: 'Pick your high school.',
  other_school: "Type your high school's name.",
  approver: 'Enter the name and email of the person at your high school who approves dual enrollment classes.',
};
