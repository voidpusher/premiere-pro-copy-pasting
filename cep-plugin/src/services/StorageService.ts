import { PluginSettings, DEFAULT_SETTINGS, RecentImport } from '../types';

const STORAGE_KEY_SETTINGS = 'instantpaste_settings';
const STORAGE_KEY_RECENT = 'instantpaste_recent';
const MAX_RECENT_DEFAULT = 20;

export class StorageService {
  // ─── Settings ─────────────────────────────────────────────────────────────────

  getSettings(): PluginSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: Partial<PluginSettings>): void {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
  }

  resetSettings(): void {
    localStorage.removeItem(STORAGE_KEY_SETTINGS);
  }

  // ─── Recent Imports ──────────────────────────────────────────────────────────

  getRecentImports(): RecentImport[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_RECENT);
      if (!raw) return [];
      return JSON.parse(raw) as RecentImport[];
    } catch {
      return [];
    }
  }

  addRecentImport(item: RecentImport): void {
    const settings = this.getSettings();
    const maxItems = settings.maxRecentImports ?? MAX_RECENT_DEFAULT;
    let recents = this.getRecentImports();

    // Deduplicate by hash
    recents = recents.filter(r => r.hash !== item.hash);

    // Prepend and trim
    recents = [item, ...recents].slice(0, maxItems);
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recents));
  }

  removeRecentImport(id: string): void {
    const recents = this.getRecentImports().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_RECENT, JSON.stringify(recents));
  }

  clearRecentImports(): void {
    localStorage.removeItem(STORAGE_KEY_RECENT);
  }

  findByHash(hash: string): RecentImport | undefined {
    return this.getRecentImports().find(r => r.hash === hash);
  }
}

export const storageService = new StorageService();
