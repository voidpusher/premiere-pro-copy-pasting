import { ImageMimeType } from '../types';
import {
  detectMimeTypeFromBuffer,
  isSupportedMimeType,
  mimeTypeFromUrl,
} from '../utils/imageDetection';
import { generateTempFilePath, saveBase64ToFile } from '../utils/fileHelpers';

export interface DownloadResult {
  filePath: string;
  mimeType: ImageMimeType;
  sizeBytes: number;
}

const MAX_DOWNLOAD_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export class URLDownloader {
  /**
   * Download an image URL.
   * Tries Node.js https/http first (bypasses CORS, works offline from browser context).
   * Falls back to browser fetch() for environments where Node.js is unavailable.
   */
  async download(url: string): Promise<DownloadResult> {
    try {
      return await this.downloadViaNodeHttp(url);
    } catch (nodeErr) {
      console.warn('[URLDownloader] Node.js http failed, trying fetch fallback', nodeErr);
      return await this.downloadViaFetch(url);
    }
  }

  private downloadViaNodeHttp(url: string): Promise<DownloadResult> {
    return new Promise((resolve, reject) => {
      let https: typeof import('https') | null = null;
      let http:  typeof import('http')  | null = null;
      let fs:    typeof import('fs')    | null = null;

      try { https = require('https'); } catch { return reject(new Error('https not available')); }
      try { http  = require('http');  } catch {}
      try { fs    = require('fs');    } catch { return reject(new Error('fs not available')); }

      if (!https || !fs) return reject(new Error('Node.js modules unavailable'));

      const mimeType  = (mimeTypeFromUrl(url) ?? 'image/png') as ImageMimeType;
      const filePath  = generateTempFilePath(mimeType, 'url');
      const fileStream = fs.createWriteStream(filePath);
      const lib       = url.startsWith('https') ? https : (http ?? https);

      const req = lib.get(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      }, (res: any) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          fileStream.destroy();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          const sizeBytes = (fs!.existsSync(filePath) ? fs!.statSync(filePath).size : 0);
          resolve({ filePath, mimeType, sizeBytes });
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.setTimeout(25_000, () => { req.destroy(); reject(new Error('Download timed out')); });
    });
  }

  private async downloadViaFetch(url: string): Promise<DownloadResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InstantPaste/1.0)' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.byteLength > MAX_DOWNLOAD_SIZE_BYTES) {
        throw new Error(`Image too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
      }

      // Detect actual mime type from magic bytes first
      let mimeType: ImageMimeType =
        detectMimeTypeFromBuffer(buffer) ??
        (isSupportedMimeType(contentType.split(';')[0].trim())
          ? (contentType.split(';')[0].trim() as ImageMimeType)
          : mimeTypeFromUrl(url) ?? 'image/png');

      const filePath = generateTempFilePath(mimeType, 'url');
      saveBase64ToFile(buffer.toString('base64'), filePath);

      return { filePath, mimeType, sizeBytes: buffer.byteLength };
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Validate that a URL is reachable (HEAD request) */
  async validate(url: string): Promise<boolean> {
    try {
      const response = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const urlDownloader = new URLDownloader();
