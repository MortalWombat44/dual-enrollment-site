'use client';

export function PrintButton() {
  return (
    <button type="button" className="btn btn-secondary no-print" onClick={() => window.print()} style={{ printColorAdjust: 'exact' }}>
      Print / save as PDF
    </button>
  );
}
