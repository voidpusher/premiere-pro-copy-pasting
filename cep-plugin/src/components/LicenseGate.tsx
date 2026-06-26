import React, { useState, useCallback, useEffect } from 'react';
import { LICENSE_CONFIG } from '../config';
import '../styles/LicenseGate.css';

declare const CSInterface: any;

function openExternal(url: string): void {
  try {
    const cs = new CSInterface();
    cs.openURLInDefaultBrowser(url);
  } catch {
    try { window.open(url, '_blank'); } catch { /* ignore */ }
  }
}

interface LicenseGateProps {
  busy: boolean;
  startLogin: (email: string) => Promise<{ ok: boolean; reqId?: string; error?: string }>;
  verifyCode: (reqId: string, code: string) => Promise<{ ok: boolean; error?: string }>;
  startPolling: (reqId: string) => void;
  stopPolling: () => void;
}

export const LicenseGate: React.FC<LicenseGateProps> = ({
  busy, startLogin, verifyCode, startPolling, stopPolling,
}) => {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [reqId, setReqId] = useState('');
  const [error, setError] = useState<string | undefined>();

  // While on the code step, poll for the magic-link click in the background
  useEffect(() => {
    if (step === 'code' && reqId) {
      startPolling(reqId);
      return () => stopPolling();
    }
  }, [step, reqId, startPolling, stopPolling]);

  const submitEmail = useCallback(async () => {
    setError(undefined);
    const r = await startLogin(email);
    if (r.ok && r.reqId) {
      setReqId(r.reqId);
      setStep('code');
    } else {
      setError(r.error ?? 'Could not send the code.');
    }
  }, [email, startLogin]);

  const submitCode = useCallback(async () => {
    setError(undefined);
    const r = await verifyCode(reqId, code);
    if (!r.ok) setError(r.error ?? 'Verification failed.');
    // On success the parent flips to the licensed view automatically.
  }, [reqId, code, verifyCode]);

  const backToEmail = useCallback(() => {
    stopPolling();
    setStep('email');
    setCode('');
    setError(undefined);
  }, [stopPolling]);

  return (
    <div className="license-gate">
      <div className="license-card">
        <div className="license-logo">
          <svg viewBox="0 0 28 28" fill="none">
            <rect x="4" y="4" width="20" height="20" rx="5" fill="#4f86f7" opacity="0.18" />
            <path d="M9 14h10M14 9v10" stroke="#4f86f7" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>

        {step === 'email' && (
          <>
            <h1 className="license-title">Sign in to Instant Paste</h1>
            <p className="license-sub">{LICENSE_CONFIG.PRICE_LABEL}</p>

            <label className="license-label" htmlFor="email">Email used at purchase</label>
            <input
              id="email"
              className={`license-input ${error ? 'license-input--error' : ''}`}
              type="email"
              placeholder="you@example.com"
              value={email}
              autoFocus
              spellCheck={false}
              disabled={busy}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) submitEmail(); }}
            />

            {error && <div className="license-error">{error}</div>}

            <button className="license-btn license-btn--primary" onClick={submitEmail} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send sign-in code'}
            </button>

            <button
              className="license-btn license-btn--ghost"
              onClick={() => openExternal(LICENSE_CONFIG.BUY_URL)}
              disabled={busy}
            >
              Don’t have a license? Buy for {LICENSE_CONFIG.PRICE_LABEL.split('·')[0].trim()}
            </button>
          </>
        )}

        {step === 'code' && (
          <>
            <h1 className="license-title">Check your email</h1>
            <p className="license-sub">
              We sent a code &amp; an activation link to<br /><strong>{email}</strong>
            </p>

            <label className="license-label" htmlFor="code">Enter the 6-digit code</label>
            <input
              id="code"
              className={`license-input license-input--code ${error ? 'license-input--error' : ''}`}
              type="text"
              inputMode="numeric"
              placeholder="• • • • • •"
              value={code}
              autoFocus
              maxLength={6}
              disabled={busy}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) submitCode(); }}
            />

            {error && <div className="license-error">{error}</div>}

            <button className="license-btn license-btn--primary" onClick={submitCode} disabled={busy || code.length < 6}>
              {busy ? 'Verifying…' : 'Verify & activate'}
            </button>

            <p className="license-hint-line">
              …or just click <strong>“Activate in Premiere”</strong> in the email — this unlocks automatically.
            </p>

            <button className="license-btn license-btn--ghost" onClick={backToEmail} disabled={busy}>
              Use a different email
            </button>
          </>
        )}

        <p className="license-help">
          Trouble signing in? Email{' '}
          <span className="license-link" onClick={() => openExternal(`mailto:${LICENSE_CONFIG.SUPPORT_EMAIL}`)}>
            {LICENSE_CONFIG.SUPPORT_EMAIL}
          </span>
        </p>
      </div>
    </div>
  );
};
