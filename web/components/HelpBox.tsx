import { helpRequests } from '@/lib/help';
import { studentAskHelp } from '@/lib/help-actions';
import { fmt } from '@/lib/workflow';

/** "Stuck? Ask for help": the student's help requests (and replies) plus a form to send a new one. */
export function HelpBox({ studentId, back, status }: { studentId: number; back: string; status?: string }) {
  const reqs = helpRequests(studentId).slice(0, 3);
  return (
    <div id="help" className="pad-sm" style={{ padding: '24px 40px 32px', borderTop: '2px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 820 }}>
      <h3 style={{ margin: 0, fontSize: 18 }}>Stuck? Ask Shasta College for help</h3>
      {status === 'sent' && <div className="flash" role="status">Sent. Shasta College staff will get back to you.</div>}
      {status === 'empty' && <div className="flash flash-err">Tell us where you&apos;re stuck.</div>}
      {reqs.map((r) => (
        <div key={r.id} style={{ fontSize: 14, borderLeft: `4px solid ${r.status === 'open' ? 'var(--color-accent)' : 'var(--color-divider)'}`, paddingLeft: 12 }}>
          <div><span className="ink60">{fmt(r.created_at)} · {r.raised_role === 'counselor' ? 'Your high school asked' : 'You asked'}:</span> “{r.message}”</div>
          <div className="ink60" style={{ fontSize: 13 }}>{r.status === 'open' ? 'Waiting for Shasta College' : `Resolved ${fmt(r.resolved_at)}`}{r.reply ? <> · <span style={{ color: 'var(--color-text)' }}>Reply: “{r.reply}”</span></> : ''}</div>
        </div>
      ))}
      <form action={studentAskHelp} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input type="hidden" name="back" value={back} />
        <div className="field"><label htmlFor="help-message">Where are you stuck?</label>
          <textarea id="help-message" name="message" className="input" required minLength={3} maxLength={1000} style={{ minHeight: 70 }} placeholder="e.g. I can't find my Shasta College ID, or my class isn't listed" /></div>
        <div><button className="btn btn-secondary">I need help</button></div>
      </form>
    </div>
  );
}
