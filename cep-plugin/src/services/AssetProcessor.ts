import { ClipboardContent, ImportFolder, ImageMimeType } from '../types';
import { generateTempFilePath, saveBase64ToFile } from '../utils/fileHelpers';
import { mimeTypeFromExtension } from '../utils/imageDetection';
import { hashBase64, hashUrl } from '../utils/hashHelpers';
import { urlDownloader } from './URLDownloader';

export interface ProcessedAsset {
  filePath: string;
  mimeType: ImageMimeType;
  folder: ImportFolder;
  hash: string;
  thumbnail: string; // base64 data-URL for preview
}

export class AssetProcessor {
  async process(content: ClipboardContent): Promise<ProcessedAsset> {
    // Preferred path: an image file already exists on disk
    if (content.filePath) {
      return this.processExistingFile(content);
    }

    // Remote URL — download it
    if (content.type === 'url' && content.url) {
      return this.processUrl(content.url);
    }

    // Legacy fallback: raw base64 image data
    if (
      (content.type === 'image' || content.type === 'screenshot') &&
      content.base64 &&
      content.mimeType
    ) {
      return this.processImageData(content.base64, content.mimeType, content.type);
    }

    throw new Error(`Unsupported clipboard content type: ${content.type}`);
  }

  /** Use a file that already lives on disk (copied file, or PowerShell-saved screenshot). */
  private processExistingFile(content: ClipboardContent): ProcessedAsset {
    const fs = require('fs') as typeof import('fs');
    const filePath = content.filePath!;

    if (!fs.existsSync(filePath)) {
      throw new Error(`Image file no longer available: ${filePath}`);
    }

    const ext = (filePath.split('.').pop() ?? 'png').toLowerCase();
    const mimeType: ImageMimeType = mimeTypeFromExtension(ext) ?? 'image/png';
    const folder: ImportFolder =
      content.type === 'screenshot' ? 'Screenshots'
        : content.source === 'file' ? 'Images'
        : 'Images';

    let thumbnail = '';
    try {
      const buf = fs.readFileSync(filePath);
      thumbnail = `data:${mimeType};base64,${buf.toString('base64')}`;
    } catch {
      thumbnail = '';
    }

    const hash = content.hash ?? hashUrl(filePath + Date.now());

    return { filePath, mimeType, folder, hash, thumbnail };
  }

  private processImageData(
    base64: string,
    mimeType: ImageMimeType,
    sourceType: 'image' | 'screenshot'
  ): ProcessedAsset {
    const hash = hashBase64(base64);
    const folder: ImportFolder = sourceType === 'screenshot' ? 'Screenshots' : 'Images';
    const filePath = generateTempFilePath(mimeType, sourceType === 'screenshot' ? 'screen' : 'img');

    saveBase64ToFile(base64, filePath);

    const thumbnail = `data:${mimeType};base64,${base64}`;

    return { filePath, mimeType, folder, hash, thumbnail };
  }

  private async processUrl(url: string): Promise<ProcessedAsset> {
    const result = await urlDownloader.download(url);

    let thumbnail = '';
    try {
      const fs = require('fs') as typeof import('fs');
      const buf = fs.readFileSync(result.filePath);
      thumbnail = `data:${result.mimeType};base64,${buf.toString('base64')}`;
    } catch {
      thumbnail = '';
    }

    return {
      filePath: result.filePath,
      mimeType: result.mimeType,
      folder: 'Downloads',
      hash: hashUrl(url),
      thumbnail,
    };
  }
}

export const assetProcessor = new AssetProcessor();
