// ─── Clipboard ───────────────────────────────────────────────────────────────

export type ClipboardContentType = 'image' | 'screenshot' | 'url' | 'unknown';

export type ImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'
  | 'image/bmp'
  | 'image/svg+xml';

export type ClipboardSource = 'browser' | 'screenshot' | 'file' | 'unknown';

export interface ClipboardContent {
  type: ClipboardContentType;
  mimeType?: ImageMimeType;
  /** Base64-encoded image data (legacy fallback path) */
  base64?: string;
  /** Absolute path to an image file already on disk (preferred path) */
  filePath?: string;
  /** Remote URL (present when type is 'url') */
  url?: string;
  source: ClipboardSource;
  timestamp: number;
  /** MD5 hash of content for deduplication */
  hash?: string;
}

// ─── Import ───────────────────────────────────────────────────────────────────

export type ImportFolder = 'Images' | 'Screenshots' | 'Downloads';

export interface ImportRequest {
  content: ClipboardContent;
  targetFolder: ImportFolder;
}

export interface ImportResult {
  success: boolean;
  filePath?: string;
  fileName?: string;
  folder?: ImportFolder;
  error?: string;
  isDuplicate?: boolean;
}

// ─── Recent Imports ──────────────────────────────────────────────────────────

export interface RecentImport {
  id: string;
  fileName: string;
  filePath: string;
  type: ClipboardContentType;
  folder: ImportFolder;
  thumbnail: string;
  timestamp: number;
  hash: string;
}

// ─── Notifications ────────────────────────────────────────────────────────────

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface NotificationAction {
  label: string;
  onClick: () => void;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: number;
  duration?: number;
  action?: NotificationAction;
}

// ─── WebSocket Protocol ───────────────────────────────────────────────────────

export interface WsMessageClipboardData {
  type: 'clipboard-data';
  content: ClipboardContent;
}

export interface WsMessageDownloadComplete {
  type: 'download-complete';
  requestId: string;
  filePath: string;
  mimeType: ImageMimeType;
}

export interface WsMessageDownloadError {
  type: 'download-error';
  requestId: string;
  error: string;
}

export interface WsMessageHelperReady {
  type: 'helper-ready';
  version: string;
}

export interface WsMessageClipboardChanged {
  type: 'clipboard-changed';
  content: ClipboardContent;
}

export type WsIncomingMessage =
  | WsMessageClipboardData
  | WsMessageDownloadComplete
  | WsMessageDownloadError
  | WsMessageHelperReady
  | WsMessageClipboardChanged;

export interface WsRequestGetClipboard {
  type: 'get-clipboard';
}

export interface WsRequestDownloadUrl {
  type: 'download-url';
  url: string;
  requestId: string;
}

export interface WsRequestStartMonitoring {
  type: 'start-monitoring';
  intervalMs: number;
}

export interface WsRequestStopMonitoring {
  type: 'stop-monitoring';
}

export type WsOutgoingMessage =
  | WsRequestGetClipboard
  | WsRequestDownloadUrl
  | WsRequestStartMonitoring
  | WsRequestStopMonitoring;

// ─── Settings ─────────────────────────────────────────────────────────────────

export interface PluginSettings {
  autoDetectClipboard: boolean;
  showPreviewBeforeImport: boolean;
  autoImportOnPaste: boolean;
  tempFolderPath: string;
  maxRecentImports: number;
  defaultImportFolder: ImportFolder;
  notificationDuration: number;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  autoDetectClipboard: true,
  showPreviewBeforeImport: false,
  autoImportOnPaste: false,
  tempFolderPath: '',
  maxRecentImports: 20,
  defaultImportFolder: 'Images',
  notificationDuration: 3000,
};

// ─── Connection Status ────────────────────────────────────────────────────────

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';
