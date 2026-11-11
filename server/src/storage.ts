import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
export function safeFileName(name: string) { return (name.split(/[\\/]/).pop() || "file").replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 120) || "file"; }
export async function saveUpload(root: string, userId: string, file: File) { const relative = `${userId}/${randomUUID()}/${safeFileName(file.name)}`; const target = path.resolve(root, relative); if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid path"); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, Buffer.from(await file.arrayBuffer())); return relative; }
export function resolveOwnedFile(root: string, userId: string, relative: string) { const target = path.resolve(root, relative); const owned = path.resolve(root, userId) + path.sep; return target.startsWith(owned) ? target : null; }

export function removeOwnedFile(root: string, userId: string, relative: string | null | undefined) {
  if (!relative) return false;
  const target = resolveOwnedFile(root, userId, relative);
  if (!target || !fs.existsSync(target)) return false;
  fs.unlinkSync(target);
  const dir = path.dirname(target);
  const owned = path.resolve(root, userId);
  if (dir.startsWith(owned + path.sep)) {
    try { if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir); } catch { /* leftover dir is harmless */ }
  }
  return true;
}
