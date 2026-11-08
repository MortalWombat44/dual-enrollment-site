'use client';
import { useState } from 'react';
import { addCourseInline, saveCourseInline, setCourseActive, type CourseResult } from '@/lib/course-actions';
import type { Course } from '@/lib/workflow';

const small: React.CSSProperties = { minHeight: 32, padding: '4px 8px', fontSize: 13 };
type Status = { kind: 'busy' | 'ok' | 'err'; text: string } | undefined;

/**
 * Editable course list that saves in place (no page reload). Removed courses are hidden until
 * "Show removed" is clicked. Dual Enrollment (schoolId set): period, teacher, term offered.
 */
export function CourseEditorClient({ initial, requested, terms, schoolId }: {
  initial: Course[];
  requested: Record<number, number>;
  terms: { id: number; name: string }[];
  schoolId?: number;
}) {
  const de = !!schoolId;
  const [rows, setRows] = useState(initial);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [showRemoved, setShowRemoved] = useState(false);
  const [addKey, setAddKey] = useState(0);
  const cols = de ? '90px 1.3fr 56px 56px 1fr 1fr 120px 170px' : '110px 2fr 64px 1.4fr 170px';
  const removedCount = rows.filter((c) => !c.active).length;
  const visible = rows.filter((c) => c.active || showRemoved);

  const run = async (key: string, fn: () => Promise<CourseResult>, done: string) => {
    setStatus((s) => ({ ...s, [key]: { kind: 'busy', text: 'Saving…' } }));
    try {
      const r = await fn();
      if (!r.ok) { setStatus((s) => ({ ...s, [key]: { kind: 'err', text: r.error } })); return null; }
      setStatus((s) => ({ ...s, [key]: { kind: 'ok', text: done } }));
      setTimeout(() => setStatus((s) => (s[key]?.kind === 'ok' ? { ...s, [key]: undefined } : s)), 2500);
      return r.course;
    } catch {
      setStatus((s) => ({ ...s, [key]: { kind: 'err', text: 'Couldn’t save. Check your connection and try again.' } }));
      return null;
    }
  };
  const replace = (c: Course) => setRows((rs) => rs.map((x) => (x.id === c.id ? c : x)));

  const note = (key: string) => {
    const st = status[key];
    if (!st) return null;
    return <span role="status" style={{ fontSize: 12, fontWeight: 700, color: st.kind === 'err' ? '#b3261e' : st.kind === 'ok' ? 'var(--color-accent-700)' : 'var(--ink-60)' }}>{st.kind === 'ok' ? `✓ ${st.text}` : st.text}</span>;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }} data-course-editor>
      <div className="kicker-sm" style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, paddingBottom: 8, borderBottom: '2px solid var(--color-text)' }}>
        <span>Code</span><span>Title</span><span>Units</span>{de && <><span>Period</span><span>Teacher</span></>}<span>Prerequisite</span>{de && <span>Term</span>}
        <span style={{ textAlign: 'right' }}>
          {removedCount > 0 && (
            <button type="button" className="btn btn-ghost" style={{ fontSize: 12, padding: 0, color: 'var(--color-accent-700)', textTransform: 'none', letterSpacing: 0 }} onClick={() => setShowRemoved((v) => !v)}>
              {showRemoved ? 'Hide removed' : `Show removed (${removedCount})`}
            </button>
          )}
        </span>
      </div>
      {visible.length === 0 && <div className="ink60" style={{ fontSize: 14, padding: '12px 0' }}>No courses yet.</div>}
      {visible.map((c) => (
        <Row key={c.id} c={c} cols={cols} de={de} terms={terms} requested={requested[c.id] ?? 0} note={note(String(c.id))}
          onSave={async (fd) => { const r = await run(String(c.id), () => saveCourseInline(fd), 'Saved'); if (r) replace(r); }}
          onActive={async (on) => { const r = await run(String(c.id), () => setCourseActive(c.id, on), on ? 'Restored' : 'Removed'); if (r) replace(r); }} />
      ))}
      <form
        key={addKey}
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          if (schoolId) fd.set('school_id', String(schoolId));
          const c = await run('new', () => addCourseInline(fd), 'Added');
          if (c) { setRows((rs) => [...rs, c]); setAddKey((k) => k + 1); }
        }}
        style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '12px 0', background: 'var(--color-accent-100)', marginTop: 8 }}
      >
        <Fields de={de} terms={terms} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button className="btn btn-primary" style={{ padding: '6px 10px', fontSize: 13, justifyContent: 'space-between' }}>Add course <span>+</span></button>
          {note('new')}
        </span>
      </form>
      <div className="ink60" style={{ fontSize: 12, marginTop: 8 }}>
        {de ? 'Dual Enrollment: Shasta College courses taught at this high school. Only students at this school see them.' : 'Concurrent Enrollment: courses taught at Shasta College. Students at every school see them.'}
        {' '}Removing a course hides it from new requests; students who already asked for it keep it.
      </div>
    </div>
  );

}

function Fields({ c, de, terms }: { c?: Course; de: boolean; terms: { id: number; name: string }[] }) {
  return (
    <>
      <input name="code" className="input" style={small} defaultValue={c?.code} placeholder="ENGL 1A" required aria-label="Code" />
      <input name="title" className="input" style={small} defaultValue={c?.title} placeholder="Title" required aria-label="Title" />
      <input name="units" type="number" min={0.5} max={10} step={0.5} className="input" style={small} defaultValue={c?.units ?? 3} required aria-label="Units" />
      {de && (
        <>
          <input name="period" className="input" style={small} defaultValue={c?.period ?? ''} placeholder="2" aria-label="Period" />
          <input name="teacher" className="input" style={small} defaultValue={c?.teacher ?? ''} placeholder="Teacher" aria-label="Teacher" />
        </>
      )}
      <input name="prerequisite" className="input" style={small} defaultValue={c?.prerequisite ?? ''} placeholder="None" aria-label="Prerequisite" />
      {de && (
        <select name="offered_term_id" className="input" style={small} defaultValue={c?.offered_term_id ?? ''} aria-label="Term offered">
          <option value="">Every term</option>
          {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
    </>
  );
}

/** One course: its own form, so saving one row never touches another (or unsaved edits in another). */
function Row({ c, cols, de, terms, requested, note, onSave, onActive }: {
  c: Course; cols: string; de: boolean; terms: { id: number; name: string }[]; requested: number; note: React.ReactNode;
  onSave: (fd: FormData) => Promise<void>; onActive: (on: boolean) => Promise<void>;
}) {
  return (
    <form
      data-course={c.code}
      onSubmit={async (e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); fd.set('id', String(c.id)); await onSave(fd); }}
      style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--color-divider)', opacity: c.active ? 1 : 0.55 }}
    >
      <Fields c={c} de={de} terms={terms} />
      <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }}>Save</button>
        {c.active ? (
          <button type="button" className="btn btn-ghost" style={{ fontSize: 13, color: '#b3261e' }}
            title={requested ? `${requested} student(s) keep this on their request` : undefined} onClick={() => onActive(false)}>Remove</button>
        ) : (
          <>
            <button type="button" className="btn btn-ghost" style={{ fontSize: 13, color: 'var(--color-accent-700)' }} onClick={() => onActive(true)}>Restore</button>
            <span className="tag tag-neutral">Removed</span>
          </>
        )}
        {note}
      </span>
    </form>
  );
}
