import { displayName, fmt, pad, type StudentProgress, type StudentStep } from './workflow';

/** Short line under each step in the dashboard grids (2a / 1a). */
export function stepSub(p: StudentProgress, s: StudentStep): string {
  const counselor = p.counselor ? displayName(p.counselor, true) : 'Your counselor';
  const parent = p.parents[0] ? displayName(p.parents[0]) : 'Parent / guardian';
  const codes = p.courses.map((c) => c.code).join(', ');
  switch (s.status) {
    case 'complete':
      if (s.id === 2) return `${codes} · ${fmt(s.completedAt)}`;
      if (s.id === 3) return `Signed ${fmt(s.completedAt)}`;
      if (s.id === 4) return `Approved ${fmt(s.completedAt)}`;
      return fmt(s.completedAt);
    case 'in_review':
      return counselor;
    case 'waiting_parent':
      return parent;
    case 'changes':
      return 'Your counselor asked for changes';
    case 'scheduled':
      return `Opens ${fmt(p.term.registration_opens)}`;
    case 'current':
      return s.mode === 'optional' ? 'Optional · ready when you are' : 'Ready to start';
    case 'locked':
      if (s.id === 5) return `Opens ${fmt(p.term.registration_opens)}`;
      if (s.id === 6) return 'After registration';
      return `After step ${pad(s.num - 1)}`;
  }
}

export function stepTag(s: StudentStep): { label: string; kind: 'accent' | 'outline' | 'neutral' } | null {
  switch (s.status) {
    case 'complete': return null;
    case 'in_review': return { label: 'In review', kind: 'accent' };
    case 'waiting_parent': return { label: 'Waiting on parent', kind: 'accent' };
    case 'changes': return { label: 'Changes requested', kind: 'accent' };
    case 'current': return { label: s.mode === 'optional' ? 'Optional' : 'Start', kind: 'accent' };
    case 'scheduled':
    case 'locked': return { label: 'Locked', kind: 'outline' };
  }
}

/** Is the step “live” (highlighted cell)? */
export function isActive(s: StudentStep) {
  return s.status !== 'complete' && s.status !== 'locked' && s.status !== 'scheduled';
}

/** Hero summary sentence on the student dashboard. */
export function dashboardLine(p: StudentProgress): string {
  if (p.done) return `You've finished every required step for ${p.term.name}. See you in class.`;
  const n = p.next;
  if (!n) return '';
  switch (n.status) {
    case 'in_review': return 'Your courses and parent consent are in. Your counselor is reviewing your plan now.';
    case 'waiting_parent': return 'Your courses are in. Your parent or guardian needs to sign the consent form next.';
    case 'changes': return 'Your counselor asked for a change to your courses. Update them and resubmit.';
    case 'scheduled': return `You're cleared to register. Registration opens ${fmt(p.term.registration_opens)}.`;
    default:
      return p.complete === 0 ? 'Start by applying to Shasta College on CCCApply. It takes about 20 minutes.' : `Next up: ${n.name.toLowerCase()}.`;
  }
}

/** Body copy in the green “Up next” card. */
export function upNextLine(p: StudentProgress, s: StudentStep): string {
  const counselor = p.counselor ? displayName(p.counselor, true) : 'Your counselor';
  const codes = p.courses.map((c) => c.code);
  const list = codes.length > 1 ? codes.slice(0, -1).join(', ') + ' and ' + codes.at(-1) : codes[0] ?? 'your courses';
  switch (s.id) {
    case 1: return 'Apply to Shasta College on CCCApply, then enter your confirmation number here.';
    case 2: return s.status === 'changes' ? `${counselor} asked for changes to your course plan.` : "Pick the Shasta College sections offered for your school.";
    case 3: return p.parents[0] ? `${displayName(p.parents[0])} can sign online or upload a signed form.` : 'Your parent or guardian signs online or uploads a signed form.';
    case 4: return `${counselor} is reviewing ${list}. Usually 2–3 school days.`;
    case 5: return s.status === 'scheduled' ? `Registration opens ${fmt(p.term.registration_opens)} at ${fmt(p.term.registration_opens, 'time')}.` : 'Register for your approved sections in myShasta.';
    default: return 'Get your textbooks and log in to Canvas before the first day.';
  }
}

/** Heading + paragraph on the completion screens (1b / 2d / 1c). */
export function completionCopy(p: StudentProgress, s: StudentStep): { title: string; poster: string; body: string } {
  const counselor = p.counselor ? displayName(p.counselor, true) : 'Your counselor';
  const codes = p.courses.map((c) => c.code);
  const list = codes.length > 1 ? codes.slice(0, -1).join(', ') + ' and ' + codes.at(-1) : codes[0] ?? 'your courses';
  const counselorStep = p.steps.some((x) => x.id === 4);
  const reg = `Registration opens ${fmt(p.term.registration_opens)} at ${fmt(p.term.registration_opens, 'time')}.`;
  switch (s.id) {
    case 1: return { title: 'Your application\nis in.', poster: 'Your Shasta College application is in.', body: `CCCApply confirmation ${String(s.data?.confirmation ?? '')}. Next, pick your courses.` };
    case 2: return { title: 'Your courses\nare picked.', poster: 'Your courses are picked.', body: `You requested ${list}. Your parent or guardian signs the consent form next.` };
    case 3: return { title: 'Parent consent\nis signed.', poster: 'Parent consent is signed.', body: counselorStep ? "We've sent your packet to your high school counselor. You'll see it here when it's approved." : `Your packet is complete. ${reg}` };
    case 4: return { title: `You're approved,\n${p.student.first_name}.`, poster: 'Counselor approved your courses.', body: `${counselor} approved ${list}. ${reg}` };
    case 5: return { title: `You're registered,\n${p.student.first_name}.`, poster: "You're registered for classes.", body: `You're enrolled in ${list} for ${p.term.name}.` };
    default: return { title: "You're ready\nfor class.", poster: "You're ready for class.", body: 'Textbooks and Canvas are set. Watch Canvas for messages from your instructors.' };
  }
}
