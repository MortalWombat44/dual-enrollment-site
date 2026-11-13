/**
 * Usual unit limits per term. Students aren't blocked from going over; they (and the admin clearing units) see a note.
 * CCAP schools: 15. Non-CCAP: 11, or 7 in a summer term.
 */
export const UNIT_LIMITS = { ccap: 15, nonCcap: 11, nonCcapSummer: 7 };
export function unitLimit(designation: 'CCAP' | 'NON_CCAP', summer: boolean): number {
  if (designation === 'CCAP') return UNIT_LIMITS.ccap;
  return summer ? UNIT_LIMITS.nonCcapSummer : UNIT_LIMITS.nonCcap;
}
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const OUTREACH_PHONE = '(530) 242-7500';
/** Where parents email to revoke consent. TODO: fill in when Shasta College provides the address. */
export const CONSENT_REVOKE_EMAIL = '';
/**
 * Where students book an appointment with a Shasta College counselor (shown when a prerequisite review needs one).
 * TODO: fill in when Shasta College provides the booking link. Empty = students are told to contact Counseling.
 */
export const COUNSELING_APPOINTMENT_URL = '';
