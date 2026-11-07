import Link from 'next/link';
import { Check } from './chrome';
import { isActive, stepSub, stepTag } from '@/lib/stepcopy';
import { pad, type StudentProgress } from '@/lib/workflow';

/** Row of step cells, as in 2a (one row) and 1a (4 per row). */
export function StepGrid({ p, cols, hrefBase, extraCell, big = false }: { p: StudentProgress; cols?: number; hrefBase?: string; extraCell?: React.ReactNode; big?: boolean }) {
  const n = cols ?? p.steps.length;
  const cells = p.steps.length + (extraCell ? 1 : 0);
  return (
    <div className="stack-sm" style={{ display: 'grid', gridTemplateColumns: `repeat(${n},1fr)`, borderTop: '2px solid var(--color-text)' }}>
      {p.steps.map((s, i) => {
        const active = isActive(s);
        const tag = stepTag(s);
        const lastInRow = (i + 1) % n === 0;
        const lastRow = Math.floor(i / n) === Math.floor((cells - 1) / n);
        const numColor = s.status === 'complete' ? 'var(--color-accent)' : active ? 'var(--color-accent-700)' : 'var(--ink-35)';
        const body = (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: big ? 34 : 30, fontWeight: 800, color: numColor }}>{pad(s.num)}</span>
              {s.status === 'complete' ? <Check size={big ? 26 : 24} font={big ? 14 : 13} /> : tag && <span className={`tag tag-${tag.kind}`}>{tag.label}</span>}
            </div>
            <div style={{ fontWeight: 700, fontSize: big ? 16 : 15 }}>{s.short === 'CCCApply' ? s.name : s.short === 'Parent consent' && big ? 'Parent / guardian consent' : s.short}</div>
            <div style={{ fontSize: 13, color: active ? 'var(--color-accent-800)' : 'var(--ink-65)' }}>{stepSub(p, s)}</div>
          </>
        );
        const style: React.CSSProperties = {
          padding: big ? '22px 20px 24px' : '20px 18px 22px',
          borderRight: lastInRow ? undefined : '2px solid var(--color-divider)',
          borderBottom: cols && !lastRow ? '2px solid var(--color-divider)' : undefined,
          display: 'flex', flexDirection: 'column', gap: 10, minHeight: big ? 180 : 170,
          background: active ? 'var(--color-accent-100)' : undefined,
        };
        return hrefBase ? (
          <Link key={s.id} href={`${hrefBase}/${s.id}`} className="unlink noborder-sm" style={style}>{body}</Link>
        ) : (
          <div key={s.id} className="noborder-sm" style={style}>{body}</div>
        );
      })}
      {extraCell}
    </div>
  );
}
