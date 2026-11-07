import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { needsGradeConfirm } from '@/lib/workflow';

/** Every student page: after July 1 each year, confirm grade + graduation year before anything else. */
export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  if (me && needsGradeConfirm(me)) redirect('/confirm-grade');
  return <>{children}</>;
}
