import Link from 'next/link';
import { currentUser, HOME } from '@/lib/auth';
import { db } from '@/lib/db';
import { OUTREACH_PHONE } from '@/lib/constants';
import { TopBar } from '@/components/chrome';

export const dynamic = 'force-dynamic';

export default async function Help() {
  const me = await currentUser();
  const contact = db().prepare("SELECT first_name, last_name, email FROM users WHERE role = 'admin' AND title = 'Outreach' AND status = 'active' LIMIT 1").get() as
    | { first_name: string; last_name: string; email: string }
    | undefined;
  return (
    <div className="frame">
      <TopBar user={me ?? undefined} nav={me ? [{ href: HOME[me.role], label: 'Back' }] : []} />
      <div className="pad-sm" style={{ padding: 40, maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="kicker accent700">Help</div>
        <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: 0, letterSpacing: '-0.02em' }}>Questions about a step?</h1>
        <p style={{ fontSize: 17, margin: 0 }}>
          {contact ? <>Your DE contact is <strong>{contact.first_name} {contact.last_name}</strong>, Shasta College Outreach. Email <a href={`mailto:${contact.email}`}>{contact.email}</a> or call </> : <>Call Shasta College Outreach at </>}
          <a href={`tel:${OUTREACH_PHONE.replace(/\D/g, '')}`}>{OUTREACH_PHONE}</a>.
        </p>
        {!me && <Link href="/login">Sign in</Link>}
      </div>
    </div>
  );
}
