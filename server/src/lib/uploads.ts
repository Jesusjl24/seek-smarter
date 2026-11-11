import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { decodeRow } from "../db.js";
import { removeOwnedFile } from "../storage.js";

export function snapshotResumeRevision(db: Database.Database, userId: string, rawText: string) {
  const text = String(rawText || "");
  const hash = createHash("sha256").update(text).digest("hex");
  const last = db.prepare("SELECT content_hash FROM resume_revisions WHERE user_id=? ORDER BY revision_number DESC LIMIT 1").get(userId) as any;
  if (last?.content_hash === hash) return null;
  const n = (db.prepare("SELECT coalesce(max(revision_number),0)+1 n FROM resume_revisions WHERE user_id=?").get(userId) as any).n;
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare("INSERT INTO resume_revisions(id,user_id,revision_number,raw_text,content_hash,approved_at,created_at) VALUES(?,?,?,?,?,?,?)")
    .run(id, userId, n, text, hash, now, now);
  return id;
}

export function replaceResumeFile(db: Database.Database, uploadDir: string, userId: string, nextPath: string | null | undefined) {
  const profile = db.prepare("SELECT file_path FROM resume_profile WHERE user_id=?").get(userId) as any;
  if (profile?.file_path && profile.file_path !== nextPath) removeOwnedFile(uploadDir, userId, profile.file_path);
}

export function deleteResumeUpload(db: Database.Database, uploadDir: string, userId: string, profileId?: string | null) {
  const profile = (profileId
    ? db.prepare("SELECT * FROM resume_profile WHERE user_id=? AND id=?").get(userId, profileId)
    : db.prepare("SELECT * FROM resume_profile WHERE user_id=?").get(userId)) as any;
  const hasRevision = db.prepare("SELECT 1 FROM resume_revisions WHERE user_id=?").get(userId);
  if (!profile && !hasRevision) return { ok: false as const, status: 404, active: null, promoted: false };
  if (profile?.file_path) removeOwnedFile(uploadDir, userId, profile.file_path);
  const latest = db.prepare("SELECT id FROM resume_revisions WHERE user_id=? ORDER BY revision_number DESC LIMIT 1").get(userId) as any;
  if (latest) db.prepare("DELETE FROM resume_revisions WHERE id=? AND user_id=?").run(latest.id, userId);
  const previous = db.prepare("SELECT * FROM resume_revisions WHERE user_id=? ORDER BY revision_number DESC LIMIT 1").get(userId) as any;
  const now = new Date().toISOString();
  if (previous) {
    if (profile) {
      db.prepare("UPDATE resume_profile SET raw_text=?, file_path=NULL, file_name=NULL, file_type=NULL, updated_at=? WHERE user_id=?").run(previous.raw_text, now, userId);
    } else {
      db.prepare("INSERT INTO resume_profile(id,user_id,raw_text,updated_at) VALUES(?,?,?,?)").run(randomUUID(), userId, previous.raw_text, now);
    }
    const active = decodeRow(db.prepare("SELECT * FROM resume_profile WHERE user_id=?").get(userId));
    return { ok: true as const, status: 200, active, promoted: true };
  }
  db.prepare("DELETE FROM resume_profile WHERE user_id=?").run(userId);
  return { ok: true as const, status: 200, active: null, promoted: false };
}

export function deleteDocumentRevision(db: Database.Database, uploadDir: string, userId: string, revisionId: string) {
  const rev = db.prepare("SELECT * FROM document_revisions WHERE id=? AND user_id=?").get(revisionId, userId) as any;
  if (!rev) return { ok: false as const, status: 404 };
  if (rev.storage_path) removeOwnedFile(uploadDir, userId, rev.storage_path);
  const now = new Date().toISOString();
  db.prepare("UPDATE application_packages SET resume_document_revision_id=NULL, resume_content_hash=NULL, status='draft', updated_at=? WHERE user_id=? AND resume_document_revision_id=?").run(now, userId, revisionId);
  db.prepare("UPDATE application_packages SET cover_letter_document_revision_id=NULL, cover_letter_content_hash=NULL, status='draft', updated_at=? WHERE user_id=? AND cover_letter_document_revision_id=?").run(now, userId, revisionId);
  db.prepare("DELETE FROM document_revisions WHERE id=? AND user_id=?").run(revisionId, userId);
  return { ok: true as const, status: 200 };
}
