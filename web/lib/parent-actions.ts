'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { isParentOf } from './access';
import { saveFile, sniff } from './files';
import { completeStep, getProgress } from './workflow';
import { saveAffidavit } from './affidavit';
import { notifyLeads } from './notify';
import { db } from './db';
import { actorOf, logEvent } from './audit';

export async function submitConsent(formData: FormData) {
  const me = await requireRole('parent');
  const studentId = Number(formData.get('studentId'));
  const back = (err: string) => redirect(`/parent/consent?student=${studentId}&error=${err}`);
  if (!isParentOf(me, studentId)) redirect('/parent');
  const p = getProgress(studentId);
  const step = p?.steps.find((s) => s.id === 3);
  if (!step || step.status !== 'waiting_parent') redirect('/parent');
  if (formData.get('agree') !== 'on') back('agree');

  // Digital signature only: uploading a signed form is turned off.
  if (formData.get('method') === 'upload') back('signature');
  const method = 'esign';
  const signer = String(formData.get('signer') || '').trim().slice(0, 120) || `${me.first_name} ${me.last_name}`;
  const sig = String(formData.get('signature') || '');
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(sig);
  if (!m) back('signature');
  const buf = Buffer.from(m![1], 'base64');
  if (buf.length > 2 * 1024 * 1024 || sniff(buf) !== 'image/png') back('signature');
  const fileId = saveFile({ studentId, uploadedBy: me.id, kind: 'signature', filename: 'signature.png', mime: 'image/png', data: buf });
  const signMethod = formData.get('sign_mode') === 'type' ? 'typed' : 'drawn';
  completeStep(studentId, 3, { method, signer, parent_id: me.id, file_id: fileId, sign_method: signMethod }, true);
  logEvent(studentId, actorOf(me), 'Parent consent signed', `Signed by ${signer} (digital signature, ${signMethod})`);
  redirect(`/parent?signed=${studentId}`);
}

/** A parent uploads their homeschooled student's Private School Affidavit. */
export async function parentSubmitAffidavit(formData: FormData) {
  const me = await requireRole('parent');
  const studentId = Number(formData.get('studentId'));
  if (!isParentOf(me, studentId)) redirect('/parent');
  if (getProgress(studentId)?.steps.find((s) => s.id === 11)?.status !== 'current') redirect(`/parent?student=${studentId}`);
  const err = await saveAffidavit(studentId, me.id, formData.get('affidavit'));
  if (err) redirect(`/parent/affidavit?student=${studentId}&error=${err}`);
  logEvent(studentId, actorOf(me), 'Uploaded the Private School Affidavit');
  const kid = db().prepare('SELECT first_name, last_name FROM users WHERE id = ?').get(studentId) as { first_name: string; last_name: string };
  await notifyLeads('homeschool', studentId, `${kid.first_name} ${kid.last_name}'s parent uploaded a Private School Affidavit to review.`);
  redirect(`/parent?student=${studentId}&affidavit=1`);
}
