import { archivedRequests, fmt } from '@/lib/workflow';

/**
 * Staff only: class requests archived because registration for their term was turned off before the student
 * registered. Kept so staff can see why a student didn't end up enrolled.
 */
export function ArchivedRequests({ studentId, style }: { studentId: number; style?: React.CSSProperties }) {
  const rows = archivedRequests(studentId);
  if (!rows.length) return null;
  return (
    <div className="pad-sm" data-archived style={{ display: 'flex', flexDirection: 'column', gap: 6, ...style }}>
      <div className="kicker">Archived requests · {rows.length}</div>
      {rows.map((r, i) => (
        <div key={i} style={{ fontSize: 13, borderBottom: '1px solid var(--color-divider)', paddingBottom: 6 }}>
          <strong>{r.code}</strong> · {r.title} · {r.units} units · {r.term_name ?? 'No term'}
          <div className="ink60">Archived {fmt(r.archived_at)}. {r.archived_reason}</div>
        </div>
      ))}
    </div>
  );
}
