import { displayName, fmt, pad, type StudentProgress, type StudentStep } from './workflow';

/** Short line under each step in the dashboard grids (2a / 1a). */
export function stepSub(p: StudentProgress, s: StudentStep): string {
  // Students and parents never see staff names for high school approval.
  const counselor = 'Your high school';
  const parent = p.parents[0] ? displayName(p.parents[0]) : 'Parent / guardian';
  const codes = p.courses.map((c) => c.code).join(', ');
  switch (s.status) {
    case 'complete':
      if (s.id === 2) return `${codes} · ${fmt(s.completedAt)}`;
      if (s.id === 3) return `Signed ${fmt(s.completedAt)}`;
      if (s.id === 4 || s.id === 8 || s.id === 10) return `Approved ${fmt(s.completedAt)}`;
      if (s.id === 9) return `Sent ${fmt(s.completedAt)}`;
      if (s.id === 7) return `Cleared ${fmt(s.completedAt)}`;
      return fmt(s.completedAt);
    case 'in_review':
      return s.id === 4 ? counselor : s.id === 8 ? 'College counselor' : 'Shasta College';
    case 'waiting_parent':
      return p.parents.length ? parent : 'Invite your parent';
    case 'changes':
      return p.changeBy === 'college' ? 'Shasta College asked for changes' : 'Your high school asked for changes';
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
  if (p.done) return `You've finished every required step for ${p.termLabel}. See you in class.`;
  const n = p.next;
  if (!n) return '';
  switch (n.status) {
    case 'in_review':
      if (n.id === 7) return 'Your high school approved your plan. Shasta College is checking your units now.';
      if (n.id === 8) return 'A Shasta College counselor is reviewing the classes you picked that have a prerequisite.';
      if (n.id === 10) return 'Shasta College is reviewing your report card and principal letter.';
      return `Your high school is reviewing your classes now. Check with your high school counselor if you have questions.`;
    case 'waiting_parent': return p.parents.length ? 'Your parent or guardian needs to sign the consent form before you can pick courses.' : 'Invite your parent or guardian to sign the consent form. You can pick courses once they do.';
    case 'changes': return `${p.changeBy === 'college' ? 'Shasta College' : 'Your high school'} asked for a change to your courses. Update them and resubmit.`;
    case 'scheduled': return `You're cleared to register. Registration opens ${fmt(p.term.registration_opens)}.`;
    default:
      return p.complete === 0 ? 'Start by applying to Shasta College on CCCApply. It takes about 20 minutes.' : `Next up: ${n.name.toLowerCase()}.`;
  }
}

/** Body copy in the green “Up next” card. */
export function upNextLine(p: StudentProgress, s: StudentStep): string {
  // Students and parents never see staff names for high school approval.
  const counselor = 'Your high school';
  const codes = p.courses.map((c) => c.code);
  const list = codes.length > 1 ? codes.slice(0, -1).join(', ') + ' and ' + codes.at(-1) : codes[0] ?? 'your courses';
  switch (s.id) {
    case 1: return 'Apply to Shasta College on CCCApply, then enter your Shasta College ID here.';
    case 2: return s.status === 'changes' ? `${p.changeBy === 'college' ? 'Shasta College' : counselor} asked for changes to your course plan.` : "Pick the Shasta College sections offered for your school.";
    case 3:
      if (!p.parents.length) return 'Invite your parent or guardian. They make an account and sign online or upload a signed form.';
      return p.parents.some((x) => x.status === 'active')
        ? `${displayName(p.parents.find((x) => x.status === 'active')!)} can sign online or upload a signed form.`
        : `${displayName(p.parents[0])} hasn't accepted your invite yet.`;
    case 7: return `Shasta College is checking that ${list} fit your unit limit. Usually 1–2 days.`;
    case 8: return `A college counselor is checking prerequisites for ${p.courses.filter((c) => c.prerequisite).map((c) => c.code).join(', ') || 'your classes'}.`;
    case 9: return 'Students in 8th grade and below send a recent report card or transcript and a letter from their principal.';
    case 10: return `A Shasta College counselor reviews your documents for ${list}, then Shasta College makes the final decision.`;
    case 4: return `Your high school is reviewing ${list}. Check with your high school counselor if you have questions.`;
    case 5: return s.status === 'scheduled' ? `Registration opens ${fmt(p.term.registration_opens)} at ${fmt(p.term.registration_opens, 'time')}.` : 'Register for your approved sections in myShasta.';
    default: return 'Get your textbooks and log in to Canvas before the first day.';
  }
}

/** Heading + paragraph on the completion screens (1b / 2d / 1c). */
export function completionCopy(p: StudentProgress, s: StudentStep): { title: string; poster: string; body: string } {
  // Students and parents never see staff names for high school approval.
  const counselor = 'Your high school';
  const codes = p.courses.map((c) => c.code);
  const list = codes.length > 1 ? codes.slice(0, -1).join(', ') + ' and ' + codes.at(-1) : codes[0] ?? 'your courses';
  const after = (id: number) => p.steps[p.steps.findIndex((x) => x.id === id) + 1];
  const reg = `Registration opens ${fmt(p.term.registration_opens)} at ${fmt(p.term.registration_opens, 'time')}.`;
  // What happens after a step, in a sentence.
  const then = (id: number) => {
    const n = after(id)?.id;
    return n === 4 ? 'Your high school reviews them next.' : n === 9 ? 'Next, send your report card and principal letter.'
      : n === 10 ? 'Shasta College reviews your documents next.' : n === 7 ? 'Shasta College clears your units next.'
      : n === 8 ? 'A college counselor checks prerequisites next.' : reg;
  };
  switch (s.id) {
    case 1: return { title: 'Your application\nis in.', poster: 'Your Shasta College application is in.', body: p.student.student_number ? `Your Shasta College ID is ${p.student.student_number}. Next, your parent or guardian gives consent.` : "Add your Shasta College ID as soon as you get it. You'll be brought back here until you do. Next, your parent or guardian gives consent." };
    case 2: return { title: 'Your courses\nare picked.', poster: 'Your courses are picked.', body: `You requested ${list}. ${then(2)}` };
    case 3: return { title: 'Parent consent\nis signed.', poster: 'Parent consent is signed.', body: 'It covers future terms too, so you only need it once. ' + (after(3)?.id === 2 ? 'Next, pick your courses.' : `Your packet is complete. ${reg}`) };
    case 7: return { title: 'Your units\nare cleared.', poster: 'Shasta College cleared your units.', body: `Shasta College cleared ${list}. ${then(7)}` };
    case 8: return { title: 'Prerequisites\nare approved.', poster: 'Your prerequisites are approved.', body: `A college counselor approved ${list}. ${reg}` };
    case 4: return { title: `You're approved,\n${p.student.first_name}.`, poster: 'Your high school approved your courses.', body: `Your high school approved ${list}. ${then(4)}` };
    case 9: return { title: 'Your documents\nare in.', poster: 'Your documents are in.', body: `Thanks. ${then(9)}` };
    case 10: return { title: `You're approved,\n${p.student.first_name}.`, poster: 'Shasta College approved your request.', body: `Shasta College approved ${list}. ${then(10)}` };
    case 5: return { title: `You're registered,\n${p.student.first_name}.`, poster: "You're registered for classes.", body: `You're enrolled in ${list} for ${p.termLabel}.` };
    default: return { title: "You're ready\nfor class.", poster: "You're ready for class.", body: 'Textbooks and Canvas are set. Watch Canvas for messages from your instructors.' };
  }
}
