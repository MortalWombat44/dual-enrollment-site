'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { canSeeStudent } from './access';
import { MAX_UPLOAD_BYTES } from './constants';
import { saveFile, sniff } from './files';
import { completeStep, getProgress } from './workflow';

export async function submitConsent(formData: FormData) {
  const me = await requireRole('parent');
  const studentId = Number(formData.get('studentId'));
  const back = (err: string) => redirect(`/parent/consent?student=${studentId}&error=${err}`);
  if (!canSeeStudent(me, studentId)) redirect('/parent');
  const p = getProgress(studentId);
  const step = p?.steps.find((s) => s.id === 3);
  if (!step || step.status !== 'waiting_parent') redirect('/parent');
  if (formData.get('agree') !== 'on') back('agree');

  const method = formData.get('method') === 'upload' ? 'upload' : 'esign';
  const signer = String(formData.get('signer') || '').trim().slice(0, 120) || `${me.first_name} ${me.last_name}`;
  let fileId: number;
  if (method === 'esign') {
    const sig = String(formData.get('signature') || '');
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(sig);
    if (!m) back('signature');
    const buf = Buffer.from(m![1], 'base64');
    if (buf.length > 2 * 1024 * 1024 || sniff(buf) !== 'image/png') back('signature');
    fileId = saveFile({ studentId, uploadedBy: me.id, kind: 'signature', filename: 'signature.png', mime: 'image/png', data: buf });
  } else {
    const f = formData.get('file');
    if (!(f instanceof File) || f.size === 0) back('file');
    const file = f as File;
    if (file.size > MAX_UPLOAD_BYTES) back('size');
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniff(buf);
    if (!mime) back('type');
    fileId = saveFile({ studentId, uploadedBy: me.id, kind: 'consent_upload', filename: file.name, mime: mime!, data: buf });
  }
  completeStep(studentId, 3, { method, signer, parent_id: me.id, file_id: fileId }, true);
  redirect(`/parent?signed=${studentId}`);
}
