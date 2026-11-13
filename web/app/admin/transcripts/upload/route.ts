import { currentUser } from '@/lib/auth';
import { actorOf } from '@/lib/audit';
import { bulkTranscript, readUpload, TRANSCRIPT_ERRORS } from '@/lib/transcripts';

export const dynamic = 'force-dynamic';

/**
 * Bulk transcript upload, one file per request (the page sends them one after another, so there's no size limit on
 * the whole batch). Sure matches are assigned to the student; the rest wait on the Transcripts page for staff.
 */
export async function POST(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== 'admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
  const f = await readUpload((await req.formData()).get('file'));
  if ('error' in f) return Response.json({ error: TRANSCRIPT_ERRORS[f.error] }, { status: 400 });
  const r = await bulkTranscript({ ...actorOf(me), id: me.id }, f);
  return Response.json(r);
}
