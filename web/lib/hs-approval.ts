import 'server-only';
import { db, tx } from './db';
import { saveFile, sniff } from './files';
import { completeStep, getProgress, requestChanges } from './workflow';
import { actorOf, logEvent, type Actor } from './audit';
import type { User } from './auth';

export type Signer = {
  /** High school staff account id; null for an outside approver (unlisted school) using an emailed link. */
  id: number | null;
  name: string;
  email?: string | null;
  savedSignatureId?: number | null;
};

/**
 * High school approval, per class per term: approve or decline each pending class and sign once for the batch
 * (saved, drawn, or typed in cursive). Declined classes come off the request and the student picks again, with the
 * note; classes already approved stay approved. `fail` is called with an error code (it redirects).
 */
export function applyHsDecisions(studentId: number, formData: FormData, signer: Signer, fail: (code: string) => never): 'approved' | 'changes' {
  const p = getProgress(studentId)!;
  const note = String(formData.get('note') || '').trim().slice(0, 1000);
  const pending = p.courses.filter((c) => c.hs_status === 'pending');
  const decision = (c: { id: number; term_id: number | null }) => String(formData.get(`d_${c.id}_${c.term_id ?? 0}`) || '');
  if (!pending.length || pending.some((c) => !['approve', 'decline'].includes(decision(c)))) fail('decide');
  const approved = pending.filter((c) => decision(c) === 'approve');
  const declined = pending.filter((c) => decision(c) === 'decline');
  if (declined.length && !note) fail('note');

  let signatureFile: number | null = null;
  const mode = String(formData.get('sign_mode') || '');
  const signedName = String(formData.get('signed_name') || '').trim().slice(0, 80) || signer.name;
  if (approved.length) {
    if (mode === 'saved' && signer.savedSignatureId) {
      signatureFile = signer.savedSignatureId;
    } else {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(formData.get('signature') || ''));
      const buf = m ? Buffer.from(m[1], 'base64') : null;
      if (!buf || buf.length > 2 * 1024 * 1024 || sniff(buf) !== 'image/png') fail('signature');
      signatureFile = saveFile({ studentId, uploadedBy: signer.id ?? studentId, kind: 'hs_signature', filename: 'hs-approval-signature.png', mime: 'image/png', data: buf! });
      if (signer.id && formData.get('save_signature') === 'on') {
        // A staff copy (kept under the staff member's own id) becomes their saved signature.
        const mine = saveFile({ studentId: signer.id, uploadedBy: signer.id, kind: 'staff_signature', filename: 'my-signature.png', mime: 'image/png', data: buf! });
        db().prepare('UPDATE users SET signature_file_id = ? WHERE id = ?').run(mine, signer.id);
      }
    }
  }
  const method = mode === 'type' ? 'typed' : mode === 'saved' ? 'saved' : 'drawn';
  const at = new Date().toISOString();
  tx(() => {
    const ok = db().prepare(`UPDATE course_requests SET hs_status = 'approved', hs_by = ?, hs_at = ?, hs_signed_name = ?, hs_signature_file_id = ?, hs_sign_method = ?, hs_signer_email = ?
      WHERE student_id = ? AND course_id = ? AND term_id IS ?`);
    for (const c of approved) ok.run(signer.id, at, signedName, signatureFile, method, signer.email ?? null, studentId, c.id, c.term_id);
    const del = db().prepare('DELETE FROM course_requests WHERE student_id = ? AND course_id = ? AND term_id IS ?');
    for (const c of declined) del.run(studentId, c.id, c.term_id);
  });
  // History: who approved or declined each class.
  const u = signer.id ? db().prepare('SELECT * FROM users WHERE id = ?').get(signer.id) as User | undefined : undefined;
  const who: Actor = u ? actorOf(u) : { id: null, name: signedName, role: `High school approver (${signer.email ?? 'by link'})` };
  for (const c of approved) logEvent(studentId, who, `High school approved ${c.code}`, `Signed by ${signedName} (${method})`, [c.term_id]);
  for (const c of declined) logEvent(studentId, who, `High school declined ${c.code}; class removed`, note, [c.term_id]);
  if (declined.length) {
    requestChanges(studentId, 4, { id: signer.id }, `${declined.map((c) => `${c.code} (${c.term_name ?? 'no term'})`).join(', ')} not approved: ${note}`);
    return 'changes';
  }
  completeStep(studentId, 4, {
    counselor_id: signer.id, approver_email: signer.email ?? null, note, signed_name: signedName, signature_file_id: signatureFile, sign_method: method, signed_at: at,
    classes: approved.map((c) => `${c.code} (${c.term_name})`),
  }, true);
  return 'approved';
}
