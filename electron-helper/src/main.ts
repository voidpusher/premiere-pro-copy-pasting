/**
 * Instant Paste — Electron Helper Process
 *
 * Runs as a system-tray application alongside Adobe Premiere Pro.
 * Responsibilities:
 *   1. Monitor clipboard for image/URL changes
 *   2. Serve a WebSocket server on ws://127.0.0.1:8765
 *   3. Download image URLs when requested by the CEP panel
 *   4. Save image data to temp files for Premiere import
 */

import { app, Tray, Menu, nativeImage, clipboard } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import axios from 'axios';
import { WebSocket } from 'ws';

import { ClipboardReader } from './clipboard/ClipboardReader';
import { WebSocketServer } from './server/WebSocketServer';
import { ClipboardData } from './clipboard/ClipboardParser';

// ─── Config ───────────────────────────────────────────────────────────────────

const MONITORING_INTERVAL_MS = 120;
const TEMP_DIR = path.join(os.tmpdir(), 'instant-paste-temp');
const MAX_TEMP_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const VERSION = '1.0.0';

// ─── Setup ───────────────────────────────────────────────────────────────────

function ensureTempDir(): void {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }
}

function cleanupOldTempFiles(): void {
  try {
    const now = Date.now();
    const files = fs.readdirSync(TEMP_DIR);
    for (const file of files) {
      const full = path.join(TEMP_DIR, file);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > MAX_TEMP_AGE_MS) {
          fs.unlinkSync(full);
        }
      } catch {
        // skip
      }
    }
  } catch {
    // skip
  }
}

// ─── Download Handler ─────────────────────────────────────────────────────────

async function downloadImageToTemp(
  url: string,
  requestId: string,
  ws: WebSocket,
  wsServer: WebSocketServer
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 25_000,
      maxContentLength: 50 * 1024 * 1024,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/*,*/*',
      },
    });

    const buffer = Buffer.from(response.data as ArrayBuffer);
    const contentType = (response.headers['content-type'] as string) ?? 'image/png';
    const mimeType = contentType.split(';')[0].trim();

    // Determine extension
    const extMap: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'image/bmp': 'bmp',
      'image/svg+xml': 'svg',
    };
    const ext = extMap[mimeType] ?? 'png';
    const fileName = `url_${requestId}.${ext}`;
    const filePath = path.join(TEMP_DIR, fileName);

    fs.writeFileSync(filePath, buffer);
    wsServer.sendDownloadResult(ws, requestId, filePath, mimeType);

    console.log(`[Main] Downloaded ${url} → ${filePath} (${buffer.length} bytes)`);
  } catch (err: any) {
    const msg = err?.message ?? 'Download failed';
    wsServer.sendDownloadError(ws, requestId, msg);
    console.error(`[Main] Download failed for ${url}:`, msg);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── App Init ─────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Prevent the app from showing in the taskbar/dock
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  ensureTempDir();
  cleanupOldTempFiles();

  // Schedule daily cleanup
  setInterval(cleanupOldTempFiles, 60 * 60 * 1000);

  // ─── Clipboard Reader ────────────────────────────────────────────────────
  const clipboardReader = new ClipboardReader();
  let lastBroadcastedHash = '';

  // ─── WebSocket Server ────────────────────────────────────────────────────
  const wsServer = new WebSocketServer();

  wsServer.setClipboardReader(() => {
    return clipboardReader.read(true);
  });

  wsServer.setDownloadHandler(async (url, requestId, ws) => {
    await downloadImageToTemp(url, requestId, ws, wsServer);
  });

  // ─── Clipboard Monitoring Loop ───────────────────────────────────────────
  let monitoringInterval: ReturnType<typeof setInterval> | null = null;

  function startMonitoring(intervalMs = MONITORING_INTERVAL_MS): void {
    if (monitoringInterval) clearInterval(monitoringInterval);
    monitoringInterval = setInterval(() => {
      if (wsServer.getClientCount() === 0) return;

      const data = clipboardReader.read();
      if (!data) return;
      if (data.hash === lastBroadcastedHash) return;

      lastBroadcastedHash = data.hash;
      wsServer.broadcastClipboardChange(data);
      console.log(`[Main] Clipboard changed: type=${data.type}, source=${data.source}`);
    }, intervalMs);
  }

  startMonitoring();

  // ─── System Tray ────────────────────────────────────────────────────────
  let tray: Tray | null = null;

  try {
    // Use a simple 16x16 blue square as the tray icon
    const iconBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAAHklEQVQ4jWNgGAWDHPz/z8BAgRk1YNSAUQNGwSAAAARaAAGn0RYpAAAAAElFTkSuQmCC',
      'base64'
    );
    const trayIcon = nativeImage.createFromBuffer(iconBuffer);
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: `Instant Paste Helper v${VERSION}`,
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Status: Running',
        enabled: false,
      },
      {
        label: 'Open Temp Folder',
        click: () => {
          const { shell } = require('electron');
          shell.openPath(TEMP_DIR);
        },
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          if (monitoringInterval) clearInterval(monitoringInterval);
          wsServer.close();
          app.quit();
        },
      },
    ]);

    tray.setToolTip(`Instant Paste Helper v${VERSION}`);
    tray.setContextMenu(contextMenu);

    console.log(`[Main] Instant Paste Helper v${VERSION} started`);
    console.log(`[Main] WebSocket server: ws://127.0.0.1:8765`);
    console.log(`[Main] Temp dir: ${TEMP_DIR}`);
  } catch (err) {
    console.error('[Main] Tray setup failed (non-fatal):', err);
  }
});

// Prevent the app from quitting when all windows are closed
app.on('window-all-closed', (e: Event) => {
  e.preventDefault();
});

// Handle IPC-less single instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  console.log('[Main] Another instance is already running. Exiting.');
  app.quit();
}
