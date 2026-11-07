import { currentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { schoolRoster } from '@/lib/roster';

export const dynamic = 'force-dynamic';

const cell = (v: unknown) => {
  const s = String(v ?? '');
  // Quote everything and neutralise spreadsheet formulas.
  return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};

export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== 'admin') return new Response('Not allowed', { status: 403 });
  const url = new URL(req.url);
  const schoolId = Number(url.searchParams.get('school'));
  const termId = Number(url.searchParams.get('term')) || undefined;
  const school = db().prepare('SELECT name FROM schools WHERE id = ?').get(schoolId) as { name: string } | undefined;
  if (!school) return new Response('No such school', { status: 404 });
  const rows = [['School', 'Type', 'Code', 'Title', 'Units', 'Period', 'Teacher', 'Student', 'Class of', 'Term', 'Step']];
  for (const c of schoolRoster(schoolId, termId)) {
    const base = [school.name, c.kind === 'de' ? 'Dual Enrollment' : 'Concurrent Enrollment', c.code, c.title, c.units, c.period ?? '', c.teacher ?? ''];
    if (c.students.length === 0) rows.push([...base, '', '', '', ''] as string[]);
    for (const s of c.students) rows.push([...base, s.name, s.gradYear ?? '', s.term ?? '', s.step] as string[]);
  }
  const csv = rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
  const name = school.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
  return new Response(csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="roster-${name}.csv"`, 'Cache-Control': 'private, no-store' },
  });
}
