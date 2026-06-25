import { ImportFolder, ImportResult, RecentImport } from '../types';
import { ProcessedAsset } from './AssetProcessor';
import { storageService } from './StorageService';
import { shortId } from '../utils/hashHelpers';
import * as path from 'path';

declare const CSInterface: any;

/**
 * Bridge to ExtendScript (hostScript.jsx) inside Premiere Pro.
 * All Premiere DOM API calls go through evalScript().
 */
export class ImportService {
  private csInterface: any;

  constructor() {
    // CSInterface is injected by CEP runtime as a global
    try {
      this.csInterface = new CSInterface();
    } catch {
      console.warn('[ImportService] CSInterface not available – running outside CEP?');
      this.csInterface = null;
    }
  }

  /** Pre-enable Premiere's QE DOM at startup so track-creation later doesn't zoom the timeline mid-edit. */
  initHost(): void {
    if (!this.csInterface) return;
    try {
      this.csInterface.evalScript('initHost()', () => { /* fire-and-forget */ });
    } catch {
      /* non-fatal */
    }
  }

  async importAsset(asset: ProcessedAsset, force = false): Promise<ImportResult> {
    if (!this.csInterface) {
      return { success: false, error: 'Not running inside Adobe Premiere Pro' };
    }

    // Deduplicate check — skipped when the user explicitly triggers a paste
    if (!force) {
      const existing = storageService.findByHash(asset.hash);
      if (existing) {
        return {
          success: true,
          filePath: existing.filePath,
          fileName: existing.fileName,
          folder: existing.folder as ImportFolder,
          isDuplicate: true,
        };
      }
    }

    return new Promise<ImportResult>((resolve) => {
      const filePath = asset.filePath.replace(/\\/g, '/');
      const folder = asset.folder;
      const script = `importFileToProject("${filePath}", "${folder}")`;

      this.csInterface.evalScript(script, (result: string) => {
        if (!result || result === 'undefined' || result.startsWith('ERROR:')) {
          resolve({
            success: false,
            error: result?.replace('ERROR:', '').trim() ?? 'Unknown import error',
          });
          return;
        }

        try {
          const parsed = JSON.parse(result) as { success: boolean; fileName: string; error?: string };
          if (parsed.success) {
            const recentItem: RecentImport = {
              id: shortId(),
              fileName: parsed.fileName,
              filePath: asset.filePath,
              type: asset.folder === 'Screenshots' ? 'screenshot' : asset.folder === 'Downloads' ? 'url' : 'image',
              folder: asset.folder,
              thumbnail: asset.thumbnail,
              timestamp: Date.now(),
              hash: asset.hash,
            };
            storageService.addRecentImport(recentItem);

            resolve({
              success: true,
              filePath: asset.filePath,
              fileName: parsed.fileName,
              folder: asset.folder,
            });
          } else {
            resolve({ success: false, error: parsed.error ?? 'Import failed' });
          }
        } catch {
          resolve({ success: false, error: `Unexpected response: ${result}` });
        }
      });
    });
  }

  /** Check that the project is open and importable */
  async isProjectOpen(): Promise<boolean> {
    if (!this.csInterface) return false;
    return new Promise<boolean>((resolve) => {
      this.csInterface.evalScript('isProjectOpen()', (result: string) => {
        resolve(result === 'true');
      });
    });
  }

  /** Force-import even if duplicate */
  async reimportAsset(asset: ProcessedAsset): Promise<ImportResult> {
    storageService.removeRecentImport(
      storageService.findByHash(asset.hash)?.id ?? ''
    );
    return this.importAsset(asset);
  }
}

export const importService = new ImportService();
