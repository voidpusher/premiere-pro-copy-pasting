export type ClipboardDataType = 'image' | 'screenshot' | 'url' | 'unknown';
export type ClipboardSource = 'browser' | 'screenshot' | 'file' | 'unknown';
export type ImageMimeType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'image/bmp' | 'image/svg+xml';

export interface ClipboardData {
  type: ClipboardDataType;
  mimeType?: ImageMimeType;
  base64?: string;
  url?: string;
  source: ClipboardSource;
  timestamp: number;
  hash: string;
}

const IMAGE_URL_RE = /^https?:\/\/.+\.(png|jpe?g|webp|gif|bmp|svg)(\?[^\s]*)?$/i;

export class ClipboardParser {
  isImageData(data: ClipboardData): boolean {
    return data.type === 'image' || data.type === 'screenshot';
  }

  isImageUrl(data: ClipboardData): boolean {
    if (data.type !== 'url' || !data.url) return false;
    return IMAGE_URL_RE.test(data.url);
  }

  isGenericUrl(data: ClipboardData): boolean {
    return data.type === 'url' && !!data.url;
  }

  getDisplayLabel(data: ClipboardData): string {
    if (data.type === 'screenshot') return 'Screenshot';
    if (data.type === 'image') return 'Browser Image';
    if (data.type === 'url') return 'Image URL';
    return 'Unknown';
  }
}

export const clipboardParser = new ClipboardParser();
