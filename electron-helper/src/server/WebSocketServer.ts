import { WebSocket, WebSocketServer as WsServer } from 'ws';
import { ClipboardData } from '../clipboard/ClipboardParser';

const PORT = 8765;

type OutgoingMessage =
  | { type: 'helper-ready'; version: string }
  | { type: 'clipboard-changed'; content: ClipboardData }
  | { type: 'clipboard-data'; content: ClipboardData }
  | { type: 'download-complete'; requestId: string; filePath: string; mimeType: string }
  | { type: 'download-error'; requestId: string; error: string };

type IncomingMessage =
  | { type: 'get-clipboard' }
  | { type: 'download-url'; url: string; requestId: string }
  | { type: 'start-monitoring'; intervalMs: number }
  | { type: 'stop-monitoring' };

export type DownloadHandler = (url: string, requestId: string, ws: WebSocket) => Promise<void>;

export class WebSocketServer {
  private wss: WsServer;
  private clients = new Set<WebSocket>();
  private onGetClipboard?: () => ClipboardData | null;
  private onDownload?: DownloadHandler;

  constructor() {
    this.wss = new WsServer({ port: PORT, host: '127.0.0.1' });
    this.setup();
    console.log(`[WS] Listening on ws://127.0.0.1:${PORT}`);
  }

  private setup(): void {
    this.wss.on('connection', (ws) => {
      console.log('[WS] Client connected');
      this.clients.add(ws);

      // Greet with version
      this.sendTo(ws, { type: 'helper-ready', version: '1.0.0' });

      // Send current clipboard if available
      const current = this.onGetClipboard?.();
      if (current) {
        this.sendTo(ws, { type: 'clipboard-data', content: current });
      }

      ws.on('message', (raw) => {
        try {
          const msg: IncomingMessage = JSON.parse(raw.toString());
          this.handleMessage(msg, ws);
        } catch (err) {
          console.error('[WS] Bad message', err);
        }
      });

      ws.on('close', () => {
        console.log('[WS] Client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (err) => {
        console.error('[WS] Client error', err);
        this.clients.delete(ws);
      });
    });

    this.wss.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[WS] Port ${PORT} already in use. Is another instance running?`);
        process.exit(1);
      }
      console.error('[WS] Server error', err);
    });
  }

  private handleMessage(msg: IncomingMessage, ws: WebSocket): void {
    if (msg.type === 'get-clipboard') {
      const data = this.onGetClipboard?.();
      if (data) {
        this.sendTo(ws, { type: 'clipboard-data', content: data });
      }
    }

    if (msg.type === 'download-url') {
      this.onDownload?.(msg.url, msg.requestId, ws).catch((err) => {
        this.sendTo(ws, {
          type: 'download-error',
          requestId: msg.requestId,
          error: err?.message ?? 'Download failed',
        });
      });
    }

    // start-monitoring and stop-monitoring are handled by the monitoring loop in main.ts
  }

  broadcastClipboardChange(content: ClipboardData): void {
    const msg: OutgoingMessage = { type: 'clipboard-changed', content };
    this.broadcast(msg);
  }

  sendDownloadResult(ws: WebSocket, requestId: string, filePath: string, mimeType: string): void {
    this.sendTo(ws, { type: 'download-complete', requestId, filePath, mimeType });
  }

  sendDownloadError(ws: WebSocket, requestId: string, error: string): void {
    this.sendTo(ws, { type: 'download-error', requestId, error });
  }

  private broadcast(msg: OutgoingMessage): void {
    const json = JSON.stringify(msg);
    for (const ws of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(json);
      }
    }
  }

  private sendTo(ws: WebSocket, msg: OutgoingMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  setClipboardReader(fn: () => ClipboardData | null): void {
    this.onGetClipboard = fn;
  }

  setDownloadHandler(fn: DownloadHandler): void {
    this.onDownload = fn;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    this.wss.close();
  }
}
