import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { confirmGrade } from '@/lib/student-actions';
import { currentClassYear, currentGrade, GRADES, needsGradeConfirm, ordinal } from '@/lib/workflow';
import { TopBar } from '@/components/chrome';

export const dynamic = 'force-dynamic';

export default async function ConfirmGrade({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const me = await requireRole('student');
  if (!needsGradeConfirm(me)) redirect('/student');
  const sp = await searchParams;
  const thisClass = currentClassYear();
  const years = Array.from({ length: 13 }, (_, i) => thisClass + i);
  const guess = currentGrade(me);
  return (
    <div className="frame">
      <TopBar user={me} />
      <div className="pad-sm" style={{ padding: '48px 48px', maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <div className="kicker accent700">New school year · {thisClass - 1}–{String(thisClass).slice(2)}</div>
          <h1 className="h-sm" style={{ fontSize: 44, lineHeight: 1.05, margin: '10px 0 0', letterSpacing: '-0.02em' }}>Welcome back, {me.first_name}.</h1>
          <p style={{ fontSize: 16, margin: '12px 0 0' }}>Before you continue, confirm your grade this school year and when you'll graduate from high school.</p>
        </div>
        {sp.error && <div className="flash flash-err" style={{ padding: '12px 16px' }}>Pick your grade and graduation year.</div>}
        <form action={confirmGrade} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="field">
            <label htmlFor="grade">Grade you're in this school year</label>
            <select id="grade" name="grade" className="input" required defaultValue={guess && guess >= 1 && guess <= 12 ? guess : ''} style={{ maxWidth: 360 }}>
              <option value="" disabled>Pick your grade…</option>
              {GRADES.map((g) => <option key={g} value={g}>{ordinal(g)} grade</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="grad">High school graduation year</label>
            <select id="grad" name="grad_year" className="input" required defaultValue={me.grad_year && years.includes(me.grad_year) ? me.grad_year : ''} style={{ maxWidth: 360 }}>
              <option value="" disabled>Pick your graduation year…</option>
              {years.map((y) => <option key={y} value={y}>Class of {y}</option>)}
            </select>
          </div>
          <div style={{ borderTop: '2px solid var(--color-text)', paddingTop: 20 }}>
            <button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Confirm and continue <span>→</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}
