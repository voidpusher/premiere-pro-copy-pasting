import { clipboard, nativeImage } from 'electron';
import * as crypto from 'crypto';
import { ClipboardData } from './ClipboardParser';

const IMAGE_URL_RE = /^https?:\/\/.+\.(png|jpe?g|webp|gif|bmp|svg)(\?[^\s]*)?$/i;
const GENERIC_URL_RE = /^https?:\/\/[^\s]+$/i;

export class ClipboardReader {
  private lastHash = '';

  /**
   * Read current clipboard state. Returns null if content unchanged.
   */
  read(forceRead = false): ClipboardData | null {
    try {
      const data = this.readRaw();
      if (!data) return null;

      const hash = this.hashData(data);
      if (!forceRead && hash === this.lastHash) return null;
      this.lastHash = hash;

      return { ...data, hash };
    } catch (err) {
      console.error('[ClipboardReader] read error', err);
      return null;
    }
  }

  private readRaw(): Omit<ClipboardData, 'hash'> | null {
    const formats = clipboard.availableFormats();

    // ── Image data (includes screenshots and browser-copied images) ──────────
    if (this.hasImageFormat(formats)) {
      const img = clipboard.readImage();
      if (!img.isEmpty()) {
        const pngBuffer = img.toPNG();
        if (pngBuffer.length === 0) return null;

        const source = this.detectSource(formats);
        return {
          type: source === 'screenshot' ? 'screenshot' : 'image',
          mimeType: 'image/png',
          base64: pngBuffer.toString('base64'),
          source,
          timestamp: Date.now(),
        };
      }
    }

    // ── Text (URL or plain text) ────────────────────────────────────────────
    const text = clipboard.readText()?.trim();
    if (text && text.length > 0 && text.length < 4096) {
      if (IMAGE_URL_RE.test(text) || GENERIC_URL_RE.test(text)) {
        return {
          type: 'url',
          url: text,
          source: 'unknown',
          timestamp: Date.now(),
        };
      }
    }

    return null;
  }

  private hasImageFormat(formats: string[]): boolean {
    return formats.some(f =>
      f === 'image/png' ||
      f === 'image/jpeg' ||
      f === 'image/bmp' ||
      f === 'image/gif' ||
      // Windows clipboard uses CF_BITMAP / CF_DIB
      f === 'CF_DIB' ||
      f === 'CF_BITMAP' ||
      f.startsWith('image/')
    );
  }

  private detectSource(formats: string[]): 'screenshot' | 'browser' | 'file' | 'unknown' {
    // Browser copy: usually ships with HTML and image data together
    if (formats.some(f => f === 'text/html' || f.includes('HTML Format'))) {
      return 'browser';
    }
    // Windows screenshot: CF_DIB without HTML
    if (process.platform === 'win32') {
      if (formats.some(f => f === 'CF_DIB' || f === 'CF_BITMAP' || f === 'Bitmap')) {
        return 'screenshot';
      }
    }
    // macOS screenshot: public.tiff or com.apple.pict
    if (process.platform === 'darwin') {
      if (formats.some(f =>
        f === 'public.tiff' ||
        f === 'com.apple.pict' ||
        f === 'Apple PDF pasteboard type'
      )) {
        return 'screenshot';
      }
    }
    return 'unknown';
  }

  private hashData(data: Omit<ClipboardData, 'hash'>): string {
    const content = data.base64 ?? data.url ?? '';
    return crypto.createHash('md5').update(content).digest('hex');
  }

  resetHash(): void {
    this.lastHash = '';
  }
}
