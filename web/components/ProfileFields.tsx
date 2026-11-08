'use client';
import { useEffect, useState } from 'react';

export type ProfileValues = { dob?: string | null; phone?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; plans?: string | null };

/**
 * Student profile fields: date of birth, phone, mailing address, and (for 12th graders) whether they plan to
 * attend Shasta College after high school. The plans question shows when `senior` is true, or when the grade
 * select with id `gradeSelectId` is set to 12.
 */
export function ProfileFields({ values = {}, senior, gradeSelectId, ask = ['dob', 'phone', 'address', 'plans'] }: {
  values?: ProfileValues;
  senior?: boolean;
  gradeSelectId?: string;
  ask?: ('dob' | 'phone' | 'address' | 'plans')[];
}) {
  const [isSenior, setIsSenior] = useState(!!senior);
  useEffect(() => {
    if (!gradeSelectId) return;
    const el = document.getElementById(gradeSelectId) as HTMLSelectElement | null;
    if (!el) return;
    const sync = () => setIsSenior(el.value === '12');
    sync();
    el.addEventListener('change', sync);
    return () => el.removeEventListener('change', sync);
  }, [gradeSelectId]);
  return (
    <>
      {ask.includes('dob') && (
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="dob">Date of birth</label>
          <input id="dob" name="dob" type="date" className="input" required defaultValue={values.dob ?? ''} autoComplete="bday" max={new Date().toISOString().slice(0, 10)} />
        </div>
      )}
      {ask.includes('phone') && (
        <div className="field" style={{ maxWidth: 360 }}>
          <label htmlFor="phone">Phone number</label>
          <input id="phone" name="phone" type="tel" className="input" required defaultValue={values.phone ?? ''} autoComplete="tel" placeholder="(530) 555-0123" />
        </div>
      )}
      {ask.includes('address') && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <legend className="kicker-sm" style={{ marginBottom: 8 }}>Mailing address</legend>
          <div className="field"><label htmlFor="address">Street address</label><input id="address" name="address" className="input" required defaultValue={values.address ?? ''} autoComplete="street-address" /></div>
          <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: '2fr 80px 1fr', gap: 12 }}>
            <div className="field"><label htmlFor="city">City</label><input id="city" name="city" className="input" required defaultValue={values.city ?? ''} autoComplete="address-level2" /></div>
            <div className="field"><label htmlFor="state">State</label><input id="state" name="state" className="input" required maxLength={2} defaultValue={values.state ?? 'CA'} autoComplete="address-level1" /></div>
            <div className="field"><label htmlFor="zip">ZIP</label><input id="zip" name="zip" className="input" required inputMode="numeric" defaultValue={values.zip ?? ''} autoComplete="postal-code" /></div>
          </div>
        </fieldset>
      )}
      {ask.includes('plans') && isSenior && (
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <legend style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>Do you plan to attend Shasta College after high school?</legend>
          {([['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure yet']] as const).map(([v, label]) => (
            <label key={v} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="radio" name="plans" value={v} required defaultChecked={values.plans === v} style={{ accentColor: 'var(--color-accent)' }} /> {label}
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
}
