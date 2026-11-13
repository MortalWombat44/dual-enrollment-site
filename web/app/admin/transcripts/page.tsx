import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { Flash } from '@/components/chrome';
import { ConfirmButton } from '@/components/ConfirmButton';
import { BulkTranscriptUpload } from '@/components/BulkTranscriptUpload';
import { transcriptInbox } from '@/lib/transcripts';
import { confirmInbox, discardInboxItem } from '@/lib/transcript-actions';
import { fmt } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const DONE: Record<string, string> = {
  assigned: 'Transcript added to the student’s record. A counselor sees it on Prerequisite review.',
  gone: 'That transcript was already handled.',
  discarded: 'Transcript deleted.',
};
const ERR: Record<string, string> = {
  pick: 'Pick a student from the list, or type their Shasta College ID.',
  shared: 'That Shasta College ID is on more than one account. Pick the student from the list instead.',
};

/** College admins: upload many transcripts at once; each is matched to a student by its file name. */
export default async function TranscriptsPage({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  const me = await requireAdmin('college');
  const sp = await searchParams;
  const inbox = transcriptInbox();
  const students = db().prepare(`SELECT u.id, u.first_name, u.last_name, u.student_number, s.name AS school FROM users u LEFT JOIN schools s ON s.id = u.school_id
    WHERE u.role = 'student' AND u.disabled = 0 ORDER BY u.last_name, u.first_name`).all() as { id: number; first_name: string; last_name: string; student_number: string | null; school: string | null }[];
  const option = (s: (typeof students)[number]) => `${s.last_name}, ${s.first_name} · ${s.student_number ? `ID ${s.student_number}` : 'no ID'} · ${s.school ?? 'no school'} · #${s.id}`;
  return (
    <AdminShell me={me} current="transcripts">
      <AdminHead title="Transcripts" />
      <Flash msg={sp.done ? DONE[sp.done] ?? null : null} />
      <Flash error msg={sp.error ? ERR[sp.error] ?? null : null} />
      <div className="pad-sm" style={{ padding: '20px 40px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 960, borderBottom: '2px solid var(--color-divider)' }}>
        <div className="kicker">Bulk upload</div>
        <div style={{ fontSize: 14 }}>
          Choose as many transcripts as you like (PDF, JPG or PNG, up to 10 MB each). Each file is matched to a student by its <strong>file name</strong>:
        </div>
        <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li><strong>Shasta College ID</strong> in the name (e.g. <code>0412345_transcript.pdf</code>): added to that student right away.</li>
          <li>Otherwise the student&apos;s <strong>first and last name</strong> (e.g. <code>Rivera_Maya.pdf</code>): added right away if exactly one student has that name.</li>
          <li>Anything else goes to <strong>Needs a match</strong> below with the closest student suggested, for you to confirm or change.</li>
        </ul>
        <div className="ink60" style={{ fontSize: 13 }}>Added transcripts show on the student&apos;s Prerequisite review, and answer any “More information needed” request.</div>
        <BulkTranscriptUpload />
      </div>
      <div className="pad-sm" style={{ padding: '20px 40px 40px', display: 'flex', flexDirection: 'column', gap: 12 }} id="inbox">
        <div className="kicker">Needs a match · {inbox.length}</div>
        {inbox.length === 0 && <div className="ink60" style={{ fontSize: 14 }}>Nothing waiting. Every uploaded transcript is on a student&apos;s record.</div>}
        {inbox.length > 0 && (
          <datalist id="students">
            {students.map((s) => <option key={s.id} value={option(s)} />)}
          </datalist>
        )}
        {inbox.map((i) => (
          <div key={i.id} id={`inbox-${i.id}`} data-inbox={i.filename} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 0', borderBottom: '1px solid var(--color-divider)', maxWidth: 960 }}>
            <div style={{ fontSize: 15 }}>
              <a href={`/admin/transcripts/inbox/${i.id}`} target="_blank" rel="noreferrer"><strong>{i.filename}</strong></a>
              <span className="ink60" style={{ fontSize: 13 }}> · uploaded {fmt(i.uploaded_at)} by {i.by_name ?? 'an admin'}</span>
            </div>
            <div style={{ fontSize: 14, color: '#6b3a00' }}>{i.match_note}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {i.suggested_student_id && (
                <form action={confirmInbox}>
                  <input type="hidden" name="inboxId" value={i.id} />
                  <input type="hidden" name="studentId" value={i.suggested_student_id} />
                  <button className="btn btn-primary">Add to {i.suggested_name}</button>
                </form>
              )}
              <form action={confirmInbox} style={{ display: 'flex', gap: 8, flex: '1 1 360px' }}>
                <input type="hidden" name="inboxId" value={i.id} />
                <input name="pick" list="students" className="input" required placeholder={i.suggested_student_id ? 'Or pick another student (name or ID)…' : 'Pick the student (name or ID)…'} aria-label={`Student for ${i.filename}`} style={{ flex: 1, minWidth: 0 }} />
                <button className="btn btn-secondary">Add</button>
              </form>
              <form>
                <input type="hidden" name="inboxId" value={i.id} />
                <ConfirmButton formAction={discardInboxItem} message={`Delete ${i.filename}? It isn't on any student's record.`} style={{ color: '#b3261e', fontSize: 13 }}>Delete</ConfirmButton>
              </form>
            </div>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
