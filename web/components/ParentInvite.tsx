import { siteOrigin } from '@/lib/site';
import { db } from '@/lib/db';
import { inviteParent } from '@/lib/student-actions';
import { InviteLink } from './InviteLink';

const ERRORS: Record<string, string> = {
  name: "Enter your parent or guardian's first and last name.",
  email: 'Enter a valid email address.',
  taken: "That email belongs to someone who isn't a parent account. Use a different email.",
  self: "That's your own email. Use your parent or guardian's email.",
};

type Parent = { id: number; first_name: string; last_name: string; email: string; status: string; invite_token: string | null };

/** Step 03: the student invites a parent / guardian, who then gets their own account to sign. */
export async function ParentInvite({ studentId, invited, error }: { studentId: number; studentFirst?: string; invited?: number; error?: string }) {
  const parents = db()
    .prepare('SELECT u.id, u.first_name, u.last_name, u.email, u.status, u.invite_token FROM parent_links l JOIN users u ON u.id = l.parent_id WHERE l.student_id = ? ORDER BY u.id')
    .all(studentId) as Parent[];
  const origin = await siteOrigin();
  const message = (link: string) => `Hi! I need your permission to take Shasta College classes through dual enrollment. Please make your account and sign my consent form here: ${link}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {parents.length > 0 && (
        <div>
          <div className="kicker-sm" style={{ paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>Your parents / guardians</div>
          {parents.map((x) => {
            const link = x.invite_token ? `${origin}/invite/${x.invite_token}` : null;
            return (
              <div key={x.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 0', borderBottom: '2px solid var(--color-divider)', background: invited === x.id ? 'var(--color-accent-100)' : undefined }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span><strong>{x.first_name} {x.last_name}</strong> <span className="ink60" style={{ fontSize: 13 }}>· {x.email}</span></span>
                  {x.status === 'active' ? <span className="tag tag-accent">Has an account</span> : <span className="tag tag-neutral">Invite not accepted yet</span>}
                </div>
                {link && <InviteLink link={link} email={x.email} message={message(link)} highlight={invited === x.id} />}
              </div>
            );
          })}
        </div>
      )}
      <form action={inviteParent} style={{ display: 'flex', flexDirection: 'column', gap: 12, border: '2px solid var(--color-text)', padding: '20px 20px 24px' }}>
        <div style={{ fontWeight: 800, fontSize: 17 }}>{parents.length ? 'Invite another parent or guardian' : 'Invite your parent or guardian'}</div>
        <div style={{ fontSize: 14 }}>You'll get a link to text or email them. They make an account with it and sign your consent form.</div>
        {error && ERRORS[error] && <div className="flash flash-err" style={{ padding: '10px 14px' }}>{ERRORS[error]}</div>}
        <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field"><label htmlFor="pfirst">Their first name</label><input id="pfirst" name="first" className="input" required autoComplete="off" /></div>
          <div className="field"><label htmlFor="plast">Their last name</label><input id="plast" name="last" className="input" required autoComplete="off" /></div>
        </div>
        <div className="field"><label htmlFor="pemail">Their email</label><input id="pemail" name="email" type="email" className="input" required autoComplete="off" /></div>
        <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Create invite link <span>→</span></button></div>
      </form>
    </div>
  );
}
