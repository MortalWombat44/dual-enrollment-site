'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { cancelDeletion, scheduleDeletion } from './file-archive';

/** Super admin: delete a class's student files in 10 minutes (needs a ZIP export first). */
export async function scheduleFileDeletion(formData: FormData) {
  const me = await requireAdmin('super');
  const year = Number(formData.get('year'));
  if (!Number.isInteger(year) || year < 0) redirect('/admin/files');
  const r = scheduleDeletion(year, me.id);
  redirect(`/admin/files?${r === 'ok' ? 'scheduled' : 'error'}=${r === 'ok' ? year : r}`);
}

export async function cancelFileDeletion(formData: FormData) {
  const me = await requireAdmin('super');
  const ok = cancelDeletion(Number(formData.get('id')), me.id);
  redirect(`/admin/files?${ok ? 'cancelled=1' : 'error=too_late'}`);
}
