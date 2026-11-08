'use server';
import { redirect } from 'next/navigation';
import { applyHsDecisions } from './hs-approval';
import { sendApproverLink, studentForApproverLink } from './approver-links';
import { requireRole } from './auth';
import { getProgress } from './workflow';

/** An outside approver (unlisted school) approves or declines a student's classes from their link. No account. */
export async function approveByLink(formData: FormData) {
  const token = String(formData.get('token') || '');
  const who = studentForApproverLink(token);
  if (!who) redirect(`/hs-approve/${encodeURIComponent(token)}`);
  const p = getProgress(who!.studentId)!;
  if (p.steps.find((s) => s.id === 4)?.status !== 'in_review') redirect(`/hs-approve/${encodeURIComponent(token)}`);
  const name = String(formData.get('signed_name') || '').trim().slice(0, 80) || p.student.hs_approver_name || who!.email;
  const r = applyHsDecisions(who!.studentId, formData, { id: null, name, email: who!.email }, (code) => redirect(`/hs-approve/${encodeURIComponent(token)}?error=${code}`));
  redirect(`/hs-approve/${encodeURIComponent(token)}?done=${r}`);
}

/** The student sends (or re-sends) the approval link to the approver they named. */
export async function studentSendApproverLink() {
  const me = await requireRole('student');
  const r = await sendApproverLink(me.id);
  if (!r) redirect('/student/steps/4');
  redirect(`/student/steps/4?approver_link=${encodeURIComponent(r!.link)}&emailed=${r!.emailed ? 1 : 0}`);
}
