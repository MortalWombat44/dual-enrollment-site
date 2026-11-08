import { currentUser } from '@/lib/auth';
import { exportClassZip } from '@/lib/file-archive';

export const dynamic = 'force-dynamic';

/** ZIP of a graduating class's student files (?year=2027, or 0 for no graduation year). Super admins only. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== 'admin' || me.admin_level !== 'super') return new Response('Not found', { status: 404 });
  const raw = new URL(req.url).searchParams.get('year');
  const year = Number(raw);
  if (raw === null || !Number.isInteger(year) || year < 0 || year > 2200) return new Response('Pick a class year', { status: 400 });
  const stream = exportClassZip(year, { id: me.id, name: `${me.first_name} ${me.last_name}` });
  const label = year === 0 ? 'no-grad-year' : `class-of-${year}`;
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="student-files-${label}-${new Date().toISOString().slice(0, 10)}.zip"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
