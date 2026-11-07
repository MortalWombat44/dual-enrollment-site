import { currentUser } from '@/lib/auth';
import { buildAuditPdf } from '@/lib/audit-pdf';

export const dynamic = 'force-dynamic';

/** Audit PDF for one or more students (?student=ID&student=ID&term=ID...). Super admins only. */
export async function GET(req: Request) {
  const me = await currentUser();
  if (!me || me.role !== 'admin' || me.admin_level !== 'super') return new Response('Not allowed', { status: 403 });
  const url = new URL(req.url);
  const students = url.searchParams.getAll('student').map(Number).filter(Boolean).slice(0, 500);
  const terms = url.searchParams.getAll('term').map(Number).filter(Boolean);
  if (!students.length) return new Response('No students', { status: 400 });
  const pdf = await buildAuditPdf(students, terms, `${me.first_name} ${me.last_name}`);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(Buffer.from(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="dual-enrollment-audit-${stamp}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
