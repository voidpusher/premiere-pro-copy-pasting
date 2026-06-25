import { ImageMimeType } from '../types';
import { extensionFromMimeType } from './imageDetection';
import { shortId } from './hashHelpers';

// Node.js modules — gracefully absent in browser preview context
let fs: typeof import('fs') | null = null;
let path: typeof import('path') | null = null;
let os: typeof import('os') | null = null;

try { fs   = require('fs');   } catch { /* browser */ }
try { path = require('path'); } catch { /* browser */ }
try { os   = require('os');   } catch { /* browser */ }

const TEMP_DIR_NAME = 'instant-paste-temp';

export function getTempDir(): string {
  if (!os || !path || !fs) return '/tmp/instant-paste-temp';
  const dir = path.join(os.tmpdir(), TEMP_DIR_NAME);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function generateTempFilePath(mimeType: ImageMimeType, prefix = 'clip'): string {
  const ext = extensionFromMimeType(mimeType);
  const name = `${prefix}_${shortId()}.${ext}`;
  if (!path) return `/tmp/${name}`;
  return path.join(getTempDir(), name);
}

export function saveBase64ToFile(base64: string, filePath: string): void {
  if (!fs) return;
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filePath, buffer);
}

export function fileExists(filePath: string): boolean {
  if (!fs) return false;
  return fs.existsSync(filePath);
}

export function deleteFile(filePath: string): void {
  if (!fs) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // non-fatal
  }
}

export function cleanupTempDir(maxAgeMs = 24 * 60 * 60 * 1000): void {
  if (!fs || !path) return;
  const dir = getTempDir();
  const now = Date.now();
  try {
    for (const file of fs.readdirSync(dir)) {
      const full = path.join(dir, file);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > maxAgeMs) fs.unlinkSync(full);
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
}

export function getFileSize(filePath: string): number {
  if (!fs) return 0;
  try { return fs.statSync(filePath).size; } catch { return 0; }
}

export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Safe filename — strip illegal chars */
export function sanitizeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 120);
}
