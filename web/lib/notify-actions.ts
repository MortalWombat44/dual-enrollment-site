'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { db } from './db';

export async function markAllRead() {
  const me = await requireAdmin('college');
  db().prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(new Date().toISOString(), me.id);
  redirect('/admin/notifications');
}

/** Open a notification: mark it read and go to the student. */
export async function openNotification(formData: FormData) {
  const me = await requireAdmin('college');
  const id = Number(formData.get('id'));
  const n = db().prepare('SELECT student_id, kind FROM notifications WHERE id = ? AND user_id = ?').get(id, me.id) as { student_id: number | null; kind: string } | undefined;
  db().prepare('UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?').run(new Date().toISOString(), id, me.id);
  const tab = n?.kind === 'young' ? 'young' : n?.kind === 'homeschool' ? 'homeschool' : n?.kind === 'help' ? 'help' : 'all';
  redirect(n?.student_id ? `/admin/students?tab=${tab}&student=${n.student_id}` : '/admin/notifications');
}
