import { currentUser } from '@/lib/auth';
import { getProgress } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export async function GET() {
  const me = await currentUser();
  if (!me || me.role !== 'student') return new Response('Not signed in', { status: 401 });
  const p = getProgress(me.id);
  if (!p) return new Response('No enrollment', { status: 404 });
  const start = new Date(p.term.registration_opens);
  const end = new Date(start.getTime() + 30 * 60e3);
  const courses = p.courses.map((c) => c.code).join(', ');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shasta College//Dual Enrollment//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:de-registration-${p.term.id}-${me.id}@shastacollege.edu`,
    `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:Shasta College registration opens (${p.term.name})`,
    `DESCRIPTION:Register in myShasta for ${courses || 'your approved courses'}.`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY', 'DESCRIPTION:Registration opens soon', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  return new Response(ics, {
    headers: { 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'attachment; filename="shasta-registration.ics"' },
  });
}
