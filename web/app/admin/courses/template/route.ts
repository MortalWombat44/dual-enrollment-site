import { currentUser } from '@/lib/auth';
import { templateCsv, templateXlsx } from '@/lib/course-import';

export const dynamic = 'force-dynamic';

/** Course upload template: ?format=xlsx (Excel) or csv. Super admins only. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== 'admin' || me.admin_level !== 'super') return new Response('Not found', { status: 404 });
  const xlsx = new URL(req.url).searchParams.get('format') === 'xlsx';
  const body = xlsx ? new Uint8Array(await templateXlsx()) : templateCsv();
  return new Response(body, {
    headers: {
      'Content-Type': xlsx ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="course-upload-template.${xlsx ? 'xlsx' : 'csv'}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
