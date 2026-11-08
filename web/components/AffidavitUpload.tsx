/** Upload form for the Private School Affidavit (homeschooled students). Used by students and parents. */
export function AffidavitUpload({ action, studentId, declinedNote }: { action: (fd: FormData) => Promise<void>; studentId?: number; declinedNote?: string | null }) {
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      {declinedNote && (
        <div style={{ borderLeft: '4px solid var(--color-accent)', background: 'var(--color-accent-100)', padding: '12px 16px' }}>
          <div className="kicker-sm accent700">Shasta College asked for a new affidavit</div>
          <div style={{ fontSize: 15, marginTop: 4 }}>“{declinedNote}”</div>
        </div>
      )}
      <p style={{ margin: 0, fontSize: 15 }}>
        Homeschooled students need a copy of the <strong>Private School Affidavit</strong> filed with the California Department of Education for this school year.
        Upload a PDF, or a clear photo or scan (JPG or PNG), up to 10 MB. Shasta College reviews it.
      </p>
      <div className="field"><label htmlFor="affidavit">Private School Affidavit</label>
        <input id="affidavit" name="affidavit" type="file" required accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" className="input" /></div>
      <div><button className="btn btn-primary bigbtn full-sm" style={{ minWidth: 300 }}>Send for review <span>→</span></button></div>
    </form>
  );
}
