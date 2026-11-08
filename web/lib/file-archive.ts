import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { Zip, ZipPassThrough, ZipDeflate } from 'fflate';
import { db, UPLOAD_DIR, tx } from './db';
import { buildAuditPdf } from './audit-pdf';

/**
 * Student files by graduating class: export as a ZIP, then delete (10 minutes later, cancellable).
 * "Student files" are the files stored for students: parent signatures, uploaded consent forms, high school
 * approval signatures, young student documents. Staff members' own saved signatures aren't included.
 * Class 0 means "no graduation year on file".
 */
export const DELETE_DELAY_MS = 10 * 60 * 1000;

type FileRow = { id: number; student_id: number; kind: string; filename: string; mime: string; size: number; stored_name: string; created_at: string };
type Student = { id: number; first_name: string; last_name: string; student_number: string | null; grad_year: number | null };

const classWhere = (year: number) => (year === 0 ? 'u.grad_year IS NULL' : 'u.grad_year = ?');
const classArgs = (year: number) => (year === 0 ? [] : [year]);

function filesFor(year: number): FileRow[] {
  return db().prepare(`SELECT f.* FROM files f JOIN users u ON u.id = f.student_id
    WHERE u.role = 'student' AND f.kind != 'staff_signature' AND ${classWhere(year)} ORDER BY f.student_id, f.id`).all(...classArgs(year)) as FileRow[];
}
function studentsFor(year: number): Student[] {
  return db().prepare(`SELECT u.id, u.first_name, u.last_name, u.student_number, u.grad_year FROM users u
    WHERE u.role = 'student' AND ${classWhere(year)} ORDER BY u.last_name, u.first_name`).all(...classArgs(year)) as Student[];
}

export type ClassSummary = {
  year: number; students: number; files: number; bytes: number;
  exportedAt: string | null; exportCurrent: boolean;
  deletion: { id: number; run_at: string; status: string; requested_at: string } | null;
  lastDeleted: { finished_at: string; files_deleted: number } | null;
};

/** Every graduating class with students, newest first, with file counts and export / deletion status. */
export function classSummaries(): ClassSummary[] {
  const d = db();
  const years = (d.prepare("SELECT DISTINCT COALESCE(grad_year, 0) AS y FROM users WHERE role = 'student' ORDER BY y DESC").all() as { y: number }[]).map((r) => r.y);
  return years.map((year) => {
    const files = filesFor(year);
    const exp = d.prepare('SELECT exported_at FROM file_exports WHERE grad_year = ? ORDER BY exported_at DESC LIMIT 1').get(year) as { exported_at: string } | undefined;
    // The export is "current" if it was made after the newest file in the class.
    const newest = files.reduce((m, f) => (f.created_at > m ? f.created_at : m), '');
    const exportCurrent = !!exp && (!newest || (d.prepare('SELECT datetime(?) >= datetime(?) AS ok').get(exp.exported_at, newest) as { ok: number }).ok === 1);
    return {
      year,
      students: studentsFor(year).length,
      files: files.length,
      bytes: files.reduce((n, f) => n + f.size, 0),
      exportedAt: exp?.exported_at ?? null,
      exportCurrent,
      deletion: (d.prepare("SELECT id, run_at, status, requested_at FROM file_deletions WHERE grad_year = ? AND status = 'scheduled' ORDER BY id DESC LIMIT 1").get(year) as ClassSummary['deletion']) ?? null,
      lastDeleted: (d.prepare("SELECT finished_at, files_deleted FROM file_deletions WHERE grad_year = ? AND status = 'done' ORDER BY id DESC LIMIT 1").get(year) as ClassSummary['lastDeleted']) ?? null,
    };
  });
}

const safe = (s: string) => s.replace(/[^\w.\- ]+/g, '_').trim() || 'file';
const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const KIND: Record<string, string> = {
  signature: 'Parent signature', consent_upload: 'Uploaded consent form', hs_signature: 'High school approval signature',
  young_transcript: 'Transcript / report card', young_letter: "Principal's letter", affidavit: 'Private School Affidavit',
};

/**
 * Streams the class's ZIP: one folder per student (their files + their audit PDF) and an index.csv.
 * Records the export so deleting is allowed afterwards.
 */
export function exportClassZip(year: number, by: { id: number; name: string }): ReadableStream<Uint8Array> {
  const students = studentsFor(year);
  const files = filesFor(year);
  const byStudent = new Map<number, FileRow[]>();
  for (const f of files) byStudent.set(f.student_id, [...(byStudent.get(f.student_id) ?? []), f]);
  db().prepare('INSERT INTO file_exports (grad_year, exported_by, exported_at, file_count) VALUES (?,?,?,?)').run(year, by.id, new Date().toISOString(), files.length);

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) { controller.error(err); return; }
        controller.enqueue(chunk);
        if (final) controller.close();
      });
      const add = (name: string, data: Uint8Array, compress: boolean) => {
        const entry = compress ? new ZipDeflate(name, { level: 6 }) : new ZipPassThrough(name);
        zip.add(entry);
        entry.push(data, true);
      };
      const index = [['Student', 'Shasta College ID', 'Class of', 'Folder', 'File', 'What it is', 'Uploaded', 'Bytes'].map(csvCell).join(',')];
      for (const s of students) {
        const folder = safe(`${s.last_name}_${s.first_name}_${s.student_number ?? `id${s.id}`}`);
        // The student's record (consent, course requests, approvals) as a PDF.
        add(`${folder}/record.pdf`, await buildAuditPdf([s.id], [], by.name), false);
        for (const f of byStudent.get(s.id) ?? []) {
          const name = `${f.id}-${safe(f.filename)}`;
          try {
            add(`${folder}/${name}`, fs.readFileSync(path.join(UPLOAD_DIR, path.basename(f.stored_name))), false);
          } catch {
            index.push([`${s.first_name} ${s.last_name}`, s.student_number, s.grad_year ?? '', folder, name, 'MISSING ON DISK', f.created_at, f.size].map(csvCell).join(','));
            continue;
          }
          index.push([`${s.first_name} ${s.last_name}`, s.student_number, s.grad_year ?? '', folder, name, KIND[f.kind] ?? f.kind, f.created_at, f.size].map(csvCell).join(','));
        }
      }
      add('index.csv', new TextEncoder().encode('﻿' + index.join('\r\n') + '\r\n'), true);
      zip.end();
    },
  });
}

/** Schedule deleting a class's files in 10 minutes. Needs a ZIP export made after the newest file. */
export function scheduleDeletion(year: number, byId: number): 'ok' | 'export_first' | 'already' | 'nothing' {
  const c = classSummaries().find((x) => x.year === year);
  if (!c || c.files === 0) return 'nothing';
  if (c.deletion) return 'already';
  if (!c.exportCurrent) return 'export_first';
  const now = Date.now();
  db().prepare("INSERT INTO file_deletions (grad_year, requested_by, requested_at, run_at, status) VALUES (?,?,?,?, 'scheduled')")
    .run(year, byId, new Date(now).toISOString(), new Date(now + DELETE_DELAY_MS).toISOString());
  return 'ok';
}

export function cancelDeletion(id: number, byId: number): boolean {
  return Number(db().prepare("UPDATE file_deletions SET status = 'cancelled', cancelled_by = ?, finished_at = ? WHERE id = ? AND status = 'scheduled'")
    .run(byId, new Date().toISOString(), id).changes) > 0;
}

/** Carry out deletions whose 10 minutes are up. Runs every 30 seconds (instrumentation.ts) and on page loads. */
export function runDueDeletions() {
  const d = db();
  const due = d.prepare("SELECT id, grad_year FROM file_deletions WHERE status = 'scheduled' AND run_at <= ?").all(new Date().toISOString()) as { id: number; grad_year: number }[];
  for (const job of due) {
    // Claim the job first, so two runs can't both do it.
    if (Number(d.prepare("UPDATE file_deletions SET status = 'done', finished_at = ? WHERE id = ? AND status = 'scheduled'").run(new Date().toISOString(), job.id).changes) === 0) continue;
    const files = filesFor(job.grad_year);
    tx(() => {
      const clearHs = d.prepare('UPDATE course_requests SET hs_signature_file_id = NULL WHERE hs_signature_file_id = ?');
      const del = d.prepare('DELETE FROM files WHERE id = ?');
      for (const f of files) { clearHs.run(f.id); del.run(f.id); }
      d.prepare('UPDATE file_deletions SET files_deleted = ?, bytes_deleted = ? WHERE id = ?').run(files.length, files.reduce((n, f) => n + f.size, 0), job.id);
    });
    for (const f of files) {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(f.stored_name))); } catch { /* already gone */ }
    }
  }
}
