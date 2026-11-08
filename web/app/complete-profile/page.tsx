import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { saveProfile } from '@/lib/student-actions';
import { currentGrade, profileMissing } from '@/lib/workflow';
import { PROFILE_ERRORS } from '@/lib/profile';
import { ProfileFields } from '@/components/ProfileFields';
import { TopBar } from '@/components/chrome';

export const dynamic = 'force-dynamic';

/** Students missing date of birth, phone, address (or, in 12th grade, plans after high school) fill them in first. */
export default async function CompleteProfile({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireRole('student');
  const missing = profileMissing(me);
  if (!missing.length) redirect('/student');
  const sp = await searchParams;
  return (
    <div className="frame">
      <TopBar user={me} />
      <div className="pad-sm" style={{ padding: '48px 48px', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="kicker accent700">Your account</div>
          <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>A few details, {me.first_name}.</h1>
          <p style={{ fontSize: 16, margin: '12px 0 0' }}>Shasta College needs your {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} before you continue.</p>
        </div>
        {sp.error && PROFILE_ERRORS[sp.error] && <div className="flash flash-err" style={{ padding: '12px 16px' }}>{PROFILE_ERRORS[sp.error]}</div>}
        <form action={saveProfile} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ProfileFields
            senior={currentGrade(me) === 12}
            values={{ dob: me.date_of_birth, phone: me.phone, address: me.address_line, city: me.city, state: me.state, zip: me.zip, plans: me.plans_shasta }}
          />
          <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20 }}>
            <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Save and continue <span>→</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
