'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Result = { name: string; state: 'waiting' | 'sending' | 'assigned' | 'review' | 'error'; text: string };

/**
 * Pick many transcripts at once. They're sent one at a time (so a big batch is fine), each matched to a student by
 * its file name. Sure matches are added right away; the rest wait below for staff to confirm.
 */
export function BulkTranscriptUpload() {
  const router = useRouter();
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const set = (i: number, r: Partial<Result>) => setResults((rs) => rs.map((x, j) => (j === i ? { ...x, ...r } : x)));

  const send = async (files: File[]) => {
    setBusy(true);
    setResults(files.map((f) => ({ name: f.name, state: 'waiting', text: 'Waiting…' })));
    for (let i = 0; i < files.length; i++) {
      set(i, { state: 'sending', text: 'Uploading…' });
      try {
        const fd = new FormData();
        fd.set('file', files[i]);
        const res = await fetch('/admin/transcripts/upload', { method: 'POST', body: fd });
        const j = await res.json();
        if (!res.ok) set(i, { state: 'error', text: j.error ?? 'Couldn’t upload this file.' });
        else if (j.status === 'assigned') set(i, { state: 'assigned', text: `Added to ${j.student}. ${j.note}` });
        else set(i, { state: 'review', text: `Needs a look: ${j.note}` });
      } catch {
        set(i, { state: 'error', text: 'Couldn’t upload this file. Check your connection and try again.' });
      }
    }
    setBusy(false);
    router.refresh(); // show new items in "Needs a match"
  };

  const counts = { assigned: results.filter((r) => r.state === 'assigned').length, review: results.filter((r) => r.state === 'review').length, error: results.filter((r) => r.state === 'error').length };
  const color = { waiting: 'var(--ink-60)', sending: 'var(--ink-60)', assigned: 'var(--color-accent-700)', review: '#8a4b00', error: '#b3261e' } as const;

  return (
    <form
      data-bulk-transcripts
      onSubmit={(e) => { e.preventDefault(); const input = e.currentTarget.elements.namedItem('files') as HTMLInputElement; const files = [...(input.files ?? [])]; if (files.length) { void send(files); input.value = ''; } }}
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input name="files" type="file" multiple required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="input" aria-label="Transcript files" style={{ maxWidth: 420 }} disabled={busy} />
        <button className="btn btn-primary" disabled={busy} style={{ justifyContent: 'space-between', minWidth: 200 }}>{busy ? 'Uploading…' : 'Upload transcripts'} <span>→</span></button>
      </div>
      {results.length > 0 && (
        <div role="status" style={{ fontSize: 14, fontWeight: 700 }}>
          {busy ? `Uploading ${results.filter((r) => r.state !== 'waiting' && r.state !== 'sending').length + 1} of ${results.length}…`
            : `Done: ${counts.assigned} added to a student, ${counts.review} need${counts.review === 1 ? 's' : ''} a look${counts.error ? `, ${counts.error} couldn’t be uploaded` : ''}.`}
        </div>
      )}
      {results.length > 0 && (
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>File</th><th>Result</th></tr></thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} data-result={r.state}><td style={{ wordBreak: 'break-all' }}>{r.name}</td><td style={{ color: color[r.state], fontWeight: r.state === 'assigned' || r.state === 'review' ? 700 : 400 }}>{r.text}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </form>
  );
}
