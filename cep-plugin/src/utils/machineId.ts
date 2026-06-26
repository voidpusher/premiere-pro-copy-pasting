/**
 * machineId — a stable, hardware-derived identifier for this computer.
 *
 * Uses the SMBIOS UUID (motherboard-tied, survives Windows reinstalls). Falls
 * back to the Windows MachineGuid, then to a persisted random id if neither is
 * available. The result is hashed so the raw hardware id never leaves the machine.
 */

let cp: typeof import('child_process') | null = null;
let crypto: typeof import('crypto') | null = null;

try { cp = require('child_process'); } catch { /* browser */ }
try { crypto = require('crypto'); } catch { /* browser */ }

const MID_STORAGE_KEY = 'instantpaste_mid_v1';

// PowerShell: prefer the SMBIOS UUID; if it's missing/blank, use MachineGuid.
const PS_COMMAND =
  "$u=(Get-CimInstance -ClassName Win32_ComputerSystemProduct).UUID; " +
  "if (-not $u -or $u -match '^[F0\\-]+$') { " +
  "$u=(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Cryptography' -Name MachineGuid -ErrorAction SilentlyContinue).MachineGuid } " +
  "Write-Output $u";

export async function getMachineId(): Promise<string> {
  // Cached value (also keeps startup fast)
  try {
    const cached = localStorage.getItem(MID_STORAGE_KEY);
    if (cached) return cached;
  } catch { /* ignore */ }

  let raw = '';
  try { raw = await readHardwareId(); } catch { /* ignore */ }

  if (!raw) {
    // Last-resort persistent fallback (less ideal — won't survive a reinstall)
    raw = 'fallback-' + Math.random().toString(36).slice(2) + '-' + Date.now();
  }

  const id = hash(raw.trim()).slice(0, 32);
  try { localStorage.setItem(MID_STORAGE_KEY, id); } catch { /* ignore */ }
  return id;
}

function readHardwareId(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!cp) return reject(new Error('child_process unavailable'));
    cp.execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS_COMMAND],
      { windowsHide: true, timeout: 8000 },
      (err: any, stdout: string) => {
        if (err) return reject(err);
        resolve((stdout || '').trim());
      }
    );
  });
}

function hash(s: string): string {
  if (crypto) return crypto.createHash('sha256').update(s).digest('hex');
  // Tiny fallback hash for non-Node contexts
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(16).padStart(8, '0');
}
