import { ImageMimeType } from '../types';

const IMAGE_EXTENSIONS: Record<string, ImageMimeType> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
};

const IMAGE_MIME_TYPES: ImageMimeType[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/svg+xml',
];

/** Direct image URL (ends in image extension, optionally with query params) */
const DIRECT_IMAGE_URL_RE =
  /^https?:\/\/.+\.(png|jpe?g|webp|gif|bmp|svg)(\?[^\s]*)?$/i;

/** CDN or generic URL that likely serves an image */
const CDN_URL_PATTERNS = [
  /images\./i,
  /img\./i,
  /cdn\./i,
  /static\./i,
  /media\./i,
  /assets\./i,
  /upload/i,
  /photo/i,
  /picture/i,
  /thumb/i,
];

export function isDirectImageUrl(url: string): boolean {
  return DIRECT_IMAGE_URL_RE.test(url.trim());
}

export function isProbableImageUrl(url: string): boolean {
  if (isDirectImageUrl(url)) return true;
  try {
    const parsed = new URL(url.trim());
    return CDN_URL_PATTERNS.some(re => re.test(parsed.hostname + parsed.pathname));
  } catch {
    return false;
  }
}

export function mimeTypeFromExtension(ext: string): ImageMimeType | null {
  return IMAGE_EXTENSIONS[ext.toLowerCase()] ?? null;
}

export function mimeTypeFromUrl(url: string): ImageMimeType | null {
  try {
    const pathname = new URL(url).pathname;
    const ext = pathname.split('.').pop()?.split('?')[0] ?? '';
    return mimeTypeFromExtension(ext);
  } catch {
    return null;
  }
}

export function isSupportedMimeType(mime: string): mime is ImageMimeType {
  return IMAGE_MIME_TYPES.includes(mime as ImageMimeType);
}

/** Detect image format from the first bytes of a buffer (magic bytes) */
export function detectMimeTypeFromBuffer(buffer: Buffer): ImageMimeType | null {
  if (buffer.length < 4) return null;

  const b0 = buffer[0];
  const b1 = buffer[1];
  const b2 = buffer[2];
  const b3 = buffer[3];

  // PNG: 89 50 4E 47
  if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47) return 'image/png';

  // JPEG: FF D8 FF
  if (b0 === 0xff && b1 === 0xd8 && b2 === 0xff) return 'image/jpeg';

  // GIF: 47 49 46 38
  if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46 && b3 === 0x38) return 'image/gif';

  // BMP: 42 4D
  if (b0 === 0x42 && b1 === 0x4d) return 'image/bmp';

  // WEBP: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    b0 === 0x52 && b1 === 0x49 && b2 === 0x46 && b3 === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

export function extensionFromMimeType(mime: ImageMimeType): string {
  const map: Record<ImageMimeType, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg',
  };
  return map[mime] ?? 'png';
}
