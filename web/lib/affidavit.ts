import 'server-only';
import { db } from './db';
import { saveFile, sniff } from './files';
import { MAX_UPLOAD_BYTES } from './constants';

/** Save an uploaded Private School Affidavit for review. Returns an error code, or null when saved. */
export async function saveAffidavit(studentId: number, uploadedBy: number, f: FormDataEntryValue | null): Promise<string | null> {
  if (!(f instanceof File) || f.size === 0) return 'file';
  if (f.size > MAX_UPLOAD_BYTES) return 'size';
  const buf = Buffer.from(await f.arrayBuffer());
  const mime = sniff(buf);
  if (!mime) return 'type';
  const fileId = saveFile({ studentId, uploadedBy, kind: 'affidavit', filename: f.name.slice(0, 120), mime, data: buf });
  db().prepare("INSERT INTO affidavits (student_id, file_id, uploaded_by, uploaded_at, status) VALUES (?,?,?,?, 'pending')").run(studentId, fileId, uploadedBy, new Date().toISOString());
  return null;
}

export const AFFIDAVIT_ERRORS: Record<string, string> = {
  file: 'Choose the Private School Affidavit file to upload.',
  size: 'That file is over 10 MB.',
  type: 'Upload a PDF, JPG or PNG.',
};
