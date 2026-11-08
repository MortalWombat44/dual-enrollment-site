import 'server-only';
import { ageOn } from './workflow';

export type ProfileInput = { dob: string; phone: string; address: string; city: string; state: string; zip: string; plans: 'yes' | 'no' | 'unsure' | null };

/** Checks the profile fields. Returns the cleaned values, or the name of the first problem. */
export function parseProfile(formData: FormData, needPlans: boolean): ProfileInput | { error: string } {
  const str = (k: string, max = 120) => String(formData.get(k) || '').trim().replace(/\s+/g, ' ').slice(0, max);
  const dob = str('dob', 10);
  const age = ageOn(dob);
  if (age === null || age < 5 || age > 100) return { error: 'dob' };
  const digits = str('phone', 30).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  if (digits.length !== 10) return { error: 'phone' };
  const phone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  const address = str('address', 200), city = str('city', 80), state = str('state', 2).toUpperCase(), zip = str('zip', 10);
  if (!address || !city || !/^[A-Z]{2}$/.test(state) || !/^\d{5}(-\d{4})?$/.test(zip)) return { error: 'address' };
  const p = String(formData.get('plans') || '');
  const plans = p === 'yes' || p === 'no' || p === 'unsure' ? p : null;
  if (needPlans && !plans) return { error: 'plans' };
  return { dob, phone, address, city, state, zip, plans };
}

export const PROFILE_ERRORS: Record<string, string> = {
  dob: 'Enter a valid date of birth.',
  phone: 'Enter a 10-digit phone number.',
  address: 'Enter your street address, city, 2-letter state and ZIP code.',
  plans: 'Tell us whether you plan to attend Shasta College after high school.',
};
