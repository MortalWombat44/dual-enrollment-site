import { currentUser } from '@/lib/auth';
import { canExportSeniors, seniorsCsv } from '@/lib/seniors';
import { currentClassYear } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

/** This year's seniors and whether they plan to attend Shasta College. Super admins and college counselors. */
export async function GET() {
  const me = await currentUser();
  if (!me || !canExportSeniors(me)) return new Response('Not found', { status: 404 });
  return new Response(seniorsCsv(), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="seniors-class-of-${currentClassYear()}-plans.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
