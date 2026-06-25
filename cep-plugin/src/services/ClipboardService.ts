/**
 * ClipboardService — self-contained clipboard monitor using PowerShell.
 *
 * Spawns a long-running PowerShell process that polls the Windows clipboard
 * every 400 ms and handles three sources, in priority order:
 *
 *   1. Image FILES copied in Explorer (CF_HDROP) — emitted by original path
 *   2. Bitmap images (screenshots, browser-copied images) — saved to a PNG temp file
 *   3. Direct image URLs in clipboard text
 *
 * Each detection is written to stdout as a single pipe-delimited line:
 *
 *   IMG|<md5hash>|<source:screenshot|browser|file>|<absolute-file-path>
 *   URL|<md5hash>||<url>
 *
 * Everything runs inside the CEP panel's own Node.js runtime — no Electron
 * helper, no WebSocket, nothing for the user to install or start.
 */

import { ClipboardContent, ConnectionStatus } from '../types';
import { isProbableImageUrl } from '../utils/imageDetection';
import { hashUrl } from '../utils/hashHelpers';

// ─── Lazy Node.js requires (absent in browser-preview mode) ──────────────────
let cp:    typeof import('child_process') | null = null;
let pathM: typeof import('path')          | null = null;
let osM:   typeof import('os')            | null = null;
let fsM:   typeof import('fs')            | null = null;

try { cp    = require('child_process'); } catch { /* browser */ }
try { pathM = require('path');          } catch { /* browser */ }
try { osM   = require('os');            } catch { /* browser */ }
try { fsM   = require('fs');            } catch { /* browser */ }

// ─── Types ────────────────────────────────────────────────────────────────────
type ClipboardListener = (content: ClipboardContent) => void;
type StatusListener    = (status: ConnectionStatus)  => void;

// ─── PowerShell monitor script ────────────────────────────────────────────────
// NOTE: every regex backslash is doubled here because this is a JS template
// literal — `\\.` becomes `\.` in the emitted .ps1 file.
const PS_MONITOR_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$tempDir = [System.IO.Path]::Combine($env:TEMP, "instant-paste-temp")
if (-not (Test-Path $tempDir)) { [System.IO.Directory]::CreateDirectory($tempDir) | Out-Null }

$lastHash = ""
$imgExt   = @(".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff")
$urlRe    = [regex]"^https?://.+\\.(png|jpe?g|webp|gif|bmp|svg)(\\?[^\\s]*)?$"

function Get-BytesHash([byte[]]$b) {
    $md5 = [System.Security.Cryptography.MD5]::Create()
    $h   = $md5.ComputeHash($b)
    $md5.Dispose()
    return ([System.BitConverter]::ToString($h)).Replace("-", "").ToLower()
}
function Get-StrHash([string]$s) {
    return Get-BytesHash ([System.Text.Encoding]::UTF8.GetBytes($s))
}
function Emit([string]$line) {
    Write-Output $line
    [Console]::Out.Flush()
}

while ($true) {
    try {
        $handled = $false

        # ── 1. Image files copied in Explorer (CF_HDROP) ──────────────────────
        $files = $null
        try { $files = [System.Windows.Forms.Clipboard]::GetFileDropList() } catch {}
        if ($files -and $files.Count -gt 0) {
            foreach ($f in $files) {
                $ext = [System.IO.Path]::GetExtension($f).ToLower()
                if (($imgExt -contains $ext) -and ([System.IO.File]::Exists($f))) {
                    $fi = New-Object System.IO.FileInfo($f)
                    $h  = Get-StrHash ($f + "|" + $fi.Length)
                    if ($h -ne $lastHash) {
                        $lastHash = $h
                        Emit ("IMG|" + $h + "|file|" + $f)
                    }
                    $handled = $true
                    break
                }
            }
        }

        # ── 2. Bitmap image (screenshots, browser-copied images) ──────────────
        if (-not $handled) {
            $img = $null
            try { $img = [System.Windows.Forms.Clipboard]::GetImage() } catch {}
            if ($img -ne $null) {
                $ms = New-Object System.IO.MemoryStream
                $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
                $bytes = $ms.ToArray()
                $ms.Dispose()
                $img.Dispose()

                $h = Get-BytesHash $bytes
                if ($h -ne $lastHash) {
                    $lastHash = $h

                    $src = "screenshot"
                    try {
                        $do   = [System.Windows.Forms.Clipboard]::GetDataObject()
                        $fmts = $do.GetFormats()
                        if (($fmts -contains "HTML Format") -or ($fmts -contains "text/html")) {
                            $src = "browser"
                        }
                    } catch {}

                    $fp = [System.IO.Path]::Combine($tempDir, "clip_" + $h.Substring(0, 8) + ".png")
                    [System.IO.File]::WriteAllBytes($fp, $bytes)
                    Emit ("IMG|" + $h + "|" + $src + "|" + $fp)
                }
                $handled = $true
            }
        }

        # ── 3. Direct image URL in clipboard text ─────────────────────────────
        if (-not $handled) {
            $text = $null
            try { $text = [System.Windows.Forms.Clipboard]::GetText() } catch {}
            if ($text -and $text.Length -gt 0 -and $text.Length -lt 4096) {
                $t = $text.Trim()
                if ($urlRe.IsMatch($t)) {
                    $h = Get-StrHash $t
                    if ($h -ne $lastHash) {
                        $lastHash = $h
                        Emit ("URL|" + $h + "||" + $t)
                    }
                }
            }
        }
    } catch {}

    Start-Sleep -Milliseconds 400
}
`.trimStart();

// ─── ClipboardService ─────────────────────────────────────────────────────────

export class ClipboardService {
  private psProcess: any                          = null;
  private buffer                                  = '';
  private clipboardListeners: ClipboardListener[] = [];
  private statusListeners:    StatusListener[]    = [];
  private status: ConnectionStatus                = 'disconnected';
  private lastHash                                = '';
  private latest: ClipboardContent | null         = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped                                 = false;

  constructor() {
    this.connect();
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.destroy());
    }
  }

  // ─── Spawning the monitor ────────────────────────────────────────────────────

  private getScriptPath(): string {
    if (!pathM || !osM || !fsM) return '';
    const dir = pathM.join(osM.tmpdir(), 'instant-paste-temp');
    if (!fsM.existsSync(dir)) fsM.mkdirSync(dir, { recursive: true });
    const p = pathM.join(dir, 'cb-monitor.ps1');
    fsM.writeFileSync(p, PS_MONITOR_SCRIPT, 'utf8');
    return p;
  }

  private connect(): void {
    if (this.stopped) return;
    if (!cp) { this.setStatus('error'); return; }   // browser-preview — no spawn

    this.setStatus('connecting');
    this.buffer = '';

    const scriptPath = this.getScriptPath();
    if (!scriptPath) { this.setStatus('error'); return; }

    try {
      this.psProcess = cp.spawn('powershell.exe', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle', 'Hidden',
        '-File', scriptPath,
      ], {
        stdio:       ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });

      const startupTimeout = setTimeout(() => {
        if (this.status === 'connecting') this.setStatus('connected');
      }, 1500);

      this.psProcess.stdout?.on('data', (chunk: Buffer) => {
        clearTimeout(startupTimeout);
        if (this.status !== 'connected') this.setStatus('connected');

        this.buffer += chunk.toString('utf8');
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (t) this.parseLine(t);
        }
      });

      this.psProcess.on('error', () => {
        clearTimeout(startupTimeout);
        this.setStatus('error');
      });

      this.psProcess.on('exit', () => {
        clearTimeout(startupTimeout);
        if (!this.stopped) this.scheduleRestart();
      });

    } catch {
      this.setStatus('error');
    }
  }

  private scheduleRestart(): void {
    if (this.restartTimer) return;
    this.setStatus('connecting');
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      this.connect();
    }, 2000);
  }

  // ─── Parsing monitor output ──────────────────────────────────────────────────

  private parseLine(line: string): void {
    // Format: TYPE|hash|source|data   (source empty for URLs; data may contain |)
    const firstBar  = line.indexOf('|');
    if (firstBar < 0) return;
    const msgType   = line.slice(0, firstBar);
    const rest      = line.slice(firstBar + 1);

    const secondBar = rest.indexOf('|');
    if (secondBar < 0) return;
    const hash      = rest.slice(0, secondBar);
    const rest2     = rest.slice(secondBar + 1);

    const thirdBar  = rest2.indexOf('|');
    if (thirdBar < 0) return;
    const source    = rest2.slice(0, thirdBar);
    const data      = rest2.slice(thirdBar + 1);   // full remainder — preserves any '|'

    if (!hash || !data) return;
    if (hash === this.lastHash) return;
    this.lastHash = hash;

    let content: ClipboardContent | null = null;

    if (msgType === 'IMG') {
      content = {
        type:      source === 'screenshot' ? 'screenshot' : 'image',
        filePath:  data,
        source:    (source || 'unknown') as ClipboardContent['source'],
        timestamp: Date.now(),
        hash,
      };
    } else if (msgType === 'URL') {
      content = {
        type:      'url',
        url:       data,
        source:    'unknown',
        timestamp: Date.now(),
        hash,
      };
    }

    if (content) {
      this.latest = content;
      this.clipboardListeners.forEach(fn => fn(content!));
    }
  }

  private setStatus(s: ConnectionStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.statusListeners.forEach(fn => fn(s));
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** The poller already streams changes; re-emit the latest if a listener asks. */
  requestClipboard(): void {
    if (this.latest) {
      this.clipboardListeners.forEach(fn => fn(this.latest!));
    }
  }

  /** The most recent clipboard content the monitor has seen, if any. */
  getLatest(): ClipboardContent | null {
    return this.latest;
  }

  onClipboardChange(fn: ClipboardListener): () => void {
    this.clipboardListeners.push(fn);
    return () => { this.clipboardListeners = this.clipboardListeners.filter(l => l !== fn); };
  }

  onStatusChange(fn: StatusListener): () => void {
    this.statusListeners.push(fn);
    return () => { this.statusListeners = this.statusListeners.filter(l => l !== fn); };
  }

  getStatus(): ConnectionStatus { return this.status; }

  /** No-op stub — URLDownloader uses Node.js http directly. */
  downloadUrl(_url: string): Promise<string> {
    return Promise.reject(new Error('Use URLDownloader'));
  }

  parseTextForImageUrl(text: string): ClipboardContent | null {
    const trimmed = text.trim();
    if (isProbableImageUrl(trimmed)) {
      return { type: 'url', url: trimmed, source: 'unknown', timestamp: Date.now(), hash: hashUrl(trimmed) };
    }
    return null;
  }

  destroy(): void {
    this.stopped = true;
    this.setStatus('disconnected');
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null; }
    if (this.psProcess) { try { this.psProcess.kill(); } catch {} this.psProcess = null; }
    this.clipboardListeners = [];
    this.statusListeners    = [];
  }
}

export const clipboardService = new ClipboardService();
