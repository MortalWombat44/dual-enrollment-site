import { currentUser } from '@/lib/auth';
import { canSeeStudent } from '@/lib/access';
import { getFile, readFile } from '@/lib/files';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return new Response('Not signed in', { status: 401 });
  const f = getFile(Number((await params).id));
  if (!f || !canSeeStudent(me, f.student_id)) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(readFile(f)), {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': `inline; filename="${f.filename.replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
