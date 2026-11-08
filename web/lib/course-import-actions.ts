'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { db, tx } from './db';
import { MAX_IMPORT_BYTES, readUpload, validateRows } from './course-import';

/**
 * Super admin: upload a CSV or Excel file of Dual Enrollment courses for one school and one term (or every term).
 * Every row is checked first; if anything is wrong, nothing is imported. A row with the same code and period as a
 * course already listed for that school and term updates it; others are added. Optionally, courses for that school
 * and term that aren't in the file are removed from new requests (students who asked for them keep them).
 */
export async function importCourses(formData: FormData) {
  await requireAdmin('super');
  const back = (q: string) => redirect(`/admin/courses?${q}#import`);
  const schoolId = Number(formData.get('school_id'));
  if (!schoolId || !db().prepare('SELECT 1 FROM schools WHERE id = ?').get(schoolId)) back('import_error=' + encodeURIComponent('Pick a school.'));
  const termRaw = String(formData.get('term_id') || '');
  const termId = termRaw === 'all' ? null : Number(termRaw);
  if (termRaw !== 'all' && (!termId || !db().prepare('SELECT 1 FROM terms WHERE id = ?').get(termId))) back('import_error=' + encodeURIComponent('Pick a term (or every term).'));
  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) back('import_error=' + encodeURIComponent('Choose a CSV or Excel (.xlsx) file.'));
  if ((file as File).size > MAX_IMPORT_BYTES) back('import_error=' + encodeURIComponent('That file is over 2 MB.'));
  const raw = await readUpload(file as File);
  if (!raw) back('import_error=' + encodeURIComponent("Couldn't read that file. Save it as .xlsx or .csv (old .xls files aren't supported)."));
  const { rows, errors } = validateRows(raw!);
  if (errors.length) back('import_error=' + encodeURIComponent(errors.slice(0, 12).join('\n') + (errors.length > 12 ? `\n…and ${errors.length - 12} more.` : '')));
  const replace = formData.get('replace') === 'on';

  let added = 0, updated = 0, removed = 0;
  tx(() => {
    const d = db();
    const find = d.prepare("SELECT id FROM courses WHERE kind = 'de' AND school_id = ? AND offered_term_id IS ? AND code = ? AND period IS ?");
    const upd = d.prepare('UPDATE courses SET title = ?, units = ?, teacher = ?, prerequisite = ?, active = 1 WHERE id = ?');
    const ins = d.prepare("INSERT INTO courses (code, title, units, schedule, prerequisite, kind, school_id, period, teacher, offered_term_id) VALUES (?,?,?,'',?,'de',?,?,?,?)");
    const keep = new Set<number>();
    for (const r of rows) {
      const hit = find.get(schoolId, termId, r.code, r.period) as { id: number } | undefined;
      if (hit) { upd.run(r.title, r.units, r.teacher, r.prerequisite, hit.id); keep.add(hit.id); updated++; }
      else { keep.add(Number(ins.run(r.code, r.title, r.units, r.prerequisite, schoolId, r.period, r.teacher, termId).lastInsertRowid)); added++; }
    }
    if (replace) {
      const others = d.prepare("SELECT id FROM courses WHERE kind = 'de' AND school_id = ? AND offered_term_id IS ? AND active = 1").all(schoolId, termId) as { id: number }[];
      const off = d.prepare('UPDATE courses SET active = 0 WHERE id = ?');
      for (const o of others) if (!keep.has(o.id)) { off.run(o.id); removed++; }
    }
  });
  back(`imported=${added}.${updated}.${removed}&school=${schoolId}`);
}
