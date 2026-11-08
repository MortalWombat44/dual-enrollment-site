import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { needsGradeConfirm, profileMissing } from '@/lib/workflow';

/** Every student page: after July 1 each year, confirm grade + graduation year; then fill in any missing profile details. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (me && needsGradeConfirm(me)) redirect('/confirm-grade');
  // Then any missing date of birth, contact info, or (12th grade) plans after high school.
  if (me && profileMissing(me).length) redirect('/complete-profile');
  return <>{children}</>;
}
