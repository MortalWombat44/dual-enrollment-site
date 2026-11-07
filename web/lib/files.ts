import 'server-only';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, UPLOAD_DIR } from './db';

export type StoredFile = { id: number; student_id: number; kind: string; filename: string; mime: string; size: number; stored_name: string; created_at: string };

const EXT: Record<string, string> = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

/** Checks magic bytes so a renamed file can't pass as a PDF/JPG/PNG. */
export function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

export function saveFile(opts: { studentId: number; uploadedBy: number; kind: string; filename: string; mime: string; data: Buffer }): number {
  const stored = crypto.randomBytes(16).toString('hex') + (EXT[opts.mime] ?? '');
  fs.writeFileSync(path.join(UPLOAD_DIR, stored), opts.data);
  const safeName = opts.filename.replace(/[^\w.\- ]+/g, '_').slice(0, 120) || 'file';
  const r = db()
    .prepare('INSERT INTO files (student_id, uploaded_by, kind, filename, mime, size, stored_name) VALUES (?,?,?,?,?,?,?)')
    .run(opts.studentId, opts.uploadedBy, opts.kind, safeName, opts.mime, opts.data.length, stored);
  return Number(r.lastInsertRowid);
}

export function getFile(id: number): StoredFile | null {
  return (db().prepare('SELECT * FROM files WHERE id = ?').get(id) as StoredFile | undefined) ?? null;
}

export function readFile(f: StoredFile): Buffer {
  return fs.readFileSync(path.join(UPLOAD_DIR, path.basename(f.stored_name)));
}
