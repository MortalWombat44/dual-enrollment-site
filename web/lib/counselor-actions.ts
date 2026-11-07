'use server';
import { redirect } from 'next/navigation';
import { requireRole } from './auth';
import { canSeeStudent } from './access';
import { completeStep, getProgress, requestChanges } from './workflow';

async function guard(formData: FormData) {
  const me = await requireRole('counselor');
  const studentId = Number(formData.get('studentId'));
  if (!canSeeStudent(me, studentId)) redirect('/counselor');
  const p = getProgress(studentId);
  if (p?.steps.find((s) => s.id === 4)?.status !== 'in_review') redirect(`/counselor?student=${studentId}`);
  const note = String(formData.get('note') || '').trim().slice(0, 1000);
  return { me, studentId, note, name: p!.student.first_name };
}

export async function approve(formData: FormData) {
  const { me, studentId, note, name } = await guard(formData);
  completeStep(studentId, 4, { counselor_id: me.id, note }, true);
  redirect(`/counselor?done=approved&name=${encodeURIComponent(name)}`);
}

export async function sendBack(formData: FormData) {
  const { me, studentId, note, name } = await guard(formData);
  if (!note) redirect(`/counselor?student=${studentId}&error=note`);
  requestChanges(studentId, me, note);
  redirect(`/counselor?done=changes&name=${encodeURIComponent(name)}`);
}
