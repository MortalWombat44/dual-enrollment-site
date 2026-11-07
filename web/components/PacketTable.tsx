import { fmt, type StudentProgress } from '@/lib/workflow';

export function PacketTable({ p }: { p: StudentProgress }) {
  const st = (id: number) => p.steps.find((s) => s.id === id);
  const app = st(1), courses = st(2), consent = st(3), counselor = st(4);
  const rows: { doc: string; tag: string; kind: 'accent' | 'neutral'; at: string; href?: string }[] = [];
  if (app) rows.push({ doc: 'Shasta College application (CCCApply)', ...(app.completedAt ? { tag: 'Received', kind: 'accent', at: fmt(app.completedAt) } : { tag: 'Not started', kind: 'neutral', at: '—' }) });
  if (consent) rows.push({ doc: 'Parent / guardian consent', ...(consent.completedAt ? { tag: 'Received', kind: 'accent', at: fmt(consent.completedAt), href: `/consent/${p.student.id}` } : { tag: 'Waiting on parent', kind: 'neutral', at: '—' }) });
  if (courses) {
    const codes = p.courses.map((c) => (c.term_name ? `${c.code} (${c.term_name})` : c.code)).join(', ');
    const label = codes ? `Course request — ${codes}` : 'Course request';
    const status = !courses.completedAt
      ? (courses.status === 'changes' ? { tag: 'Changes requested', kind: 'neutral' as const } : { tag: 'Not submitted', kind: 'neutral' as const })
      : counselor && !counselor.completedAt ? { tag: 'Pending counselor', kind: 'neutral' as const }
      : { tag: counselor ? 'Approved' : 'Received', kind: 'accent' as const };
    rows.push({ doc: label, ...status, at: fmt(counselor?.completedAt ?? courses.completedAt) || '—' });
  }
  return (
    <table className="table" style={{ width: '100%' }}>
      <thead><tr><th>Document</th><th>Status</th><th>Updated</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.doc}>
            <td>{r.href ? <a href={r.href}>{r.doc}</a> : r.doc}</td>
            <td><span className={`tag tag-${r.kind}`}>{r.tag}</span></td>
            <td>{r.at}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
