import { requireAdmin } from '@/lib/auth';
import { AdminShell, AdminHead } from '@/components/AdminShell';
import { Flash } from '@/components/chrome';
import { ConfirmButton } from '@/components/ConfirmButton';
import { Countdown } from '@/components/Countdown';
import { classSummaries, runDueDeletions } from '@/lib/file-archive';
import { cancelFileDeletion, scheduleFileDeletion } from '@/lib/file-archive-actions';
import { currentClassYear, fmt } from '@/lib/workflow';

export const dynamic = 'force-dynamic';

const size = (b: number) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.ceil(b / 1e3)} KB`);
const ERR: Record<string, string> = {
  export_first: 'Download the ZIP first. Deleting needs an export made after the newest file for that class.',
  already: 'A deletion is already scheduled for that class.',
  nothing: 'That class has no files to delete.',
  too_late: 'Too late to cancel: that deletion already ran.',
};

/** Super admins: export student files as a ZIP by graduating class, then delete them (10-minute delay, cancellable). */
export default async function StudentFilesPage({ searchParams }: { searchParams: Promise<{ scheduled?: string; cancelled?: string; error?: string }> }) {
  const me = await requireAdmin('super');
  const sp = await searchParams;
  runDueDeletions();
  const classes = classSummaries();
  const thisClass = currentClassYear();
  return (
    <AdminShell me={me} current="files">
      <AdminHead title="Student files" />
      <Flash msg={sp.scheduled ? `Files for ${sp.scheduled === '0' ? 'students with no graduation year' : `the class of ${sp.scheduled}`} will be deleted in 10 minutes. You can cancel until then.` : sp.cancelled ? 'Deletion cancelled. Nothing was deleted.' : null} />
      <Flash error msg={sp.error ? ERR[sp.error] ?? null : null} />
      <div className="pad-sm" style={{ padding: '20px 40px 0', fontSize: 14, maxWidth: 900 }}>
        Download a ZIP of a graduating class&apos;s files: a folder per student with their record (consent, course requests, approvals) as a PDF,
        their parent signature, high school approval signatures and any uploaded documents, plus an index.csv.
        After downloading, you can delete those files from the site. Deleting waits <strong>10 minutes</strong> so it can be cancelled.
        Accounts and their records stay; only the stored files are removed.
      </div>
      <div className="pad-sm" style={{ padding: '20px 40px 40px' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead><tr><th>Class</th><th>Students</th><th>Files</th><th>Size</th><th>Export</th><th>Delete files</th></tr></thead>
          <tbody>
            {classes.map((c) => (
              <tr key={c.year} data-class-year={c.year}>
                <td><strong>{c.year === 0 ? 'No graduation year' : `Class of ${c.year}`}</strong>{c.year >= thisClass && <div className="ink60" style={{ fontSize: 12 }}>Current students</div>}</td>
                <td>{c.students}</td>
                <td>{c.files}</td>
                <td>{c.files ? size(c.bytes) : '—'}</td>
                <td>
                  <a className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: 13 }} href={`/admin/files/export?year=${c.year}`}>Download ZIP</a>
                  {c.exportedAt && <div className="ink60" style={{ fontSize: 12, marginTop: 4 }}>Last downloaded {fmt(c.exportedAt)}{!c.exportCurrent && c.files ? ' · newer files since' : ''}</div>}
                </td>
                <td>
                  {c.deletion ? (
                    <form style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start', fontSize: 13 }}>
                      <input type="hidden" name="id" value={c.deletion.id} />
                      <span style={{ color: '#b3261e' }}>Deleting in <Countdown until={c.deletion.run_at} /></span>
                      <button formAction={cancelFileDeletion} className="btn btn-primary" style={{ padding: '4px 12px', fontSize: 13 }}>Cancel deletion</button>
                    </form>
                  ) : c.files === 0 ? (
                    <span className="ink60" style={{ fontSize: 13 }}>{c.lastDeleted ? `Deleted ${fmt(c.lastDeleted.finished_at)} (${c.lastDeleted.files_deleted} files)` : 'No files'}</span>
                  ) : c.exportCurrent ? (
                    <form>
                      <input type="hidden" name="year" value={c.year} />
                      <ConfirmButton formAction={scheduleFileDeletion} className="btn btn-ghost" style={{ color: '#b3261e', fontSize: 13 }}
                        message={`Delete ${c.files} files for ${c.year === 0 ? 'students with no graduation year' : `the class of ${c.year}`}? This starts a 10-minute timer; you can cancel until it runs.${c.year >= thisClass ? ' These are current students.' : ''}`}>
                        Delete files…
                      </ConfirmButton>
                    </form>
                  ) : (
                    <span className="ink60" style={{ fontSize: 13 }}>Download the ZIP first</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
