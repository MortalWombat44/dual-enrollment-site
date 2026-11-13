'use server';
import { redirect } from 'next/navigation';
import { requireAdmin } from './auth';
import { actorOf } from './audit';
import { db } from './db';
import { assignInbox, discardInbox } from './transcripts';

/**
 * Confirm the student for a transcript from a bulk upload. The student is the suggestion, or one picked by
 * Shasta College ID or from the list ("Last, First · ID … · #123").
 */
export async function confirmInbox(formData: FormData) {
  const me = await requireAdmin('college');
  const id = Number(formData.get('inboxId'));
  const pick = String(formData.get('pick') || '').trim();
  let studentId = Number(formData.get('studentId')) || 0;
  if (pick) {
    const byRef = /#(\d+)\s*$/.exec(pick);
    const byNum = db().prepare("SELECT id FROM users WHERE role = 'student' AND lower(student_number) = lower(?)").all(pick) as { id: number }[];
    studentId = byRef ? Number(byRef[1]) : byNum.length === 1 ? byNum[0].id : 0;
    if (!studentId) redirect(`/admin/transcripts?error=${byNum.length > 1 ? 'shared' : 'pick'}#inbox-${id}`);
  }
  if (!studentId) redirect(`/admin/transcripts?error=pick#inbox-${id}`);
  const ok = await assignInbox(id, studentId, { ...actorOf(me), id: me.id });
  redirect(`/admin/transcripts?done=${ok ? 'assigned' : 'gone'}`);
}

export async function discardInboxItem(formData: FormData) {
  await requireAdmin('college');
  discardInbox(Number(formData.get('inboxId')));
  redirect('/admin/transcripts?done=discarded');
}
