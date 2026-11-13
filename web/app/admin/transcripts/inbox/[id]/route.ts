import fs from 'node:fs';
import path from 'node:path';
import { currentUser } from '@/lib/auth';
import { UPLOAD_DIR } from '@/lib/db';
import { inboxFile } from '@/lib/transcripts';

export const dynamic = 'force-dynamic';

/** View a transcript that's waiting to be matched (college admins only). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me || me.role !== 'admin') return new Response('Not found', { status: 404 });
  const f = inboxFile(Number((await params).id));
  if (!f) return new Response('Not found', { status: 404 });
  let data: Buffer;
  try { data = fs.readFileSync(path.join(UPLOAD_DIR, path.basename(f.stored_name))); } catch { return new Response('Not found', { status: 404 }); }
  return new Response(new Uint8Array(data), {
    headers: { 'Content-Type': f.mime, 'Content-Disposition': `inline; filename="${f.filename.replace(/"/g, '')}"`, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' },
  });
}
