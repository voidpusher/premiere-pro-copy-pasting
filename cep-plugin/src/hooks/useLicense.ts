import { useState, useEffect, useCallback, useRef } from 'react';
import { licenseService, LicenseStatus } from '../services/LicenseService';

export interface UseLicenseReturn {
  status: LicenseStatus;
  email?: string;
  busy: boolean;
  /** Step 1 — request a code + magic link by email. Returns a reqId on success. */
  startLogin: (email: string) => Promise<{ ok: boolean; reqId?: string; error?: string }>;
  /** Step 2a — verify the typed 6-digit code. */
  verifyCode: (reqId: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  /** Step 2b — begin polling for the magic-link click; auto-unlocks when clicked. */
  startPolling: (reqId: string) => void;
  stopPolling: () => void;
  logout: () => void;
}

const POLL_INTERVAL_MS = 3000;

export function useLicense(): UseLicenseReturn {
  const [status, setStatus] = useState<LicenseStatus>('checking');
  const [email, setEmail] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let active = true;
    licenseService.revalidate().then((s) => {
      if (!active) return;
      setStatus(s);
      setEmail(licenseService.getEmail());
    });
    return () => {
      active = false;
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  const onLoggedIn = useCallback(() => {
    setStatus('licensed');
    setEmail(licenseService.getEmail());
  }, []);

  const startLogin = useCallback(async (addr: string) => {
    setBusy(true);
    const r = await licenseService.startLogin(addr);
    setBusy(false);
    return r;
  }, []);

  const verifyCode = useCallback(async (reqId: string, code: string) => {
    setBusy(true);
    const r = await licenseService.verifyCode(reqId, code);
    setBusy(false);
    if (r.ok) onLoggedIn();
    return r;
  }, [onLoggedIn]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) { clearInterval(pollTimer.current); pollTimer.current = null; }
  }, []);

  const startPolling = useCallback((reqId: string) => {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      const r = await licenseService.pollLogin(reqId);
      if (r.ok) { stopPolling(); onLoggedIn(); }
    }, POLL_INTERVAL_MS);
  }, [stopPolling, onLoggedIn]);

  const logout = useCallback(() => {
    stopPolling();
    licenseService.logout();
    setEmail(undefined);
    setStatus('unlicensed');
  }, [stopPolling]);

  return { status, email, busy, startLogin, verifyCode, startPolling, stopPolling, logout };
}
