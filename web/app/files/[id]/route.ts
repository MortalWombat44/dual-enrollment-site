import { currentUser } from '@/lib/auth';
import { canSeeStudent } from '@/lib/access';
import { getFile, readFile } from '@/lib/files';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) return new Response('Not signed in', { status: 401 });
  const f = getFile(Number((await params).id));
  // Uploaders keep access to their own files (a parent's signature or signed form).
  if (!f || !(canSeeStudent(me, f.student_id) || f.uploaded_by === me.id)) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(readFile(f)), {
    headers: {
      'Content-Type': f.mime,
      'Content-Disposition': `inline; filename="${f.filename.replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
